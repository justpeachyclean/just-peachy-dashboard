require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')
const { authMiddleware } = require('./lib/auth')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000' }))
app.use(express.json({ limit: '5mb' }))

app.use(authMiddleware)

// Routes
app.use('/api/auth',           require('./routes/auth'))
app.use('/api/settings',       require('./routes/settings'))
app.use('/api/entry/manual',   require('./routes/entry'))
app.use('/api/sales',          require('./routes/sales'))
app.use('/api/webhook',        require('./routes/webhooks'))
app.use('/api/data',           require('./routes/data'))
app.use('/api/bonus',          require('./routes/bonus'))
app.use('/api/leads',          require('./routes/leads'))
app.use('/api/expenses',       require('./routes/expenses'))
app.use('/api/cancellations',  require('./routes/cancellations'))
app.use('/api/nurture',        require('./routes/nurture'))
app.use('/api/feedback',       require('./routes/feedback'))
app.use('/api/care',           require('./routes/care'))
app.use('/api/users',          require('./routes/users'))
app.use('/api/hiring',         require('./routes/hiring'))
app.use('/api/staff',          require('./routes/staff'))
app.use('/api/breakages',      require('./routes/breakages'))
app.use('/api/recleans',       require('./routes/recleans'))
app.use('/api/reports',        require('./routes/reports'))
app.use('/api/referrals',      require('./routes/referrals'))

// Health check
app.get('/api/health', (req, res) => {
  const db = require('./db')
  const dbPath = process.env.DB_PATH || require('path').join(__dirname, 'data', 'peachy.db')
  const settingCount = db.prepare('SELECT COUNT(*) as n FROM settings').get().n
  res.json({ status: 'ok', ts: new Date().toISOString(), db_path: dbPath, settings_count: settingCount })
})

// Audit log endpoint
app.get('/api/audit', (req, res) => {
  const db = require('./db')
  const rows = db.prepare(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100`).all()
  res.json(rows)
})

// Serve built client in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist')
  app.use(express.static(clientDist))
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')))
}

app.listen(PORT, () => {
  console.log(`🍑 Just Peachy server running on http://localhost:${PORT}`)
  try {
    const db = require('./db')
    // ONE-TIME: after the Employee-dashboard matcher learned abbreviated names ("Suzzane C."),
    // clear the forwarded flag so every reclean re-forwards once — the ones that silently failed
    // to match before now land. The Employee side dedups (tech+date+client), so nothing doubles.
    const done = db.prepare("SELECT value FROM settings WHERE key='recleans_resync_matchfix'").get()
    if (!done) {
      db.prepare('UPDATE recleans SET forwarded_at=NULL').run()
      db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('recleans_resync_matchfix','1')").run()
      console.log('↻ reset reclean forward flags for a one-time re-sync')
    }
    // catch up any un-forwarded recleans (idempotent; runs every boot)
    require('./lib/forward').backfillRecleans()
  } catch (_) {}
})
