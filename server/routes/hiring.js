const express = require('express')
const router = express.Router()
const db = require('../db')
const { audit } = require('../lib/auth')

// GET /api/hiring?year=2026&stage=all
router.get('/', (req, res) => {
  const { stage, year } = req.query
  const currentYear = year || new Date().getFullYear()

  let sql = `SELECT * FROM hiring_pipeline WHERE strftime('%Y', created_at) = ?`
  const params = [String(currentYear)]
  if (stage && stage !== 'all') {
    sql += ` AND stage = ?`
    params.push(stage)
  }
  sql += ` ORDER BY stage_date DESC, created_at DESC`

  const rows = db.prepare(sql).all(...params)

  // KPIs
  const all = db.prepare(`SELECT * FROM hiring_pipeline WHERE strftime('%Y', created_at) = ?`).all(String(currentYear))
  const kpi = {
    total_applicants: all.length,
    interviews: all.filter(r => ['interviewed','offered','hired'].includes(r.stage)).length,
    hired: all.filter(r => r.hired || r.stage === 'hired').length,
    no_shows: all.filter(r => r.no_show).length,
    in_pipeline: all.filter(r => !['hired','rejected','no_show'].includes(r.stage)).length,
  }

  res.json({ applicants: rows, kpi })
})

// POST /api/hiring — manual add
router.post('/', (req, res) => {
  const { applicant_name, phone, email, stage = 'applied', stage_date, source = 'manual', position, notes } = req.body
  if (!applicant_name) return res.status(400).json({ error: 'applicant_name required' })

  const result = db.prepare(`
    INSERT INTO hiring_pipeline (applicant_name, phone, email, stage, stage_date, source, position, notes)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(applicant_name, phone ?? null, email ?? null, stage, stage_date ?? new Date().toISOString().split('T')[0], source, position ?? null, notes ?? null)

  audit(req, 'applicant_added', applicant_name)
  res.json({ ok: true, id: result.lastInsertRowid })
})

// PATCH /api/hiring/:id — update stage or notes
router.patch('/:id', (req, res) => {
  const { stage, stage_date, notes, hired, hire_date, no_show, position } = req.body
  db.prepare(`
    UPDATE hiring_pipeline SET
      stage      = COALESCE(?, stage),
      stage_date = COALESCE(?, stage_date),
      notes      = COALESCE(?, notes),
      hired      = COALESCE(?, hired),
      hire_date  = COALESCE(?, hire_date),
      no_show    = COALESCE(?, no_show),
      position   = COALESCE(?, position),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    stage ?? null, stage_date ?? null, notes ?? null,
    hired !== undefined ? (hired ? 1 : 0) : null,
    hire_date ?? null,
    no_show !== undefined ? (no_show ? 1 : 0) : null,
    position ?? null,
    req.params.id
  )
  audit(req, 'applicant_updated', `ID ${req.params.id}`)
  res.json({ ok: true })
})

// DELETE /api/hiring/:id
router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM hiring_pipeline WHERE id = ?`).run(req.params.id)
  audit(req, 'applicant_deleted', `ID ${req.params.id}`)
  res.json({ ok: true })
})

module.exports = router
