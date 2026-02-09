import sqlite3
import json
import os
import yaml
from datetime import datetime
from logger import get_logger

logger = get_logger("DBService")

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
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS conversation_history (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT,
                    thought TEXT,
                    tool_calls TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS hard_rules (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    session_id TEXT NOT NULL,
                    content TEXT NOT NULL,
                    is_active INTEGER DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            """)
            # Migration: Add missing columns robustly
            migrations = {
                "conversation_history": ["user_id", "session_id"],
                "hard_rules": ["user_id", "session_id", "is_active"],
                "sessions": ["user_id", "title", "updated_at", "history_summary"]
            }
            for table, cols in migrations.items():
                # Check current columns
                cursor = conn.execute(f"PRAGMA table_info({table})")
                existing = [row[1] for row in cursor.fetchall()]
                for col in cols:
                    if col not in existing:
                        try:
                            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} TEXT")
                        except Exception as e:
                            logger.warning(f"Failed to add {col} to {table}: {e}")
            
            # Create indices for better performance
            conn.execute("CREATE INDEX IF NOT EXISTS idx_history_session ON conversation_history (session_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_history_user ON conversation_history (user_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_rules_session ON hard_rules (session_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_rules_user ON hard_rules (user_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id)")
            
            conn.commit()

    def get_or_create_user(self, username: str):
        with self._get_conn() as conn:
            cursor = conn.execute("SELECT id FROM users WHERE username = ?", (username,))
            row = cursor.fetchone()
            if row:
                return row["id"]
            
            user_id = os.urandom(8).hex()
            conn.execute("INSERT INTO users (id, username) VALUES (?, ?)", (user_id, username))
            conn.commit()
            return user_id

    def get_user_sessions(self, user_id: str):
        with self._get_conn() as conn:
            cursor = conn.execute(
                "SELECT id, title, updated_at FROM sessions WHERE user_id = ? ORDER BY updated_at DESC", 
                (user_id,)
            )
            return [dict(row) for row in cursor.fetchall()]

    def create_session(self, user_id: str, session_id: str, title: str):
        with self._get_conn() as conn:
            conn.execute(
                "INSERT INTO sessions (id, user_id, title) VALUES (?, ?, ?)",
                (session_id, user_id, title)
            )
            conn.commit()

    def update_session_time(self, session_id: str):
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (session_id,)
            )
            conn.commit()

    def update_session_title(self, session_id: str, title: str):
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE sessions SET title = ? WHERE id = ?",
                (title, session_id)
            )
            conn.commit()

    def is_session_titled(self, session_id: str):
        with self._get_conn() as conn:
            cursor = conn.execute("SELECT title FROM sessions WHERE id = ?", (session_id,))
            row = cursor.fetchone()
            return row and row["title"] != "新对话"

    def save_message(self, user_id: str, session_id: str, role: str, content: str = None, thought: str = None, tool_calls: list = None):
        msg_id = os.urandom(4).hex()
        tool_calls_str = json.dumps(tool_calls) if tool_calls else None
        
        with self._get_conn() as conn:
            conn.execute(
                "INSERT INTO conversation_history (id, user_id, session_id, role, content, thought, tool_calls) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (msg_id, user_id, session_id, role, content, thought, tool_calls_str)
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

    def get_hard_rules(self, user_id: str, session_id: str):
        with self._get_conn() as conn:
            # Re-isolating by session_id as requested
            cursor = conn.execute(
                "SELECT id, content FROM hard_rules WHERE user_id = ? AND session_id = ? AND is_active = 1", 
                (user_id, session_id)
            )
            return [dict(row) for row in cursor.fetchall()]

    def delete_hard_rule(self, rule_id: str):
        with self._get_conn() as conn:
            conn.execute("DELETE FROM hard_rules WHERE id = ?", (rule_id,))
            conn.commit()

    def clear_session_data(self, user_id: str, session_id: str):
        with self._get_conn() as conn:
            # Clear conversation history
            conn.execute("DELETE FROM conversation_history WHERE user_id = ? AND session_id = ?", (user_id, session_id))
            # Clear all hard rules for THIS session
            conn.execute("DELETE FROM hard_rules WHERE user_id = ? AND session_id = ?", (user_id, session_id))
            conn.commit()

    def save_hard_rule(self, user_id: str, session_id: str, content: str):
        rule_id = os.urandom(8).hex()
        with self._get_conn() as conn:
            conn.execute(
                "INSERT INTO hard_rules (id, content, user_id, session_id) VALUES (?, ?, ?, ?)",
                (rule_id, content, user_id, session_id)
            )
            conn.commit()
        return rule_id

    def save_history_summary(self, session_id: str, summary: str):
        """Save compressed history summary for a session"""
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE sessions SET history_summary = ? WHERE id = ?",
                (summary, session_id)
            )
            conn.commit()

    def get_history_summary(self, session_id: str) -> str:
        """Get stored history summary for a session"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "SELECT history_summary FROM sessions WHERE id = ?",
                (session_id,)
            )
            row = cursor.fetchone()
            return row["history_summary"] if row and row["history_summary"] else ""

