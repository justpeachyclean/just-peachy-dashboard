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
]
for (const sql of migrations) {
  try { db.exec(sql) } catch (_) { /* column already exists — safe to ignore */ }
}

module.exports = db
