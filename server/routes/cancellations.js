const express = require('express')
const router = express.Router()
const db = require('../db')
const CODES = require('../lib/cancellationCodes')

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
  let totalLost = 0, totalSaved = 0, totalPaused = 0
  let revenueLost = 0

  rows.forEach(r => {
    const cat = r.reason_category || 'Unknown'
    byCategory[cat] = (byCategory[cat] || 0) + 1
    if (r.reason_code) byCode[r.reason_code] = (byCode[r.reason_code] || 0) + 1
    if (r.save_outcome === 'Lost') totalLost++
    else if (r.save_outcome === 'Saved') totalSaved++
    else if (r.save_outcome === 'Paused') totalPaused++
    revenueLost += r.revenue_lost_monthly || 0
  })

  res.json({
    cancellations: rows,
    stats: {
      total: rows.length,
      lost: totalLost,
      saved: totalSaved,
      paused: totalPaused,
      save_rate: rows.length > 0 ? Math.round((totalSaved / rows.length) * 100) : 0,
      revenue_lost_monthly: Math.round(revenueLost),
      by_category: byCategory,
      by_code: byCode,
    },
  })
})

// POST /api/cancellations  (manual entry)
router.post('/', (req, res) => {
  const {
    client_id, client_name, cancel_date, reason_code,
    client_quote, save_attempted, save_outcome, solution_offered,
    frequency, recurring_months, revenue_lost_monthly, notes,
  } = req.body

  if (!cancel_date) return res.status(400).json({ error: 'cancel_date required' })

  const { label, category } = resolveCode(reason_code)

  const result = db.prepare(`
    INSERT INTO cancelled_clients
      (client_id, client_name, cancel_date, reason_code, reason_label, reason_category,
       client_quote, save_attempted, save_outcome, solution_offered,
       frequency, recurring_months, revenue_lost_monthly, notes, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'manual')
  `).run(
    client_id ?? null, client_name ?? null, cancel_date,
    reason_code ?? null, label, category,
    client_quote ?? null,
    save_attempted ? 1 : 0,
    save_outcome ?? null, solution_offered ?? null,
    frequency ?? null,
    recurring_months ? parseInt(recurring_months) : null,
    revenue_lost_monthly ? parseFloat(revenue_lost_monthly) : null,
    notes ?? null
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

  res.json({ ok: true, id: result.lastInsertRowid })
})

// PATCH /api/cancellations/:id  (update reason code + structured fields)
router.patch('/:id', (req, res) => {
  const {
    reason_code, client_quote, save_attempted, save_outcome,
    solution_offered, frequency, recurring_months, revenue_lost_monthly, notes,
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
      notes                = COALESCE(?, notes)
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
    req.params.id
  )

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

// GET /api/cancellations/codes  — return all valid codes for UI dropdowns
router.get('/codes', (req, res) => {
  res.json(CODES)
})

module.exports = router
