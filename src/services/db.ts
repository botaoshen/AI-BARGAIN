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
  }
};
