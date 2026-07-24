const express = require('express')
const router = express.Router()
const db = require('../db')
const { maybeForward } = require('../lib/forward')

// GET /api/breakages?resolved=0|1|all&year=YYYY
router.get('/', (req, res) => {
  const { resolved, year } = req.query
  const now = new Date()
  const y = year || now.getFullYear()

  let sql = `SELECT * FROM breakages WHERE report_date LIKE ?`
  const params = [`${y}-%`]

  if (resolved === '0') { sql += ` AND resolved = 0` }
  else if (resolved === '1') { sql += ` AND resolved = 1` }

  sql += ` ORDER BY resolved ASC, report_date DESC`
  const rows = db.prepare(sql).all(...params)

  const totalValue = rows.reduce((s, r) => s + (r.value || 0), 0)
  const unresolvedValue = rows.filter(r => !r.resolved).reduce((s, r) => s + (r.value || 0), 0)

  res.json({
    breakages: rows,
    stats: {
      total: rows.length,
      unresolved: rows.filter(r => !r.resolved).length,
      resolved: rows.filter(r => r.resolved).length,
      total_value: Math.round(totalValue * 100) / 100,
      unresolved_value: Math.round(unresolvedValue * 100) / 100,
    }
  })
})

// POST /api/breakages
router.post('/', (req, res) => {
  const {
    report_date, tech_name, client_name, item_broken,
    value, resolved = 0, resolution_notes, notes
  } = req.body

  if (!item_broken) return res.status(400).json({ error: 'item_broken required' })
  if (!report_date) return res.status(400).json({ error: 'report_date required' })

  const result = db.prepare(`
    INSERT INTO breakages (report_date, tech_name, client_name, item_broken, value, resolved, resolution_notes, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    report_date,
    tech_name ?? null,
    client_name ?? null,
    item_broken,
    value ? parseFloat(value) : null,
    resolved ? 1 : 0,
    resolution_notes ?? null,
    notes ?? null
  )

  maybeForward('breakages', result.lastInsertRowid, 'breakage', { tech: tech_name, date: report_date, client: client_name, note: item_broken })
  res.json({ ok: true, id: result.lastInsertRowid })
})

// PATCH /api/breakages/:id
router.patch('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM breakages WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Not found' })

  const {
    report_date, tech_name, client_name, item_broken,
    value, resolved, resolution_notes, notes
  } = req.body

  db.prepare(`
    UPDATE breakages SET
      report_date      = COALESCE(?, report_date),
      tech_name        = COALESCE(?, tech_name),
      client_name      = COALESCE(?, client_name),
      item_broken      = COALESCE(?, item_broken),
      value            = COALESCE(?, value),
      resolved         = COALESCE(?, resolved),
      resolution_notes = COALESCE(?, resolution_notes),
      notes            = COALESCE(?, notes)
    WHERE id = ?
  `).run(
    report_date ?? null,
    tech_name ?? null,
    client_name ?? null,
    item_broken ?? null,
    value !== undefined ? (value !== null ? parseFloat(value) : null) : null,
    resolved !== undefined ? (resolved ? 1 : 0) : null,
    resolution_notes ?? null,
    notes ?? null,
    req.params.id
  )

  res.json({ ok: true })
})

// DELETE /api/breakages/:id
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM breakages WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Not found' })
  db.prepare('DELETE FROM breakages WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

module.exports = router
