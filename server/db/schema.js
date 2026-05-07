const SCHEMA = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- Key-value store for one-time configuration
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Daily/weekly manual entries from the manager
CREATE TABLE IF NOT EXISTS manual_entries (
  id                            INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date                    TEXT NOT NULL,
  new_hires                     INTEGER DEFAULT 0,
  staff_quit                    INTEGER DEFAULT 0,
  staff_fired                   INTEGER DEFAULT 0,
  call_ins                      REAL    DEFAULT 0,
  absences                      INTEGER DEFAULT 0,
  revenue_generating_employees  INTEGER,
  marketing_spend               REAL,
  notes                         TEXT,
  entered_by                    TEXT    DEFAULT 'manager',
  created_at                    TEXT    DEFAULT (datetime('now'))
);

-- GHL webhook events (leads, quotes, closes, interviews)
CREATE TABLE IF NOT EXISTS ghl_events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type     TEXT NOT NULL,
  contact_id     TEXT,
  opportunity_id TEXT,
  rep_name       TEXT,
  client_freq    TEXT,
  event_date     TEXT,
  raw_payload    TEXT,
  created_at     TEXT DEFAULT (datetime('now'))
);

-- MaidCentral webhook events (revenue, recurring, cancellations, etc.)
CREATE TABLE IF NOT EXISTS maidcentral_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type  TEXT NOT NULL,
  client_id   TEXT,
  amount      REAL,
  event_date  TEXT,
  raw_payload TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- QuickBooks expense data (pulled nightly)
CREATE TABLE IF NOT EXISTS quickbooks_expenses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  month      TEXT NOT NULL,
  category   TEXT NOT NULL,
  amount     REAL DEFAULT 0,
  synced_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(month, category)
);

-- Sales reps
CREATE TABLE IF NOT EXISTS sales_reps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  email       TEXT,
  active      INTEGER DEFAULT 1,
  start_date  TEXT,
  end_date    TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Monthly bonus records per rep
CREATE TABLE IF NOT EXISTS bonus_records (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  rep_id              INTEGER REFERENCES sales_reps(id),
  month               TEXT NOT NULL,
  quotes_given        INTEGER DEFAULT 0,
  closed_sales        INTEGER DEFAULT 0,
  recurring_closed    INTEGER DEFAULT 0,
  close_rate          REAL,
  recurring_ratio     REAL,
  tier                INTEGER DEFAULT 0,
  bonus_amount        REAL    DEFAULT 0,
  quarterly_bonus     REAL    DEFAULT 0,
  payout_month        TEXT,
  status              TEXT    DEFAULT 'pending',
  paid_date           TEXT,
  updated_at          TEXT    DEFAULT (datetime('now')),
  UNIQUE(rep_id, month)
);

-- Monthly sales summary (manual entry until Zapier is live)
CREATE TABLE IF NOT EXISTS monthly_sales (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  month               TEXT NOT NULL UNIQUE,  -- YYYY-MM
  rep_name            TEXT,
  leads_in            INTEGER DEFAULT 0,
  leads_quoted        INTEGER DEFAULT 0,
  leads_closed        INTEGER DEFAULT 0,
  recurring_closed    INTEGER DEFAULT 0,   -- weekly or biweekly closes (for bonus)
  initial_cleans      INTEGER DEFAULT 0,
  retained            INTEGER DEFAULT 0,   -- initial → recurring
  cancellations       INTEGER DEFAULT 0,
  skips               INTEGER DEFAULT 0,
  complaints          INTEGER DEFAULT 0,
  revenue             REAL    DEFAULT 0,
  marketing_spend     REAL,
  recurring_clients   INTEGER,             -- snapshot at end of month
  move_out_cleans     INTEGER DEFAULT 0,
  notes               TEXT,
  updated_at          TEXT DEFAULT (datetime('now'))
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  action_type TEXT NOT NULL,
  entity      TEXT,
  description TEXT,
  user        TEXT DEFAULT 'system',
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Seed default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('break_even_daily',          NULL),
  ('daily_goal',                NULL),
  ('daily_stretch_goal',        NULL),
  ('avg_training_hours',        NULL),
  ('avg_hourly_labor_cost',     NULL),
  ('avg_ramp_up_days',          NULL),
  ('qb_marketing_category',     'Advertising'),
  ('qb_recruiting_category',    'Recruiting'),
  ('qb_training_category',      'Training'),
  ('webhook_secret',            'change-me-before-connecting-zapier'),
  ('billing_rate_per_rge',      '55'),
  ('goal_hours',                '6.5'),
  ('stretch_hours',             '7');
`;

module.exports = SCHEMA;
