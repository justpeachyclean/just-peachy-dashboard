const Database = require('better-sqlite3')
const path = require('path')
const SCHEMA = require('./schema')

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'peachy.db')

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
]
for (const sql of migrations) {
  try { db.exec(sql) } catch (_) { /* column already exists — safe to ignore */ }
}

module.exports = db
