const express = require('express')
const router = express.Router()
const db = require('../db')
const { audit } = require('../lib/auth')

// GET all settings as {key: value} map
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings ORDER BY key').all()
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]))
  res.json(map)
})

// PUT update one or many settings
router.put('/', (req, res) => {
  const updates = req.body
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Body must be a JSON object of key/value pairs' })
  }

  const upsert = db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
  )

  const upsertMany = db.transaction((entries) => {
    for (const [key, value] of entries) {
      upsert.run(key, value === null || value === '' ? null : String(value))
    }
  })

  upsertMany(Object.entries(updates))

  audit(req, 'settings_updated', 'Settings saved')

  res.json({ ok: true })
})

module.exports = router
