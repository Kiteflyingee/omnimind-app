import httpx
import json

class FormulaService:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url
        self.api_key = api_key
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

    async def get_tools(self):
        all_tools = []
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
                print(f"Warning: Failed to load tools from {uri}: {e}")
        return all_tools

    async def call_tool(self, function_name: str, args: dict):
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
