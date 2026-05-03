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
    notes,
    entered_by = 'manager',
  } = req.body

  if (!entry_date) return res.status(400).json({ error: 'entry_date is required' })

  const insert = db.prepare(`
    INSERT INTO manual_entries
      (entry_date, new_hires, staff_quit, staff_fired, call_ins, absences,
       revenue_generating_employees, marketing_spend, notes, entered_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    notes ?? null,
    entered_by
  )

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

module.exports = router
