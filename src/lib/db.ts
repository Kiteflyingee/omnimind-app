import Database from 'better-sqlite3';
import { loadConfig } from './config';
import path from 'path';

const config = loadConfig();
const dbPath = path.resolve(process.cwd(), config.storage.sqlite_path);

const db = new Database(dbPath);

// Initialize schema - 保持字段以防未来扩展，但在逻辑中禁用
db.exec(`
  CREATE TABLE IF NOT EXISTS hard_rules (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS conversation_history (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT,
    thought TEXT,
    tool_calls TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

export interface HardRule {
  id: string;
  content: string;
  is_active: number;
}

export const dbService = {
  addHardRule: (id: string, content: string) => {
    const stmt = db.prepare('INSERT INTO hard_rules (id, content) VALUES (?, ?)');
    return stmt.run(id, content);
  },
  
  getHardRules: (): HardRule[] => {
    const stmt = db.prepare('SELECT * FROM hard_rules WHERE is_active = 1');
    return stmt.all() as HardRule[];
  },

  deleteHardRule: (id: string) => {
    const stmt = db.prepare('DELETE FROM hard_rules WHERE id = ?');
    return stmt.run(id);
  },

  toggleHardRule: (id: string, active: boolean) => {
    const stmt = db.prepare('UPDATE hard_rules SET is_active = ? WHERE id = ?');
    return stmt.run(active ? 1 : 0, id);
  },

  saveMessage: (sessionId: string, role: string, content: string | null, thought?: string | null) => {
    const id = Math.random().toString(36).substring(7);
    // 强制不存储 tool_calls
    const stmt = db.prepare('INSERT INTO conversation_history (id, session_id, role, content, thought, tool_calls) VALUES (?, ?, ?, ?, ?, NULL)');
    return stmt.run(id, sessionId, role, content, thought || null);
  },

  getHistory: (sessionId: string, limit = 20) => {
    // 过滤掉 role 为 'tool' 以及内容为空的消息
    const stmt = db.prepare(`
      SELECT role, content, thought 
      FROM conversation_history 
      WHERE session_id = ? 
      AND role != 'tool' 
      AND (content IS NOT NULL AND trim(content) != '')
      ORDER BY created_at DESC LIMIT ?
    `);
    const rows = stmt.all(sessionId, limit) as any[];
    return rows.reverse().map(row => ({
      role: row.role,
      content: row.content,
      reasoning_content: row.thought || undefined
    }));
  }
};

export default db;