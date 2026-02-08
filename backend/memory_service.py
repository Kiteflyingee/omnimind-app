import os
from mem0 import MemoryClient

class MemoryService:
    def __init__(self, api_key: str):
        self.client = MemoryClient(api_key=api_key)

    def add_memory(self, content: str, user_id: str, run_id: str):
        """
        Add a memory for a specific user and session (run_id).
        """
        try:
            self.client.add(content, user_id=user_id, run_id=run_id)
        except Exception as e:
            print(f"Warning: Failed to add memory to Mem0: {e}")

    def search_memory(self, query: str, user_id: str, run_id: str):
        """
        Search memories for a specific user, isolated by run_id (sessionId).
        """
        try:
            # Filters are required to isolate by run_id
            filters = {"run_id": run_id}
            results = self.client.search(query, user_id=user_id, filters=filters)
            
            # Format results for prompt inclusion
            if not results:
                return ""
                
            # Mem0 Cloud can return a list or a dict with 'results' key
            if isinstance(results, dict) and "results" in results:
                results = results["results"]
                
            if not isinstance(results, list):
                print(f"Warning: Unexpected Mem0 search result format: {type(results)}")
                return ""
                
            memories = []
            for res in results:
                if isinstance(res, dict):
                    m = res.get("memory") or res.get("text") or str(res)
                    memories.append(m)
                else:
                    memories.append(str(res))
                    
            return "\n".join([f"- {m}" for m in memories])
        except Exception as e:
            print(f"Warning: Failed to search memory in Mem0: {e}")
            return ""

    def clear_memory(self, user_id: str, run_id: str = None):
        """
        Clear memories for a user. If run_id is provided, only clear that session's memory.
        Note: Mem0 delete API might vary, using a simplified approach if direct filter delete isn't available.
        """
        try:
            # Mem0's delete often takes user_id, run_id isn't always a direct delete filter in all versions
            # but we follow the intent of clearing current session if possible.
            self.client.delete_all(user_id=user_id)
        except Exception as e:
            print(f"Warning: Failed to clear memory in Mem0: {e}")
