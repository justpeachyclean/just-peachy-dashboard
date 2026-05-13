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
  `ALTER TABLE lead_records ADD COLUMN initial_clean_booked INTEGER DEFAULT 0`,
  `ALTER TABLE lead_records ADD COLUMN initial_clean_price REAL`,
  `INSERT OR IGNORE INTO settings (key, value) VALUES ('dashboard_password', '')`,
  `INSERT OR IGNORE INTO settings (key, value) VALUES ('recurring_clients_current', NULL)`,
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
  `CREATE TABLE IF NOT EXISTS hiring_pipeline (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_name TEXT,
  contact_id     TEXT,
  phone          TEXT,
  email          TEXT,
  stage          TEXT DEFAULT 'applied',
  stage_date     TEXT,
  source         TEXT DEFAULT 'woot',
  position       TEXT,
  notes          TEXT,
  hired          INTEGER DEFAULT 0,
  hire_date      TEXT,
  no_show        INTEGER DEFAULT 0,
  external_id    TEXT UNIQUE,
  raw_payload    TEXT,
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now'))
)`,
  // Skips logged per day; client_count is a point-in-time snapshot (optional)
  `ALTER TABLE manual_entries ADD COLUMN skips INTEGER DEFAULT 0`,
  `ALTER TABLE manual_entries ADD COLUMN client_count INTEGER`,
  // Gift card sales — manual entry or Gift Up Zapier webhook
  `ALTER TABLE manual_entries ADD COLUMN gift_card_sales REAL`,
  // Store computed annual value on lead records so it's queryable for averages
  `ALTER TABLE lead_records ADD COLUMN annual_value REAL`,
  // Individual employee termination records (auto via MC webhook + manual import)
  `CREATE TABLE IF NOT EXISTS staff_terminations (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_name     TEXT NOT NULL,
    termination_date  TEXT NOT NULL,
    termination_type  TEXT NOT NULL DEFAULT 'fired',
    reason            TEXT,
    source            TEXT DEFAULT 'manual',
    external_id       TEXT UNIQUE,
    notes             TEXT,
    created_at        TEXT DEFAULT (datetime('now'))
  )`,
  `INSERT OR IGNORE INTO settings (key, value) VALUES ('staff_headcount_baseline', NULL)`,
  `INSERT OR IGNORE INTO settings (key, value) VALUES ('staff_headcount_baseline_date', NULL)`,
  // Full employee directory (active + alumni) — imported from MaidCentral / Excel
  `CREATE TABLE IF NOT EXISTS employees (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_name     TEXT NOT NULL,
    hire_date         TEXT,
    termination_date  TEXT,
    termination_type  TEXT,
    notes             TEXT,
    source            TEXT DEFAULT 'manual',
    external_id       TEXT UNIQUE,
    created_at        TEXT DEFAULT (datetime('now'))
  )`,
]
for (const sql of migrations) {
  try { db.exec(sql) } catch (_) { /* column already exists — safe to ignore */ }
}

// Backfill welcome_call & otc_24hr_call for clients who only have the old 5-stage timeline
try {
  const INTERVAL = { weekly:7, biweekly:14, 'bi-weekly':14, monthly:28, 'every 4 weeks':28, 'tri-weekly':10 }
  const missing = db.prepare(`
    SELECT cc.client_name, cc.scheduled_date AS first_recurring_date,
           (SELECT frequency FROM lead_records lr
            WHERE LOWER(lr.client_name)=LOWER(cc.client_name) AND lr.recurring_retained=1
            ORDER BY lr.id DESC LIMIT 1) AS frequency
    FROM client_care cc
    WHERE cc.care_type = 'first_recurring'
      AND NOT EXISTS (SELECT 1 FROM client_care wc WHERE wc.client_name=cc.client_name AND wc.care_type='welcome_call')
  `).all()
  const ins = db.prepare(`INSERT OR IGNORE INTO client_care (client_name, care_type, scheduled_date, notes) VALUES (?,?,?,?)`)
  const note = 'Backfilled — auto-created from lead conversion'
  const addDaysLocal = (dateStr, days) => {
    const d = new Date(dateStr + 'T12:00:00Z')
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().split('T')[0]
  }
  db.transaction(() => {
    for (const row of missing) {
      const iv = INTERVAL[(row.frequency || '').toLowerCase().trim()] || 14
      ins.run(row.client_name, 'welcome_call',   addDaysLocal(row.first_recurring_date, -iv),     note)
      ins.run(row.client_name, 'otc_24hr_call', addDaysLocal(row.first_recurring_date, -iv + 1), note)
    }
  })()
  if (missing.length > 0) console.log(`✅ Backfilled welcome_call/otc_24hr_call for ${missing.length} clients`)
} catch(e) { console.warn('Care backfill skipped:', e.message) }

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
