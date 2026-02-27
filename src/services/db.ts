import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database('bargains.db');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    store_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(email, store_name)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS stats (
    key TEXT PRIMARY KEY,
    value INTEGER DEFAULT 0
  )
`);

// Initialize global counter if not exists
db.prepare('INSERT OR IGNORE INTO stats (key, value) VALUES (?, ?)').run('savings_count', 12450);

export interface Subscription {
  id: number;
  email: string;
  store_name: string;
  created_at: string;
}

export const dbService = {
  subscribe: (email: string, storeName: string) => {
    const stmt = db.prepare('INSERT OR IGNORE INTO subscriptions (email, store_name) VALUES (?, ?)');
    return stmt.run(email, storeName);
  },

  unsubscribe: (email: string, storeName: string) => {
    const stmt = db.prepare('DELETE FROM subscriptions WHERE email = ? AND store_name = ?');
    return stmt.run(email, storeName);
  },

  getSubscriptions: (email: string): Subscription[] => {
    const stmt = db.prepare('SELECT * FROM subscriptions WHERE email = ?');
    return stmt.all(email) as Subscription[];
  },

  getAllSubscriptions: (): Subscription[] => {
    const stmt = db.prepare('SELECT * FROM subscriptions');
    return stmt.all() as Subscription[];
  },

  getSavingsCount: (): number => {
    const row = db.prepare('SELECT value FROM stats WHERE key = ?').get('savings_count') as { value: number };
    return row ? row.value : 0;
  },

  incrementSavingsCount: () => {
    return db.prepare('UPDATE stats SET value = value + 1 WHERE key = ?').run('savings_count');
  }
};
