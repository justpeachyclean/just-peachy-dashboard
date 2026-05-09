const express = require('express')
const router = express.Router()
const db = require('../db')
const { audit } = require('../lib/auth')

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
    quote_amount,
    converted = 0,
    recurring_retained = 0,
    initial_clean_booked = 0,
    lead_source,
    used_before,
    reason,
    rep_name,
    source = 'manual',
    external_id,
    notes,
  } = req.body

  if (!record_date) return res.status(400).json({ error: 'record_date required' })

  const month = record_date.slice(0, 7)

  db.prepare(`
    INSERT INTO lead_records
      (record_date, client_name, frequency, price_per_clean, quote_amount,
       converted, recurring_retained, initial_clean_booked, lead_source, used_before, reason,
       rep_name, month, source, external_id, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(external_id) DO UPDATE SET
      record_date           = excluded.record_date,
      client_name           = excluded.client_name,
      frequency             = excluded.frequency,
      price_per_clean       = excluded.price_per_clean,
      quote_amount          = excluded.quote_amount,
      converted             = excluded.converted,
      recurring_retained    = excluded.recurring_retained,
      initial_clean_booked  = excluded.initial_clean_booked,
      lead_source           = excluded.lead_source,
      used_before           = excluded.used_before,
      reason                = excluded.reason,
      rep_name              = excluded.rep_name,
      month                 = excluded.month,
      source                = excluded.source,
      notes                 = excluded.notes
  `).run(
    record_date, client_name ?? null, frequency ?? null,
    price_per_clean ?? null, quote_amount ?? null,
    converted ? 1 : 0, recurring_retained ? 1 : 0, initial_clean_booked ? 1 : 0,
    lead_source ?? null, used_before ?? null, reason ?? null,
    rep_name ?? null, month, source, external_id ?? null, notes ?? null
  )

  audit(req, 'lead_added', `${client_name || 'Unknown'}`)
  res.json({ ok: true })
})

// PATCH /api/leads/:id  — update existing record (also usable by Zapier via external_id)
router.patch('/:id', (req, res) => {
  // Allow lookup by external_id (GHL opportunity ID) or numeric id
  const byExternal = isNaN(req.params.id)
  const existing = byExternal
    ? db.prepare('SELECT * FROM lead_records WHERE external_id = ?').get(req.params.id)
    : db.prepare('SELECT * FROM lead_records WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })

  const {
    record_date, client_name, frequency, price_per_clean, quote_amount,
    converted, recurring_retained, initial_clean_booked, lead_source, used_before, reason,
    rep_name, notes,
  } = req.body

  const updated = {
    record_date:           record_date           ?? existing.record_date,
    client_name:           client_name           !== undefined ? client_name           : existing.client_name,
    frequency:             frequency             !== undefined ? frequency             : existing.frequency,
    price_per_clean:       price_per_clean       !== undefined ? price_per_clean       : existing.price_per_clean,
    quote_amount:          quote_amount          !== undefined ? quote_amount          : existing.quote_amount,
    converted:             converted             !== undefined ? (converted ? 1 : 0)             : existing.converted,
    recurring_retained:    recurring_retained    !== undefined ? (recurring_retained ? 1 : 0)    : existing.recurring_retained,
    initial_clean_booked:  initial_clean_booked  !== undefined ? (initial_clean_booked ? 1 : 0)  : existing.initial_clean_booked,
    lead_source:           lead_source           !== undefined ? lead_source           : existing.lead_source,
    used_before:           used_before           !== undefined ? used_before           : existing.used_before,
    reason:                reason                !== undefined ? reason                : existing.reason,
    rep_name:              rep_name              !== undefined ? rep_name              : existing.rep_name,
    notes:                 notes                 !== undefined ? notes                 : existing.notes,
    month:                 (record_date ?? existing.record_date).slice(0, 7),
  }

  db.prepare(`
    UPDATE lead_records SET
      record_date=?, client_name=?, frequency=?, price_per_clean=?, quote_amount=?,
      converted=?, recurring_retained=?, initial_clean_booked=?, lead_source=?, used_before=?, reason=?,
      rep_name=?, notes=?, month=?
    WHERE id=?
  `).run(
    updated.record_date, updated.client_name, updated.frequency,
    updated.price_per_clean, updated.quote_amount,
    updated.converted, updated.recurring_retained, updated.initial_clean_booked,
    updated.lead_source, updated.used_before, updated.reason,
    updated.rep_name, updated.notes, updated.month,
    existing.id
  )
  audit(req, 'lead_updated', `ID ${existing.id}`)
  res.json({ ok: true })
})

// DELETE /api/leads/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM lead_records WHERE id = ?').run(req.params.id)
  audit(req, 'lead_deleted', `ID ${req.params.id}`)
  res.json({ ok: true })
})

module.exports = router
