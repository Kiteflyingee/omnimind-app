import os
import json
import asyncio
from typing import List, Optional
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import openai
from dotenv import load_dotenv

from config_loader import load_config
from db import DBService
from formula import FormulaService

# Load environment variables from .env.local
load_dotenv(dotenv_path="../.env.local")

app = FastAPI()

# Add CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development, allow all
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
config = load_config()
db_service = DBService(os.path.join("..", config["storage"]["sqlite_path"]))
formula_service = FormulaService(
    config["models"]["advanced"]["base_url"],
    config["models"]["advanced"]["api_key"]
)

class ChatRequest(BaseModel):
    message: str
    sessionId: str
    image: Optional[str] = None
    reasoning: Optional[bool] = True

@app.post("/chat")
async def chat(request: ChatRequest):
    async def event_generator():
        try:
            # 1. Prepare context (Simplified for now, skipping memory extraction for speed)
            system_prompt = "你是 OmniMind，由 Moonshot AI 提供的人工智能助手。你具备长效记忆能力。"
            history = db_service.get_history(request.sessionId)
            
            user_msg_content = request.message
            if request.image:
                user_msg_content = [
                    {"type": "image_url", "image_url": {"url": request.image}},
                    {"type": "text", "text": request.message or "描述图片"}
                ]
            
            current_messages = [
                {"role": "system", "content": system_prompt},
                *history,
                {"role": "user", "content": user_msg_content}
            ]
            
            # Save user message
            db_service.save_message(
                request.sessionId, 
                "user", 
                f"[Image] {request.message}" if request.image else request.message
            )
            
            available_tools = await formula_service.get_tools()
            
            iteration = 0
            max_iterations = 10
            
            client = openai.AsyncOpenAI(
                api_key=config["models"]["advanced"]["api_key"],
                base_url=config["models"]["advanced"]["base_url"]
            )
            
            while iteration < max_iterations:
                iteration += 1
                
                # Defensive cleaning (Crucial for tool_call_id not found)
                request_messages = []
                for m in current_messages:
                    clean_m = {"role": m["role"], "content": m.get("content")}
                    if m["role"] == "assistant":
                        has_tools = bool(m.get("tool_calls"))
                        clean_m["content"] = m.get("content") or (None if has_tools else "")
                        clean_m["reasoning_content"] = m.get("reasoning_content") or \
                            ("Thought process restored." if has_tools else "Thinking...")
                        if has_tools:
                            clean_m["tool_calls"] = m["tool_calls"]
                    elif m["role"] == "tool":
                        clean_m["tool_call_id"] = m["tool_call_id"]
                        clean_m["name"] = m.get("name")
                    request_messages.append(clean_m)

                # Call Model
                completion_args = {
                    "model": config["models"]["advanced"]["name"],
                    "messages": request_messages,
                    "stream": True,
                    "tools": available_tools,
                    "temperature": 1.0,
                    "max_tokens": 32768,
                }
                if request.reasoning is False:
                    completion_args["thinking"] = {"type": "disabled"}

                response = await client.chat.completions.create(**completion_args)
                
                current_thought = ""
                current_content = ""
                tool_calls_map = {}
                
                async for chunk in response:
                    delta = chunk.choices[0].delta
                    
                    if hasattr(delta, "reasoning_content") and delta.reasoning_content:
                        current_thought += delta.reasoning_content
                        yield f"t:{delta.reasoning_content}"
                        
                    if delta.content:
                        current_content += delta.content
                        yield f"c:{delta.content}"
                        
                    if delta.tool_calls:
                        for tc in delta.tool_calls:
                            if tc.index not in tool_calls_map:
                                tool_calls_map[tc.index] = {
                                    "id": "",
                                    "type": "function",
                                    "function": {"name": "", "arguments": ""}
                                }
                            target = tool_calls_map[tc.index]
                            if tc.id: target["id"] += tc.id
                            if tc.function.name: target["function"]["name"] += tc.function.name
                            if tc.function.arguments: target["function"]["arguments"] += tc.function.arguments

                tool_calls = list(tool_calls_map.values())
                
                if tool_calls:
                    # Execute Tools
                    tool_names = ", ".join([tc["function"]["name"] for tc in tool_calls])
                    yield f"s:📌 正在执行: {tool_names}..."
                    
                    assistant_msg = {
                        "role": "assistant",
                        "content": current_content or None,
                        "reasoning_content": current_thought or "Analyzing...",
                        "tool_calls": tool_calls
                    }
                    db_service.save_message(
                        request.sessionId, "assistant", 
                        assistant_msg["content"], assistant_msg["reasoning_content"], tool_calls
                    )
                    current_messages.append(assistant_msg)
                    
                    for tc in tool_calls:
                        try:
                            args = json.loads(tc["function"]["arguments"])
                            result = await formula_service.call_tool(tc["function"]["name"], args)
                            meta = json.dumps({"id": tc["id"], "name": tc["function"]["name"]})
                            db_service.save_message(request.sessionId, "tool", str(result), meta)
                            current_messages.append({
                                "role": "tool",
                                "tool_call_id": tc["id"],
                                "name": tc["function"]["name"],
                                "content": str(result)
                            })
                        except Exception as e:
                            yield f"c:\n[Tool Error: {str(e)}]\n"
                            db_service.save_message(request.sessionId, "tool", f"Error: {str(e)}", tc["id"])

                else:
                    # Final Answer
                    db_service.save_message(
                        request.sessionId, "assistant", current_content, current_thought
                    )
                    break
                    
        except Exception as e:
            yield f"c:\n[Backend Error: {str(e)}]\n"

    return StreamingResponse(event_generator(), media_type="text/plain")

@app.get("/rules")
async def get_rules():
    try:
        rules = db_service.get_hard_rules()
        return rules
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class RuleDeleteRequest(BaseModel):
    id: str

@app.delete("/rules")
async def delete_rule(request: RuleDeleteRequest):
    try:
        db_service.delete_hard_rule(request.id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
