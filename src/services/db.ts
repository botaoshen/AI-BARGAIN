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
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    tier TEXT DEFAULT 'free', -- 'free' or 'pro'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

try {
  db.exec(`ALTER TABLE users ADD COLUMN extra_searches INTEGER DEFAULT 0`);
} catch (e) {
  // Column might already exist, ignore
}

db.exec(`
  CREATE TABLE IF NOT EXISTS vouchers (
    code TEXT PRIMARY KEY,
    searches INTEGER NOT NULL,
    used_by TEXT,
    used_at DATETIME
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS search_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    search_date DATE DEFAULT (DATE('now')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

export interface Subscription {
  id: number;
  email: string;
  store_name: string;
  created_at: string;
}

export interface User {
  id: string;
  email: string | null;
  tier: 'free' | 'pro';
  extra_searches: number;
}

export const dbService = {
  getUser: (userId: string): User | null => {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(userId) as User | null;
  },

  createUser: (userId: string, tier: string = 'free') => {
    const stmt = db.prepare('INSERT OR IGNORE INTO users (id, tier) VALUES (?, ?)');
    return stmt.run(userId, tier);
  },

  upgradeUser: (userId: string) => {
    const stmt = db.prepare("UPDATE users SET tier = 'pro' WHERE id = ?");
    return stmt.run(userId);
  },

  resetUser: (userId: string) => {
    const stmt = db.prepare("UPDATE users SET tier = 'free', extra_searches = 0 WHERE id = ?");
    return stmt.run(userId);
  },

  addExtraSearches: (userId: string, amount: number) => {
    const stmt = db.prepare("UPDATE users SET extra_searches = extra_searches + ? WHERE id = ?");
    return stmt.run(amount, userId);
  },

  useExtraSearch: (userId: string) => {
    const stmt = db.prepare("UPDATE users SET extra_searches = extra_searches - 1 WHERE id = ? AND extra_searches > 0");
    return stmt.run(userId);
  },

  createVoucher: (code: string, searches: number) => {
    const stmt = db.prepare("INSERT OR IGNORE INTO vouchers (code, searches) VALUES (?, ?)");
    return stmt.run(code, searches);
  },

  redeemVoucher: (userId: string, code: string): { success: boolean, message: string, searches?: number } => {
    const voucherStmt = db.prepare("SELECT * FROM vouchers WHERE code = ?");
    const voucher = voucherStmt.get(code) as any;

    if (!voucher) {
      return { success: false, message: "Invalid voucher code" };
    }
    if (voucher.used_by) {
      return { success: false, message: "Voucher already used" };
    }

    const updateVoucher = db.prepare("UPDATE vouchers SET used_by = ?, used_at = CURRENT_TIMESTAMP WHERE code = ?");
    updateVoucher.run(userId, code);

    dbService.addExtraSearches(userId, voucher.searches);
    return { success: true, message: `Successfully redeemed ${voucher.searches} searches!`, searches: voucher.searches };
  },

  getDailySearchCount: (userId: string): number => {
    const stmt = db.prepare("SELECT COUNT(*) as count FROM search_logs WHERE user_id = ? AND search_date = DATE('now')");
    const result = stmt.get(userId) as { count: number };
    return result ? result.count : 0;
  },

  logSearch: (userId: string) => {
    const stmt = db.prepare('INSERT INTO search_logs (user_id) VALUES (?)');
    return stmt.run(userId);
  },

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
