const express = require('express')
const router = express.Router()
const db = require('../db')

// POST a new manual entry
router.post('/', (req, res) => {
  const {
    entry_date,
    new_hires = 0,
    staff_quit = 0,
    staff_fired = 0,
    call_ins = 0,
    absences = 0,
    revenue_generating_employees,
    marketing_spend,
    skips = 0,
    client_count,     // snapshot of current recurring client count
    gift_card_sales,  // optional — Gift Up or manual phone sale
    daily_revenue,    // today's invoice revenue from MC (excl. tips); summed into MTD automatically
    notes,
    entered_by = 'manager',
  } = req.body

  if (!entry_date) return res.status(400).json({ error: 'entry_date is required' })

  const insert = db.prepare(`
    INSERT INTO manual_entries
      (entry_date, new_hires, staff_quit, staff_fired, call_ins, absences,
       revenue_generating_employees, marketing_spend, skips, client_count, gift_card_sales, daily_revenue, notes, entered_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(entry_date, entered_by) DO UPDATE SET
      new_hires = excluded.new_hires,
      staff_quit = excluded.staff_quit,
      staff_fired = excluded.staff_fired,
      call_ins = excluded.call_ins,
      absences = excluded.absences,
      revenue_generating_employees = excluded.revenue_generating_employees,
      marketing_spend = excluded.marketing_spend,
      skips = excluded.skips,
      client_count = excluded.client_count,
      gift_card_sales = excluded.gift_card_sales,
      daily_revenue = excluded.daily_revenue,
      notes = excluded.notes
  `)

  const result = insert.run(
    entry_date,
    new_hires,
    staff_quit,
    staff_fired,
    call_ins,
    absences,
    revenue_generating_employees ?? null,
    marketing_spend ?? null,
    skips || 0,
    client_count ?? null,
    gift_card_sales ?? null,
    daily_revenue != null ? parseFloat(daily_revenue) : null,
    notes ?? null,
    entered_by
  )

  // If a client count snapshot was provided, update monthly_sales for that month
  if (client_count != null) {
    const month = entry_date.slice(0, 7)
    db.prepare(`
      INSERT INTO monthly_sales (month, recurring_clients)
      VALUES (?, ?)
      ON CONFLICT(month) DO UPDATE SET recurring_clients = excluded.recurring_clients
    `).run(month, parseInt(client_count))
    // Also keep the settings snapshot for the live Overview count
    db.prepare(`UPDATE settings SET value = ? WHERE key = 'recurring_clients_current'`).run(String(client_count))
  }

  db.prepare(
    `INSERT INTO audit_log (action_type, entity, description) VALUES ('create', 'manual_entry', ?)`
  ).run(`Entry for ${entry_date} by ${entered_by}`)

  res.json({ ok: true, id: result.lastInsertRowid })
})

// GET recent manual entries (default: last 30)
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 200)
  const rows = db.prepare(
    `SELECT * FROM manual_entries ORDER BY entry_date DESC, id DESC LIMIT ?`
  ).all(limit)
  res.json(rows)
})

// GET a single entry by id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM manual_entries WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Not found' })
  res.json(row)
})

// PATCH /api/entry/manual/:id — update specific fields on an entry
router.patch('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM manual_entries WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Not found' })

  const {
    daily_revenue, new_hires, staff_quit, staff_fired, call_ins,
    absences, revenue_generating_employees, marketing_spend,
    skips, client_count, gift_card_sales, notes, entry_date,
  } = req.body

  db.prepare(`
    UPDATE manual_entries SET
      entry_date                 = COALESCE(?, entry_date),
      daily_revenue              = ?,
      new_hires                  = COALESCE(?, new_hires),
      staff_quit                 = COALESCE(?, staff_quit),
      staff_fired                = COALESCE(?, staff_fired),
      call_ins                   = COALESCE(?, call_ins),
      absences                   = COALESCE(?, absences),
      revenue_generating_employees = COALESCE(?, revenue_generating_employees),
      marketing_spend            = COALESCE(?, marketing_spend),
      skips                      = COALESCE(?, skips),
      client_count               = COALESCE(?, client_count),
      gift_card_sales            = COALESCE(?, gift_card_sales),
      notes                      = COALESCE(?, notes)
    WHERE id = ?
  `).run(
    entry_date ?? null,
    daily_revenue !== undefined ? (daily_revenue !== null ? parseFloat(daily_revenue) : null) : row.daily_revenue,
    new_hires ?? null, staff_quit ?? null, staff_fired ?? null,
    call_ins ?? null, absences ?? null,
    revenue_generating_employees ?? null, marketing_spend ?? null,
    skips ?? null, client_count ?? null, gift_card_sales ?? null,
    notes ?? null,
    req.params.id
  )
  res.json({ ok: true })
})

// DELETE /api/entry/manual/:id
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM manual_entries WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Not found' })
  db.prepare('DELETE FROM manual_entries WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

module.exports = router
