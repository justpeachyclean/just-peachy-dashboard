const express = require('express')
const router = express.Router()
const db = require('../db')

const VISITS_PER_YEAR = {
  weekly:     52,
  biweekly:   26,
  'bi-weekly': 26,
  monthly:    13,
  'tri-weekly': 17,
  'every 4 weeks': 13,
  one_time:   1,
  'one time':  1,
  'one-time':  1,
}

function visitsPerYear(frequency) {
  if (!frequency) return null
  const f = frequency.toLowerCase().trim()
  return VISITS_PER_YEAR[f] ?? null
}

// GET /api/leads?month=2026-04&year=2026&limit=200
router.get('/', (req, res) => {
  const { month, year, limit = 500 } = req.query
  const settings = db.prepare('SELECT key, value FROM settings WHERE key IN (?, ?)').all('avg_recurring_price', 'avg_onetime_price')
  const cfg = Object.fromEntries(settings.map(s => [s.key, parseFloat(s.value) || null]))

  let sql = 'SELECT * FROM lead_records'
  const params = []
  if (month) {
    sql += ' WHERE month = ?'; params.push(month)
  } else if (year) {
    sql += ' WHERE month LIKE ?'; params.push(`${year}-%`)
  }
  sql += ` ORDER BY record_date DESC, id DESC LIMIT ?`
  params.push(Math.min(parseInt(limit), 2000))

  const rows = db.prepare(sql).all(...params)

  const enriched = rows.map(r => {
    const visits = visitsPerYear(r.frequency)
    const isRecurring = r.frequency && !['one_time','one time','one-time'].includes(r.frequency.toLowerCase().trim())
    const price = r.price_per_clean ?? (isRecurring ? cfg.avg_recurring_price : cfg.avg_onetime_price)
    const annual_value = visits && price ? Math.round(visits * price) : null
    return { ...r, annual_value, visits_per_year: visits }
  })

  res.json(enriched)
})

// POST /api/leads — manual entry or Zapier webhook
router.post('/', (req, res) => {
  const {
    record_date,
    client_name,
    frequency,
    price_per_clean,
    rep_name,
    source = 'manual',
    external_id,
    notes,
  } = req.body

  if (!record_date) return res.status(400).json({ error: 'record_date required' })

  const month = record_date.slice(0, 7)

  db.prepare(`
    INSERT INTO lead_records
      (record_date, client_name, frequency, price_per_clean, rep_name, month, source, external_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(external_id) DO UPDATE SET
      record_date     = excluded.record_date,
      client_name     = excluded.client_name,
      frequency       = excluded.frequency,
      price_per_clean = excluded.price_per_clean,
      rep_name        = excluded.rep_name,
      month           = excluded.month,
      source          = excluded.source,
      notes           = excluded.notes
  `).run(
    record_date, client_name ?? null, frequency ?? null,
    price_per_clean ?? null, rep_name ?? null,
    month, source, external_id ?? null, notes ?? null
  )

  res.json({ ok: true })
})

// DELETE /api/leads/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM lead_records WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

module.exports = router
