const express = require('express')
const router = express.Router()
const db = require('../db')
const CODES = require('../lib/cancellationCodes')
const { audit } = require('../lib/auth')

function resolveCode(code) {
  if (!code) return { label: null, category: null }
  const upper = code.toUpperCase().trim().split(/[\s–-]/)[0]
  return CODES[upper] || { label: code, category: 'Other' }
}

// GET /api/cancellations?year=YYYY
router.get('/', (req, res) => {
  const year = req.query.year || new Date().getFullYear()
  const rows = db.prepare(
    `SELECT * FROM cancelled_clients WHERE cancel_date LIKE ? ORDER BY cancel_date DESC`
  ).all(`${year}-%`)

  const byCategory = {}
  const byCode = {}
  const byTechnician = {}
  let totalLost = 0, totalSaved = 0, totalPaused = 0
  let revenueLost = 0, annualLost = 0

  const ANNUAL_MULT = { weekly: 52, biweekly: 26, 'bi-weekly': 26, monthly: 13, 'every 4 weeks': 13 }
  const MONTHLY_MULT = { weekly: 4.33, biweekly: 2.17, 'bi-weekly': 2.17, monthly: 1, 'every 4 weeks': 1 }

  const enriched = rows.map(r => {
    let annual = r.annual_value_lost
    let monthly = r.revenue_lost_monthly
    if (!annual && r.price_per_visit && r.frequency) {
      const freq = r.frequency.toLowerCase().trim()
      const am = ANNUAL_MULT[freq]; const mm = MONTHLY_MULT[freq]
      if (am) annual = Math.round(r.price_per_visit * am)
      if (mm && !monthly) monthly = Math.round(r.price_per_visit * mm * 100) / 100
    }
    return { ...r, annual_value_lost: annual, revenue_lost_monthly: monthly }
  })

  enriched.forEach(r => {
    const cat = r.reason_category || 'Unknown'
    byCategory[cat] = (byCategory[cat] || 0) + 1
    if (r.reason_code) byCode[r.reason_code] = (byCode[r.reason_code] || 0) + 1
    if (r.technician)  byTechnician[r.technician] = (byTechnician[r.technician] || 0) + 1
    if (r.save_outcome === 'Lost') totalLost++
    else if (r.save_outcome === 'Saved') totalSaved++
    else if (r.save_outcome === 'Paused') totalPaused++
    revenueLost += r.revenue_lost_monthly || 0
    annualLost  += r.annual_value_lost    || 0
  })

  res.json({
    cancellations: enriched,
    stats: {
      total: rows.length,
      lost: totalLost,
      saved: totalSaved,
      paused: totalPaused,
      save_rate: rows.length > 0 ? Math.round((totalSaved / rows.length) * 100) : 0,
      revenue_lost_monthly: Math.round(revenueLost),
      annual_value_lost: Math.round(annualLost),
      by_category: byCategory,
      by_code: byCode,
      by_technician: byTechnician,
    },
  })
})

// POST /api/cancellations  (manual entry)
router.post('/', (req, res) => {
  const {
    client_id, client_name, cancel_date, reason_code,
    client_quote, save_attempted, save_outcome, solution_offered,
    frequency, recurring_months, revenue_lost_monthly, notes,
    price_per_visit, annual_value_lost, technician,
  } = req.body

  if (!cancel_date) return res.status(400).json({ error: 'cancel_date required' })

  const { label, category } = resolveCode(reason_code)

  const result = db.prepare(`
    INSERT INTO cancelled_clients
      (client_id, client_name, cancel_date, reason_code, reason_label, reason_category,
       client_quote, save_attempted, save_outcome, solution_offered,
       frequency, recurring_months, revenue_lost_monthly, notes, source,
       price_per_visit, annual_value_lost, technician)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'manual',?,?,?)
  `).run(
    client_id ?? null, client_name ?? null, cancel_date,
    reason_code ?? null, label, category,
    client_quote ?? null,
    save_attempted ? 1 : 0,
    save_outcome ?? null, solution_offered ?? null,
    frequency ?? null,
    recurring_months ? parseInt(recurring_months) : null,
    revenue_lost_monthly ? parseFloat(revenue_lost_monthly) : null,
    notes ?? null,
    price_per_visit ? parseFloat(price_per_visit) : null,
    annual_value_lost ? parseFloat(annual_value_lost) : null,
    technician ?? null
  )

  // Auto-add T-coded cancellations to nurture queue
  if (reason_code && reason_code.toUpperCase().startsWith('T')) {
    const next30 = new Date()
    next30.setDate(next30.getDate() + 30)
    db.prepare(`
      INSERT OR IGNORE INTO client_nurture
        (cancelled_id, client_id, client_name, reason_code, cancel_date, next_contact)
      VALUES (?,?,?,?,?,?)
    `).run(
      result.lastInsertRowid,
      client_id ?? null, client_name ?? null,
      reason_code, cancel_date,
      next30.toISOString().split('T')[0]
    )
  }

  audit(req, 'cancellation_added', `${client_name || 'Unknown'} — ${cancel_date}`)
  res.json({ ok: true, id: result.lastInsertRowid })
})

// PATCH /api/cancellations/:id  (update reason code + structured fields)
router.patch('/:id', (req, res) => {
  const {
    reason_code, client_quote, save_attempted, save_outcome,
    solution_offered, frequency, recurring_months, revenue_lost_monthly, notes,
    price_per_visit, annual_value_lost, technician,
  } = req.body

  const { label, category } = resolveCode(reason_code)

  db.prepare(`
    UPDATE cancelled_clients SET
      reason_code          = COALESCE(?, reason_code),
      reason_label         = CASE WHEN ? IS NOT NULL THEN ? ELSE reason_label END,
      reason_category      = CASE WHEN ? IS NOT NULL THEN ? ELSE reason_category END,
      client_quote         = COALESCE(?, client_quote),
      save_attempted       = COALESCE(?, save_attempted),
      save_outcome         = COALESCE(?, save_outcome),
      solution_offered     = COALESCE(?, solution_offered),
      frequency            = COALESCE(?, frequency),
      recurring_months     = COALESCE(?, recurring_months),
      revenue_lost_monthly = COALESCE(?, revenue_lost_monthly),
      notes                = COALESCE(?, notes),
      price_per_visit      = COALESCE(?, price_per_visit),
      annual_value_lost    = COALESCE(?, annual_value_lost),
      technician           = COALESCE(?, technician)
    WHERE id = ?
  `).run(
    reason_code ?? null,
    reason_code ?? null, label,
    reason_code ?? null, category,
    client_quote ?? null,
    save_attempted !== undefined ? (save_attempted ? 1 : 0) : null,
    save_outcome ?? null,
    solution_offered ?? null,
    frequency ?? null,
    recurring_months !== undefined ? parseInt(recurring_months) || null : null,
    revenue_lost_monthly !== undefined ? parseFloat(revenue_lost_monthly) || null : null,
    notes ?? null,
    price_per_visit !== undefined ? parseFloat(price_per_visit) || null : null,
    annual_value_lost !== undefined ? parseFloat(annual_value_lost) || null : null,
    technician ?? null,
    req.params.id
  )

  audit(req, 'cancellation_updated', `ID ${req.params.id} — ${Object.keys(req.body).join(', ')}`)

  // If reason code is now T-coded, add to nurture if not already there
  if (reason_code && reason_code.toUpperCase().startsWith('T')) {
    const existing = db.prepare('SELECT id FROM client_nurture WHERE cancelled_id = ?').get(req.params.id)
    if (!existing) {
      const row = db.prepare('SELECT client_id, client_name, cancel_date FROM cancelled_clients WHERE id = ?').get(req.params.id)
      if (row) {
        const next30 = new Date()
        next30.setDate(next30.getDate() + 30)
        db.prepare(`
          INSERT OR IGNORE INTO client_nurture
            (cancelled_id, client_id, client_name, reason_code, cancel_date, next_contact)
          VALUES (?,?,?,?,?,?)
        `).run(req.params.id, row.client_id, row.client_name, reason_code, row.cancel_date, next30.toISOString().split('T')[0])
      }
    }
  }

  res.json({ ok: true })
})

// DELETE /api/cancellations/:id
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT client_name, cancel_date FROM cancelled_clients WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Not found' })
  db.prepare('DELETE FROM client_nurture WHERE cancelled_id = ?').run(req.params.id)
  db.prepare('DELETE FROM cancelled_clients WHERE id = ?').run(req.params.id)
  audit(req, 'cancellation_deleted', `${row.client_name || 'Unknown'} — ${row.cancel_date}`)
  res.json({ ok: true })
})

// GET /api/cancellations/codes  — return all valid codes for UI dropdowns
router.get('/codes', (req, res) => {
  res.json(CODES)
})

module.exports = router
