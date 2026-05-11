const express = require('express')
const router = express.Router()
const db = require('../db')

// GET /api/staff/terminations?year=2026
router.get('/terminations', (req, res) => {
  const { year, limit = 500 } = req.query
  let sql = 'SELECT * FROM staff_terminations'
  const params = []
  if (year) {
    sql += ` WHERE SUBSTR(termination_date, 1, 4) = ?`
    params.push(String(year))
  }
  sql += ' ORDER BY termination_date DESC, id DESC LIMIT ?'
  params.push(Math.min(parseInt(limit), 2000))
  res.json(db.prepare(sql).all(...params))
})

// POST /api/staff/terminations — add one (manual or webhook)
router.post('/terminations', (req, res) => {
  const {
    employee_name,
    termination_date,
    termination_type = 'fired',
    reason,
    source = 'manual',
    external_id,
    notes,
  } = req.body

  if (!employee_name) return res.status(400).json({ error: 'employee_name required' })
  if (!termination_date) return res.status(400).json({ error: 'termination_date required' })
  if (!['fired', 'quit'].includes(termination_type)) {
    return res.status(400).json({ error: 'termination_type must be "fired" or "quit"' })
  }

  const result = db.prepare(`
    INSERT INTO staff_terminations
      (employee_name, termination_date, termination_type, reason, source, external_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(external_id) DO UPDATE SET
      employee_name    = excluded.employee_name,
      termination_date = excluded.termination_date,
      termination_type = excluded.termination_type,
      reason           = excluded.reason,
      source           = excluded.source,
      notes            = excluded.notes
  `).run(
    employee_name, termination_date, termination_type,
    reason ?? null, source, external_id ?? null, notes ?? null
  )

  db.prepare(`INSERT INTO audit_log (action_type, entity, description) VALUES ('create','staff_termination',?)`)
    .run(`${termination_type}: ${employee_name} on ${termination_date}`)

  res.json({ ok: true, id: result.lastInsertRowid })
})

// PATCH /api/staff/terminations/:id — toggle type, edit notes/reason
router.patch('/terminations/:id', (req, res) => {
  const { termination_type, notes, reason, termination_date } = req.body
  const row = db.prepare('SELECT * FROM staff_terminations WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Not found' })

  db.prepare(`
    UPDATE staff_terminations SET
      termination_type = COALESCE(?, termination_type),
      notes            = COALESCE(?, notes),
      reason           = COALESCE(?, reason),
      termination_date = COALESCE(?, termination_date)
    WHERE id = ?
  `).run(
    termination_type ?? null,
    notes ?? null,
    reason ?? null,
    termination_date ?? null,
    req.params.id
  )
  res.json({ ok: true })
})

// DELETE /api/staff/terminations/:id
router.delete('/terminations/:id', (req, res) => {
  db.prepare('DELETE FROM staff_terminations WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// GET /api/staff/headcount — baseline setting
router.get('/headcount', (req, res) => {
  const settings = db.prepare(
    "SELECT key, value FROM settings WHERE key IN ('staff_headcount_baseline','staff_headcount_baseline_date')"
  ).all()
  const cfg = Object.fromEntries(settings.map(s => [s.key, s.value]))
  res.json({
    baseline: cfg.staff_headcount_baseline ? parseInt(cfg.staff_headcount_baseline) : null,
    baseline_date: cfg.staff_headcount_baseline_date ?? null,
  })
})

// POST /api/staff/headcount — save baseline
router.post('/headcount', (req, res) => {
  const { baseline, baseline_date } = req.body
  if (baseline !== undefined) {
    db.prepare("UPDATE settings SET value = ? WHERE key = 'staff_headcount_baseline'")
      .run(baseline != null ? String(baseline) : null)
  }
  if (baseline_date !== undefined) {
    db.prepare("UPDATE settings SET value = ? WHERE key = 'staff_headcount_baseline_date'")
      .run(baseline_date ?? null)
  }
  res.json({ ok: true })
})

module.exports = router
