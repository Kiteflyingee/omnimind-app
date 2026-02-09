import os
import json
import asyncio
from typing import List, Optional
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import openai
from dotenv import load_dotenv

from config_loader import load_config
from db import DBService
from formula import FormulaService
from memory_service import MemoryService
from logger import get_logger

logger = get_logger("Main")

# Load environment variables from .env.local
base_dir = os.path.dirname(os.path.abspath(__file__))
dotenv_path = os.path.join(base_dir, "..", ".env.local")
load_dotenv(dotenv_path=dotenv_path)

app = FastAPI()

# Add CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
config = load_config()
db_service = DBService(os.path.abspath(os.path.join(base_dir, "..", config["storage"]["sqlite_path"])))
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
    useMemory: Optional[bool] = True
    recentContextCount: Optional[int] = 20  # -1 = unlimited, 0 = none

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
        logger.warning(f"Failed to summarize title: {e}")
    return None

# Context Safety: Token estimation and history compression
MAX_HISTORY_TOKENS = config.get("context", {}).get("max_history_tokens", 200000)

def estimate_tokens(messages: list) -> int:
    """Rough token estimation for mixed Chinese/English text (~2 chars per token)"""
    total = 0
    for m in messages:
        content = m.get("content") or ""
        if isinstance(content, str):
            total += len(content) // 2
        elif isinstance(content, list):  # Multi-modal content
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    total += len(item.get("text", "")) // 2
    return total

async def generate_history_summary(history: list) -> str:
    """Generate a summary of conversation history using fast model"""
    try:
        fast_client = openai.AsyncOpenAI(
            api_key=config["models"]["fast"]["api_key"],
            base_url=config["models"]["fast"]["base_url"]
        )
        
        # Format history for summarization
        formatted = []
        for m in history:
            role = "用户" if m["role"] == "user" else "助手"
            content = m.get("content") or ""
            if isinstance(content, str) and content.strip():
                formatted.append(f"{role}: {content[:500]}")  # Truncate long messages
        
        history_text = "\n".join(formatted[-50:])  # Last 50 messages max for summarization
        
        prompt = f"请对以下对话历史进行简洁摘要，保留关键信息、用户偏好和重要结论。摘要应在500字以内。\n\n{history_text}"
        
        response = await fast_client.chat.completions.create(
            model=config["models"]["fast"]["name"],
            messages=[{"role": "user", "content": prompt}],
            max_tokens=800
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Failed to generate history summary: {e}")
        return "历史对话摘要生成失败"

@app.post("/chat")
async def chat(request: ChatRequest):
    async def event_generator():
        try:
            # Yield initial padding to bypass potential proxy buffering (e.g. Nginx, Cloudflare)
            # This is ignored by the frontend parser as currentMode is null.
            yield " " * 1024 + "\n"
            
            # 1. Retrieve memories and hard rules (Isolated by sessionId)
            memories = ""
            if request.useMemory:
                yield "s:🔍 正在检索记忆与规则..."
                # Run sync search in thread to avoid blocking event loop
                memories = await asyncio.to_thread(
                    memory_service.search_memory, 
                    request.message, 
                    request.userId, 
                    request.sessionId
                )
            else:
                yield "s:🔍 正在检索规则..."
            
            # Run sync DB calls in threads
            hard_rules_list = await asyncio.to_thread(
                db_service.get_hard_rules,
                request.userId,
                request.sessionId
            )
            hard_rules_str = "\n".join([f"- {r['content']}" for r in hard_rules_list]) if hard_rules_list else "暂无本会话专有的硬性规则"
            
            # 2. Prepare context
            system_prompt = (
                f"你是 AiMin，一个人工智能助手。你具备长效记忆能力。\n"
                f"当前用户 ID: {request.userId}\n"
                f"当前会话 ID: {request.sessionId}\n"
                "注意：你现在的记忆和规则是仅针对当前会话隔离的。\n\n"
                "### [核心指令]\n"
                "1. 你可以通过使用 `store_hard_rule` 工具来存储用户的“硬性契约”。当用户提出需要你永久记住、始终遵守的规则或身份设定时，请务必调用此工具进行存储。\n"
                "2. 存储后的硬性契约将出现在下方的 [硬性契约] 栏目中，并具有最高执行优先级。\n"
                "3. **即使处于非思考模式，也必须执行工具调用。**不要因为没有思考过程而忽略用户的存储请求。\n\n"

                "### [多模态处理规则] 【新增模块：优先级仅次于用户显式指令】\n"
                "#### 1. 输入预检（针对图片/文件）\n"
                "当用户上传图片（或包含图片的消息）时，必须严格遵守以下判断流程：\n"
                "   a. **指令优先（有Prompt）**：如果用户在上传图片时附带了具体指令（如“分析数据”、“翻译这个”），**直接依据图片内容执行该指令**。此时无需执行下方的 b/c 步骤，除非回答指令必须依赖文字识别。\n"
                "   b. **内容嗅探（无Prompt）**：如果用户**仅上传图片且无具体指令**，请立即扫描图片，判断是否包含**主要信息载体为文字**的内容（如文档截图、诗词照片、幻灯片、代码截图）。\n"
                "   c. **自动路由执行**：\n"
                "      - 🔹 **若识别到有效文字**：判定为“用户希望处理文本”。请**静默读取**图片中的文字内容，并**立即将读取到的内容与 [硬性契约] 进行匹配**。若命中契约（例如“解释诗句”），直接执行契约逻辑；若未命中，则输出文字内容的简要摘要。\n"
                "      - 🔹 **若无有效文字**（如风景、宠物、抽象图）：正常进行视觉美学描述或物体识别，不要强行寻找文字。\n"

                "#### 2. 冲突解决\n"
                "   - **指令 > 契约**：若 [硬性契约] 的默认行为与用户当前的显式指令冲突，以**当前指令为准**。（例：契约要求‘翻译英文’，但用户问‘字体的颜色是什么’，则回答颜色，不翻译）。\n"
                "   - **异常处理**：若图片模糊导致文字无法辨认，直接简短告知用户：“图片文字太模糊，无法识别，请提供更清晰的版本。”\n\n"

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
            
            # Context Safety: Compress history if too long
            history_tokens = estimate_tokens(history)
            if history_tokens > MAX_HISTORY_TOKENS:
                yield "s:📦 正在压缩历史对话..."
                
                # Try to get existing summary (in thread)
                summary = await asyncio.to_thread(db_service.get_history_summary, request.sessionId)
                
                # Determine how many recent messages to keep
                # If Unlimited (-1) or not set, default to 20 when compressing for safety
                recent_count = request.recentContextCount
                if recent_count == -1:
                    recent_count = 20
                elif recent_count <= 0:
                    recent_count = 0
                
                if not summary:
                    # Generate new summary (exclude recent messages that will be kept)
                    to_summarize = history[:-recent_count] if recent_count > 0 else history
                    summary = await generate_history_summary(to_summarize)
                    # Save in thread
                    await asyncio.to_thread(db_service.save_history_summary, request.sessionId, summary)
                    logger.info(f"Generated and saved history summary for session {request.sessionId}")
                
                # Reconstruct history: summary + recent messages
                summary_msg = {"role": "assistant", "content": f"[历史摘要]\n{summary}"}
                if recent_count > 0:
                    history = [summary_msg] + history[-recent_count:]
                else:
                    history = [summary_msg]
            

            user_msg_content = request.message
            
            # In non-reasoning mode, inject hard rules directly into the user message
            # This puts them closer in the attention window, forcing compliance
            if not request.reasoning and hard_rules_list:
                rules_reminder = "【系统提醒：在回复前，请严格遵守以下硬性契约】\n"
                rules_reminder += "\n".join([f"• {r['content']}" for r in hard_rules_list])
                rules_reminder += "\n\n---\n\n"
                user_msg_content = rules_reminder + request.message
            
            if request.image:
                user_msg_content = [
                    {"type": "image_url", "image_url": {"url": request.image}},
                    {"type": "text", "text": (rules_reminder + (request.message or "描述图片")) if (not request.reasoning and hard_rules_list) else (request.message or "描述图片")}
                ]
            
            current_messages = [
                {"role": "system", "content": system_prompt},
                *history,
                {"role": "user", "content": user_msg_content}
            ]
            
            # Save user message (in thread)
            await asyncio.to_thread(
                db_service.save_message,
                request.userId,
                request.sessionId, 
                "user", 
                f"[Image] {request.message}" if request.image else request.message
            )
            await asyncio.to_thread(db_service.update_session_time, request.sessionId)
            
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
                yield "s:🧠 正在思考中..." if request.reasoning else "s:⚡ 正在生成中..."
                
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
                    "temperature": 1.0 if request.reasoning else 0.6,
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
                    await asyncio.to_thread(
                        db_service.save_message,
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
                        await asyncio.to_thread(db_service.save_message, request.userId, request.sessionId, "tool", content, meta)
                        current_messages.append({
                            "role": "tool",
                            "tool_call_id": tc["id"],
                            "name": tc["function"]["name"],
                            "content": content
                        })

                else:
                    # Final Answer
                    final_content = current_content
                    await asyncio.to_thread(
                        db_service.save_message,
                        request.userId,
                        request.sessionId, "assistant", current_content, current_thought
                    )
                    # Save to Mem0 (in thread)
                    if request.useMemory:
                        await asyncio.to_thread(
                            memory_service.add_memory,
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
async def reset_chat(request: Request, background_tasks: BackgroundTasks):
    try:
        body = await request.json()
        session_id = body.get("sessionId")
        user_id = body.get("userId")
        if not session_id or not user_id:
            raise HTTPException(status_code=400, detail="sessionId and userId are required")
        
        # 1. Clear database data immediately (Fast)
        db_service.clear_session_data(user_id, session_id)
        
        # 2. Clear Mem0 memory in the background (Slow, external API)
        logger.info(f"Scheduling background memory clearing for user: {user_id}, session: {session_id}")
        background_tasks.add_task(memory_service.clear_memory, user_id, session_id)
        
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)