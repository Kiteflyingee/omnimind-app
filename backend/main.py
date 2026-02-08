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
from memory_service import MemoryService

# Load environment variables from .env.local
base_dir = os.path.dirname(os.path.abspath(__file__))
dotenv_path = os.path.join(base_dir, "..", ".env.local")
load_dotenv(dotenv_path=dotenv_path)

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
    config["models"]["advanced"]["api_key"],
    db_service
)
memory_service = MemoryService(config["memory"]["mem0"]["api_key"])

class LoginRequest(BaseModel):
    username: str

class ChatRequest(BaseModel):
    message: str
    sessionId: str
    userId: str
    image: Optional[str] = None
    reasoning: Optional[bool] = False

async def summarize_session_title(session_id: str, user_msg: str, ai_msg: str):
    try:
        fast_client = openai.AsyncOpenAI(
            api_key=config["models"]["fast"]["api_key"],
            base_url=config["models"]["fast"]["base_url"]
        )
        prompt = f"请根据以下对话内容，总结一个简短的会话标题（不超过6个字）。只返回标题文字，不要有任何修饰语或标点。\n\n用户: {user_msg}\n助手: {ai_msg}"
        
        response = await fast_client.chat.completions.create(
            model=config["models"]["fast"]["name"],
            messages=[{"role": "user", "content": prompt}],
            max_tokens=30
        )
        new_title = response.choices[0].message.content.strip().replace("“", "").replace("”", "").replace("标题：", "")
        if new_title:
            db_service.update_session_title(session_id, new_title)
            return new_title
    except Exception as e:
        print(f"Warning: Failed to summarize title: {e}")
    return None

@app.post("/chat")
async def chat(request: ChatRequest):
    async def event_generator():
        try:
            # 1. Retrieve memories and hard rules (Isolated by sessionId)
            yield "s:🔍 正在检索记忆与规则..."
            memories = memory_service.search_memory(request.message, request.userId, request.sessionId)
            hard_rules_list = db_service.get_hard_rules(request.userId, request.sessionId)
            hard_rules_str = "\n".join([f"- {r['content']}" for r in hard_rules_list]) if hard_rules_list else "暂无本会话专有的硬性规则"
            
            # 2. Prepare context
            system_prompt = (
                f"你是 OmniMind，由 Moonshot AI 提供的人工智能助手。你具备长效记忆能力。\n"
                f"当前用户 ID: {request.userId}\n"
                f"当前会话 ID: {request.sessionId}\n"
                "注意：你现在的记忆和规则是仅针对当前会话隔离的。\n\n"
                "### [核心指令]\n"
                "1. 你可以通过使用 `store_hard_rule` 工具来存储用户的“硬性契约”。当用户提出需要你永久记住、始终遵守的规则或身份设定时，请务必调用此工具进行存储。\n"
                "2. 存储后的硬性契约将出现在下方的 [硬性契约] 栏目中，并具有最高执行优先级。\n\n"
                f"### [硬性契约 (Hard Rules)]\n这些规则你必须无条件遵守，且优先级最高：\n{hard_rules_str}\n\n"
                f"### [相关记忆 (Soft Facts)]\n这些是关于过去对话的上下文信息，供你参考：\n{memories or '暂无相关记忆'}"
            )
            history = db_service.get_history(request.sessionId)
            
            # History Repair: Remove failed turns (orphaned tool calls)
            cleaned_history = []
            idx = 0
            while idx < len(history):
                m = history[idx]
                if m["role"] == "assistant" and m.get("tool_calls"):
                    # Check for tool completion
                    tool_call_ids = {tc["id"] for tc in m["tool_calls"]}
                    found_tool_ids = set()
                    search_idx = idx + 1
                    tools_found = []
                    while search_idx < len(history) and history[search_idx]["role"] == "tool":
                        tid = history[search_idx].get("tool_call_id")
                        if tid in tool_call_ids:
                            found_tool_ids.add(tid)
                            tools_found.append(history[search_idx])
                        search_idx += 1
                    
                    if found_tool_ids == tool_call_ids:
                        cleaned_history.append(m)
                        cleaned_history.extend(tools_found)
                        idx = search_idx
                    else:
                        # Orphan found! Strip the triggering user message too
                        if cleaned_history and cleaned_history[-1]["role"] == "user":
                            cleaned_history.pop()
                        idx = search_idx # Skip assistant and any tool scraps
                elif m["role"] == "tool":
                    idx += 1 # Standalone tool scrap
                else:
                    cleaned_history.append(m)
                    idx += 1
            history = cleaned_history
            
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
                request.userId,
                request.sessionId, 
                "user", 
                f"[Image] {request.message}" if request.image else request.message
            )
            db_service.update_session_time(request.sessionId)
            
            available_tools = await formula_service.get_tools()
            
            iteration = 0
            max_iterations = 10
            
            client = openai.AsyncOpenAI(
                api_key=config["models"]["advanced"]["api_key"],
                base_url=config["models"]["advanced"]["base_url"]
            )
            
            final_content = ""
            while iteration < max_iterations:
                iteration += 1
                yield "s:🧠 正在思考中..."
                
                # Strict sequence reconstruction for API request
                request_messages = []
                for m in current_messages:
                    role = m["role"]
                    content = m.get("content")
                    msg = {"role": role, "content": content}
                    
                    if role == "assistant":
                        # reasoning_content (Kimi requirement)
                        rc = m.get("reasoning_content") or m.get("thought")
                        if rc: msg["reasoning_content"] = rc
                        if m.get("tool_calls"):
                            msg["tool_calls"] = m["tool_calls"]
                            # Ensure content is None if only tool_calls are present
                            if not content: msg["content"] = None
                    elif role == "tool":
                        msg["tool_call_id"] = m.get("tool_call_id")
                        msg["name"] = m.get("name")
                    
                    request_messages.append(msg)

                # Call Model
                completion_args = {
                    "model": config["models"]["advanced"]["name"],
                    "messages": request_messages,
                    "stream": True,
                    "tools": available_tools,
                    "max_tokens": 1024 * 32,
                    "temperature": 1.0,
                }
                if request.reasoning is False:
                    completion_args["extra_body"] = {
                        "thinking": {"type": "disabled"}
                    }
                else:
                    # Some models might need explicit enablement or specific extra_body
                    # but following the user's success example which doesn't have it.
                    pass

                response = await client.chat.completions.create(**completion_args)
                
                current_thought = ""
                current_content = ""
                tool_calls_map = {}
                has_cleared_status = False
                
                async for chunk in response:
                    if not chunk.choices:
                        continue
                    delta = chunk.choices[0].delta
                    
                    # Safely extract reasoning_content and content
                    # Note: reasoning_content might be in model_extra for some SDK versions
                    # Some models also use 'thought' instead of 'reasoning_content'
                    reasoning_chunk = getattr(delta, "reasoning_content", None)
                    if reasoning_chunk is None:
                        reasoning_chunk = getattr(delta, "thought", None)
                    if reasoning_chunk is None and hasattr(delta, "model_extra"):
                        reasoning_chunk = delta.model_extra.get("reasoning_content") or delta.model_extra.get("thought")
                    
                    content_chunk = getattr(delta, "content", None)
                    
                    if (content_chunk or reasoning_chunk) and not has_cleared_status:
                        yield "s:"
                        has_cleared_status = True
                    
                    if reasoning_chunk:
                        current_thought += reasoning_chunk
                        yield f"t:{reasoning_chunk}"
                        
                    if content_chunk:
                        current_content += content_chunk
                        yield f"c:{content_chunk}"
                        
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
                    friendly_names = {
                        "store_hard_rule": "存储硬性规则",
                        "web_search": "网络搜索",
                        "calculate": "数学计算"
                    }
                    tool_display_names = ", ".join([friendly_names.get(tc["function"]["name"], tc["function"]["name"]) for tc in tool_calls])
                    yield f"s:🛠️ 正在执行: {tool_display_names}..."
                    
                    assistant_msg = {
                        "role": "assistant",
                        "content": current_content or None,
                        "reasoning_content": current_thought or "Directly executing tools...",
                        "tool_calls": tool_calls
                    }
                    db_service.save_message(
                        request.userId,
                        request.sessionId, "assistant", 
                        assistant_msg["content"], assistant_msg["reasoning_content"], tool_calls
                    )
                    current_messages.append(assistant_msg)
                    
                    for tc in tool_calls:
                        content = ""
                        try:
                            args = json.loads(tc["function"]["arguments"])
                            result = await formula_service.call_tool(
                                tc["function"]["name"], 
                                args, 
                                user_id=request.userId, 
                                session_id=request.sessionId
                            )
                            content = str(result)
                        except Exception as e:
                            yield f"c:\n[Tool Error: {str(e)}]\n"
                            content = f"Error: {str(e)}"
                        
                        meta = json.dumps({"id": tc["id"], "name": tc["function"]["name"]})
                        db_service.save_message(request.userId, request.sessionId, "tool", content, meta)
                        current_messages.append({
                            "role": "tool",
                            "tool_call_id": tc["id"],
                            "name": tc["function"]["name"],
                            "content": content
                        })

                else:
                    # Final Answer
                    final_content = current_content
                    db_service.save_message(
                        request.userId,
                        request.sessionId, "assistant", current_content, current_thought
                    )
                    # Save to Mem0 (isolated by run_id)
                    memory_service.add_memory(
                        f"User: {request.message}\nAssistant: {current_content}",
                        user_id=request.userId,
                        run_id=request.sessionId
                    )
                    break
            
            # 3. Check if we need to update session title
            if not db_service.is_session_titled(request.sessionId):
                new_title = await summarize_session_title(request.sessionId, request.message, final_content)
                if new_title:
                    yield f"u:{new_title}"
                    
        except Exception as e:
            yield f"c:\n[Backend Error: {str(e)}]\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/plain",
        headers={
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Content-Type-Options": "nosniff"
        }
    )

@app.post("/login")
async def login(request: LoginRequest):
    try:
        user_id = db_service.get_or_create_user(request.username)
        return {"userId": user_id, "username": request.username}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/sessions/{user_id}")
async def get_sessions(user_id: str):
    try:
        return db_service.get_user_sessions(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SessionCreateRequest(BaseModel):
    userId: str
    sessionId: str
    title: str

@app.post("/sessions")
async def create_session(request: SessionCreateRequest):
    try:
        db_service.create_session(request.userId, request.sessionId, request.title)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/rules")
async def get_rules(sessionId: str, userId: str):
    try:
        rules = db_service.get_hard_rules(userId, sessionId)
        return rules
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/history/{session_id}")
async def get_chat_history(session_id: str):
    try:
        history = db_service.get_full_history(session_id)
        return history
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class RuleDeleteRequest(BaseModel):
    id: str
    userId: str # Added for consistency

@app.delete("/rules")
async def delete_rule(request: RuleDeleteRequest):
    try:
        db_service.delete_hard_rule(request.id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat/reset")
async def reset_chat(request: Request):
    try:
        body = await request.json()
        session_id = body.get("sessionId")
        user_id = body.get("userId")
        if not session_id or not user_id:
            raise HTTPException(status_code=400, detail="sessionId and userId are required")
        db_service.clear_session_data(user_id, session_id)
        # Clear Mem0 as well
        memory_service.clear_memory(user_id, session_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)