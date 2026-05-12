const express = require('express')
const router = express.Router()
const db = require('../db')
const { audit } = require('../lib/auth')

const VISITS_PER_YEAR = {
  weekly:          52,
  biweekly:        26,
  'bi-weekly':     26,
  monthly:         13,
  'tri-weekly':    17,
  'every 4 weeks': 13,
  one_time:        1,
  'one time':      1,
  'one-time':      1,
}

// Remaining recurring visits after the initial clean (total minus 1)
const RECURRING_VISITS = {
  weekly:          51,
  biweekly:        25,
  'bi-weekly':     25,
  monthly:         12,
  'tri-weekly':    16,
  'every 4 weeks': 12,
}

function visitsPerYear(frequency) {
  if (!frequency) return null
  const f = frequency.toLowerCase().trim()
  return VISITS_PER_YEAR[f] ?? null
}

// ── Client care pipeline auto-creation ─────────────────────────────────────
// Days between recurring cleans by frequency
const CLEAN_INTERVAL_DAYS = {
  weekly:          7,
  biweekly:        14,
  'bi-weekly':     14,
  monthly:         28,
  'every 4 weeks': 28,
  'tri-weekly':    10,
}

function addDays(dateStr, days) {
  // Use noon UTC to dodge DST edge cases
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().split('T')[0]
}

function createCareTimeline(clientName, frequency, startDate) {
  const base = startDate || new Date().toISOString().split('T')[0]
  const f = (frequency || '').toLowerCase().trim()
  const interval = CLEAN_INTERVAL_DAYS[f] || 14  // default biweekly if unknown

  // 4th recurring = 3 cleans after the 1st recurring
  // 6th recurring = 5 cleans after the 1st recurring
  const fourthOffset = interval * 3
  const sixthOffset  = interval * 5

  const touchpoints = [
    { care_type: 'first_recurring',  scheduled_date: base },
    { care_type: 'fourth_recurring', scheduled_date: addDays(base, fourthOffset) },
    { care_type: 'sixth_recurring',  scheduled_date: addDays(base, sixthOffset) },
    { care_type: 'six_month',        scheduled_date: addMonths(base, 6) },
    { care_type: 'one_year',         scheduled_date: addMonths(base, 12) },
  ]

  const exists = db.prepare(
    `SELECT COUNT(*) AS n FROM client_care WHERE client_name = ?`
  ).get(clientName)

  // Skip if this client already has care entries — prevents duplicates on re-trigger
  if (exists.n > 0) return false

  const stmt = db.prepare(`
    INSERT INTO client_care (client_name, care_type, scheduled_date, notes)
    VALUES (?,?,?,?)
  `)
  for (const tp of touchpoints) {
    stmt.run(clientName, tp.care_type, tp.scheduled_date, 'Auto-created from lead conversion')
  }
  return true
}

// Annual value = initial_clean_price + recurring_price × remaining_visits
// Falls back to old flat calculation if only one price provided
function calcAnnualValue(initialPrice, recurringPrice, frequency, fallbackPrice, cfg) {
  if (!frequency) return null
  const f = frequency.toLowerCase().trim()
  const isOneTime = ['one_type','one time','one-time','priority','move out','ttb','general'].includes(f)

  if (isOneTime) {
    const p = initialPrice ?? fallbackPrice
    return p ? Math.round(p) : null
  }

  const remainingVisits = RECURRING_VISITS[f]
  const totalVisits = VISITS_PER_YEAR[f]

  // If we have both prices, use the two-tier formula
  if (initialPrice && recurringPrice && remainingVisits != null) {
    return Math.round(initialPrice + recurringPrice * remainingVisits)
  }

  // Legacy: single price × all visits
  const price = recurringPrice ?? initialPrice ?? fallbackPrice ?? cfg?.avg_recurring_price
  return (price && totalVisits) ? Math.round(price * totalVisits) : null
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
    const f = (r.frequency || '').toLowerCase().trim()
    const isOneTime = ['one_type','one time','one-time','priority','move out','ttb','general'].includes(f)
    const fallback = isOneTime ? cfg.avg_onetime_price : cfg.avg_recurring_price
    const annual_value = calcAnnualValue(r.initial_clean_price, r.price_per_clean, r.frequency, r.quote_amount, cfg)
      ?? (visits && fallback ? Math.round(visits * fallback) : null)
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
    initial_clean_price,
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

  // Compute annual_value from price + frequency if possible
  const ANNUAL_VISITS_MAP = { weekly:52, biweekly:26, 'bi-weekly':26, 'tri-weekly':17, 'every 4 weeks':13, monthly:13 }
  const freqKey = (frequency || '').toLowerCase().trim()
  const visitsAnnual = ANNUAL_VISITS_MAP[freqKey] || null
  const priceToUse = price_per_clean ?? quote_amount ?? initial_clean_price ?? null
  const annualVal = (visitsAnnual && priceToUse) ? Math.round(parseFloat(priceToUse) * visitsAnnual) : null

  db.prepare(`
    INSERT INTO lead_records
      (record_date, client_name, frequency, price_per_clean, quote_amount, initial_clean_price,
       converted, recurring_retained, initial_clean_booked, lead_source, used_before, reason,
       rep_name, month, source, external_id, notes, annual_value)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(external_id) DO UPDATE SET
      record_date           = excluded.record_date,
      client_name           = excluded.client_name,
      frequency             = excluded.frequency,
      price_per_clean       = excluded.price_per_clean,
      quote_amount          = excluded.quote_amount,
      initial_clean_price   = excluded.initial_clean_price,
      converted             = excluded.converted,
      recurring_retained    = excluded.recurring_retained,
      initial_clean_booked  = excluded.initial_clean_booked,
      lead_source           = excluded.lead_source,
      used_before           = excluded.used_before,
      reason                = excluded.reason,
      rep_name              = excluded.rep_name,
      month                 = excluded.month,
      source                = excluded.source,
      notes                 = excluded.notes,
      annual_value          = COALESCE(excluded.annual_value, annual_value)
  `).run(
    record_date, client_name ?? null, frequency ?? null,
    price_per_clean ?? null, quote_amount ?? null, initial_clean_price ?? null,
    converted ? 1 : 0, recurring_retained ? 1 : 0, initial_clean_booked ? 1 : 0,
    lead_source ?? null, used_before ?? null, reason ?? null,
    rep_name ?? null, month, source, external_id ?? null, notes ?? null,
    annualVal
  )

  audit(req, 'lead_added', `${client_name || 'Unknown'}`)

  // Auto-create care pipeline if new lead is already recurring
  if (recurring_retained) {
    createCareTimeline(client_name || 'Unknown', frequency, record_date)
  }

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
    record_date, client_name, frequency, price_per_clean, quote_amount, initial_clean_price,
    converted, recurring_retained, initial_clean_booked, lead_source, used_before, reason,
    rep_name, notes,
  } = req.body

  const updated = {
    record_date:           record_date           ?? existing.record_date,
    client_name:           client_name           !== undefined ? client_name           : existing.client_name,
    frequency:             frequency             !== undefined ? frequency             : existing.frequency,
    price_per_clean:       price_per_clean       !== undefined ? price_per_clean       : existing.price_per_clean,
    quote_amount:          quote_amount          !== undefined ? quote_amount          : existing.quote_amount,
    initial_clean_price:   initial_clean_price   !== undefined ? initial_clean_price   : existing.initial_clean_price,
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
      record_date=?, client_name=?, frequency=?, price_per_clean=?, quote_amount=?, initial_clean_price=?,
      converted=?, recurring_retained=?, initial_clean_booked=?, lead_source=?, used_before=?, reason=?,
      rep_name=?, notes=?, month=?
    WHERE id=?
  `).run(
    updated.record_date, updated.client_name, updated.frequency,
    updated.price_per_clean, updated.quote_amount, updated.initial_clean_price,
    updated.converted, updated.recurring_retained, updated.initial_clean_booked,
    updated.lead_source, updated.used_before, updated.reason,
    updated.rep_name, updated.notes, updated.month,
    existing.id
  )
  audit(req, 'lead_updated', `ID ${existing.id}`)

  // Auto-create care pipeline when a lead goes recurring for the first time
  if (recurring_retained !== undefined && (recurring_retained ? 1 : 0) === 1 && !existing.recurring_retained) {
    createCareTimeline(
      updated.client_name || existing.client_name || 'Unknown',
      updated.frequency   || existing.frequency,
      new Date().toISOString().split('T')[0]
    )
  }

  res.json({ ok: true })
})

// POST /api/leads/:id/care  — manually create care timeline for a recurring lead
router.post('/:id/care', (req, res) => {
  const lead = db.prepare('SELECT * FROM lead_records WHERE id = ?').get(req.params.id)
  if (!lead) return res.status(404).json({ error: 'Not found' })
  if (!lead.recurring_retained) return res.status(400).json({ error: 'Lead is not marked as recurring' })

  const startDate = req.body.start_date || new Date().toISOString().split('T')[0]
  const created = createCareTimeline(lead.client_name || 'Unknown', lead.frequency, startDate)
  audit(req, 'care_timeline_created', `${lead.client_name} (lead ${lead.id}) — manual trigger`)
  res.json({ ok: true, created, message: created ? 'Care timeline created' : 'Already exists — no changes made' })
})

// DELETE /api/leads/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM lead_records WHERE id = ?').run(req.params.id)
  audit(req, 'lead_deleted', `ID ${req.params.id}`)
  res.json({ ok: true })
})

module.exports = router
