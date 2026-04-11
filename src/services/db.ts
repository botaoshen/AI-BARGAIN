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

try {
  db.exec(`ALTER TABLE gift_card_deals ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
} catch (e) {
  // Column might already exist, ignore
}

try {
  db.exec(`ALTER TABLE gift_card_deals ADD COLUMN link TEXT`);
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

db.exec(`
  CREATE TABLE IF NOT EXISTS gift_card_deals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    store TEXT NOT NULL,
    offer TEXT NOT NULL,
    dates TEXT NOT NULL,
    type TEXT NOT NULL
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
  tier: 'free' | 'pro' | 'admin';
  extra_searches: number;
}

export interface GiftCardDeal {
  title: string;
  store: string;
  offer: string;
  dates: string;
  type: "this_week" | "next_week" | "ongoing";
  link?: string;
}

export const dbService = {
  getUser: (userId: string): User | null => {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(userId) as User | null;
  },

  createUser: (userId: string, tier: string = 'free', email: string | null = null) => {
    const stmt = db.prepare('INSERT OR IGNORE INTO users (id, tier, email) VALUES (?, ?, ?)');
    return stmt.run(userId, tier, email);
  },

  updateUserEmailAndTier: (userId: string, email: string, tier: string) => {
    const stmt = db.prepare('UPDATE users SET email = ?, tier = ? WHERE id = ?');
    return stmt.run(email, tier, userId);
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
  },

  getGiftCardDeals: (): { deals: GiftCardDeal[], lastUpdated: string | null } => {
    const stmt = db.prepare('SELECT title, store, offer, dates, type, link, updated_at FROM gift_card_deals LIMIT 6');
    const rows = stmt.all() as any[];
    const deals = rows.map(row => ({
      title: row.title,
      store: row.store,
      offer: row.offer,
      dates: row.dates,
      type: row.type,
      link: row.link
    }));
    const lastUpdated = rows.length > 0 ? rows[0].updated_at : null;
    return { deals, lastUpdated };
  },

  updateGiftCardDeals: (deals: GiftCardDeal[]) => {
    const deleteStmt = db.prepare('DELETE FROM gift_card_deals');
    const insertStmt = db.prepare('INSERT INTO gift_card_deals (title, store, offer, dates, type, link, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)');
    
    const transaction = db.transaction((newDeals: GiftCardDeal[]) => {
      deleteStmt.run();
      for (const deal of newDeals) {
        insertStmt.run(deal.title, deal.store, deal.offer, deal.dates, deal.type, deal.link || null);
      }
    });
    
    transaction(deals);
  }
};
