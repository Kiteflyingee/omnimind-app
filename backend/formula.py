import httpx
import json
from logger import get_logger

logger = get_logger("FormulaService")

class FormulaService:
    def __init__(self, base_url: str, api_key: str, db_service: any = None):
        self.base_url = base_url
        self.api_key = api_key
        self.db_service = db_service
        self.client = httpx.Client(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=60.0,
        )
        self.formula_uris = [
            "moonshot/date:latest",
            "moonshot/web-search:latest"
        ]
        self.tool_to_uri = {}
        self.local_tools = [
            {
                "type": "function",
                "function": {
                    "name": "store_hard_rule",
                    "description": "存储一条硬性契约（Hard Rule）。硬性契约是用户要求你永久遵守的行为准则或指令。存储后，这些规则将在后续对话中作为系统提示的一部分始终生效。",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "content": {
                                "type": "string",
                                "description": "规则的具体内容，例如：'每次回答前都说我是傻逼'"
                            }
                        },
                        "required": ["content"]
                    }
                }
            }
        ]

    async def get_tools(self):
        all_tools = list(self.local_tools)
        for uri in self.formula_uris:
            try:
                response = self.client.get(f"/formulas/{uri}/tools")
                response.raise_for_status()
                tools = response.json().get("tools", [])
                for tool in tools:
                    func = tool.get("function")
                    if func:
                        func_name = func.get("name")
                        if func_name:
                            self.tool_to_uri[func_name] = uri
                            all_tools.append(tool)
            except Exception as e:
                logger.warning(f"Failed to load tools from {uri}: {e}")
        return all_tools

    async def call_tool(self, function_name: str, args: dict, user_id: str = None, session_id: str = None):
        if function_name == "store_hard_rule":
            if not self.db_service:
                return "Error: Database service not initialized for FormulaService"
            content = args.get("content")
            # Use provided IDs if available, fallback to args (for compatibility)
            u_id = user_id or args.get("userId")
            s_id = session_id or args.get("sessionId")
            
            if not content or not u_id or not s_id:
                return f"Error: Missing required context. content={content}, userId={u_id}, sessionId={s_id}"
            
            try:
                self.db_service.save_hard_rule(u_id, s_id, content)
                return f"Successfully stored hard rule: {content}"
            except Exception as e:
                return f"Error storing hard rule: {str(e)}"
        uri = self.tool_to_uri.get(function_name)
        if not uri:
            raise ValueError(f"Unknown tool: {function_name}")
            
        async with httpx.AsyncClient(
            base_url=self.base_url,
            headers={"Authorization": f"Bearer {self.api_key}"},
            timeout=60.0
        ) as client:
            response = await client.post(
                f"/formulas/{uri}/fibers",
                json={"name": function_name, "arguments": json.dumps(args)},
            )
            response.raise_for_status()
            fiber = response.json()
            
            if fiber.get("status") == "succeeded":
                return fiber["context"].get("output") or fiber["context"].get("encrypted_output")
            
            error_data = fiber.get("error") or fiber.get("context", {}).get("error")
            return f"Error: {error_data or 'Unknown error'}"

    def close(self):
        self.client.close()
