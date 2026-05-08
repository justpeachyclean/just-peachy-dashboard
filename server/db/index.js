const Database = require('better-sqlite3')
const path = require('path')
const SCHEMA = require('./schema')

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'peachy.db')
if (!process.env.DB_PATH && process.env.NODE_ENV === 'production') {
  console.warn('⚠️  DB_PATH not set — using container path, data will not persist across deployments. Set DB_PATH=/data/peachy.db in Railway Variables.')
}

// Ensure data directory exists
const fs = require('fs')
const dataDir = path.dirname(DB_PATH)
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

const db = new Database(DB_PATH)
db.exec(SCHEMA)

// Runtime migrations — safe to run on every startup (ALTER TABLE ignores existing columns)
const migrations = [
  `ALTER TABLE manual_entries ADD COLUMN absences INTEGER DEFAULT 0`,
  `ALTER TABLE monthly_sales ADD COLUMN move_out_cleans INTEGER DEFAULT 0`,
  `INSERT OR IGNORE INTO settings (key, value) VALUES ('billing_rate_per_rge', '55')`,
  `INSERT OR IGNORE INTO settings (key, value) VALUES ('goal_hours', '6.5')`,
  `INSERT OR IGNORE INTO settings (key, value) VALUES ('stretch_hours', '7')`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_entries_date_by ON manual_entries (entry_date, entered_by)`,
  `ALTER TABLE bonus_records ADD COLUMN weekly_biweekly_closed INTEGER DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS lead_records (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    record_date   TEXT NOT NULL,
    client_name   TEXT,
    frequency     TEXT,
    price_per_clean REAL,
    rep_name      TEXT,
    month         TEXT,
    source        TEXT DEFAULT 'manual',
    external_id   TEXT UNIQUE,
    notes         TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  )`,
  `INSERT OR IGNORE INTO settings (key, value) VALUES ('avg_recurring_price', NULL)`,
  `INSERT OR IGNORE INTO settings (key, value) VALUES ('avg_onetime_price', NULL)`,
  `ALTER TABLE lead_records ADD COLUMN quote_amount REAL`,
  `ALTER TABLE lead_records ADD COLUMN converted INTEGER DEFAULT 0`,
  `ALTER TABLE lead_records ADD COLUMN recurring_retained INTEGER DEFAULT 0`,
  `ALTER TABLE lead_records ADD COLUMN lead_source TEXT`,
  `ALTER TABLE lead_records ADD COLUMN used_before TEXT`,
  `ALTER TABLE lead_records ADD COLUMN reason TEXT`,
  `ALTER TABLE cancelled_clients ADD COLUMN price_per_visit REAL`,
  `ALTER TABLE cancelled_clients ADD COLUMN annual_value_lost REAL`,
  `INSERT OR IGNORE INTO settings (key, value) VALUES ('dashboard_password', '')`,
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT,
    role TEXT DEFAULT 'member',
    password_hash TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    last_login TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
]
for (const sql of migrations) {
  try { db.exec(sql) } catch (_) { /* column already exists — safe to ignore */ }
}

// Seed first admin user if none exist
const { randomBytes, scryptSync } = require('crypto')
function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(pw, salt, 64).toString('hex')
  return `${salt}:${hash}`
}
try {
  const count = db.prepare('SELECT COUNT(*) as n FROM users').get().n
  if (count === 0) {
    const existing = db.prepare("SELECT value FROM settings WHERE key='dashboard_password'").get()?.value
    const initPw = (existing && existing.trim()) ? existing.trim() : 'admin'
    db.prepare(`INSERT INTO users (username, display_name, role, password_hash) VALUES (?,?,?,?)`)
      .run('admin', 'Admin', 'admin', hashPassword(initPw))
    console.log(`🔐 Created default admin user — username: admin, password: ${initPw}`)
  }
} catch(_) {}

module.exports = db
