import sqlite3
import json
import os
import yaml
from datetime import datetime

class DBService:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._init_db()

    def _get_conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS conversation_history (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT,
                    thought TEXT,
                    tool_calls TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS hard_rules (
                    id TEXT PRIMARY KEY,
                    content TEXT NOT NULL,
                    is_active INTEGER DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.commit()

    def save_message(self, session_id: str, role: str, content: str = None, thought: str = None, tool_calls: list = None):
        msg_id = os.urandom(4).hex()
        tool_calls_str = json.dumps(tool_calls) if tool_calls else None
        
        with self._get_conn() as conn:
            conn.execute(
                "INSERT INTO conversation_history (id, session_id, role, content, thought, tool_calls) VALUES (?, ?, ?, ?, ?, ?)",
                (msg_id, session_id, role, content, thought, tool_calls_str)
            )
            conn.commit()

    def get_history(self, session_id: str, limit: int = 100):
        with self._get_conn() as conn:
            cursor = conn.execute("""
                SELECT role, content, thought, tool_calls 
                FROM conversation_history 
                WHERE session_id = ? 
                AND (
                    (role != 'tool' AND (
                        (content IS NOT NULL AND trim(content) != '') OR 
                        (thought IS NOT NULL AND trim(thought) != '') OR 
                        (tool_calls IS NOT NULL AND trim(tool_calls) != '')
                    ))
                    OR (role = 'tool')
                )
                ORDER BY rowid ASC LIMIT ?
            """, (session_id, limit))
            
            rows = cursor.fetchall()
            history = []
            for row in rows:
                msg = {
                    "role": row["role"],
                    "content": row["content"]
                }
                
                if row["role"] == "assistant":
                    msg["reasoning_content"] = row["thought"] or ""
                    if row["tool_calls"]:
                        try:
                            msg["tool_calls"] = json.loads(row["tool_calls"])
                        except:
                            pass
                            
                if row["role"] == "tool":
                    thought = row["thought"] or ""
                    if thought.startswith("{"):
                        try:
                            meta = json.loads(thought)
                            msg["tool_call_id"] = meta.get("id", "")
                            msg["name"] = meta.get("name", "")
                        except:
                            msg["tool_call_id"] = thought
                    else:
                        msg["tool_call_id"] = thought
                
                history.append(msg)
            return history

    def get_full_history(self, session_id: str):
        with self._get_conn() as conn:
            cursor = conn.execute("""
                SELECT role, content, thought, tool_calls, created_at 
                FROM conversation_history 
                WHERE session_id = ? 
                AND role != 'tool'
                ORDER BY rowid ASC
            """, (session_id,))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

    def get_hard_rules(self):
        with self._get_conn() as conn:
            cursor = conn.execute("SELECT id, content FROM hard_rules WHERE is_active = 1")
            return [dict(row) for row in cursor.fetchall()]

    def delete_hard_rule(self, rule_id: str):
        with self._get_conn() as conn:
            conn.execute("DELETE FROM hard_rules WHERE id = ?", (rule_id,))
            conn.commit()
