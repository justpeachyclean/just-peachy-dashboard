const express = require('express')
const router = express.Router()
const db = require('../db')

// GET /api/recleans?year=YYYY
router.get('/', (req, res) => {
  const year = req.query.year || new Date().getFullYear()
  const recleans = db.prepare(`
    SELECT * FROM recleans
    WHERE reclean_date LIKE ?
    ORDER BY reclean_date DESC
  `).all(`${year}-%`)

  const monthMap = {}
  const techMap = {}
  for (const r of recleans) {
    const month = r.reclean_date?.slice(0, 7)
    if (month) monthMap[month] = (monthMap[month] || 0) + 1
    if (r.tech_name) techMap[r.tech_name] = (techMap[r.tech_name] || 0) + 1
  }

  const monthly = Object.entries(monthMap)
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month))

  const by_tech = Object.entries(techMap)
    .map(([tech, count]) => ({ tech, count }))
    .sort((a, b) => b.count - a.count)

  res.json({ recleans, stats: { total: recleans.length, monthly, by_tech } })
})

// POST /api/recleans
router.post('/', (req, res) => {
  const { reclean_date, original_clean_date, client_name, tech_name, reason, notes } = req.body
  if (!reclean_date) return res.status(400).json({ error: 'reclean_date required' })
  const r = db.prepare(`
    INSERT INTO recleans (reclean_date, original_clean_date, client_name, tech_name, reason, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(reclean_date, original_clean_date || null, client_name || null, tech_name || null, reason || null, notes || null)
  res.json({ ok: true, id: r.lastInsertRowid })
})

// PATCH /api/recleans/:id
router.patch('/:id', (req, res) => {
  const { reclean_date, original_clean_date, client_name, tech_name, reason, notes } = req.body
  db.prepare(`
    UPDATE recleans SET
      reclean_date        = COALESCE(?, reclean_date),
      original_clean_date = COALESCE(?, original_clean_date),
      client_name         = COALESCE(?, client_name),
      tech_name           = COALESCE(?, tech_name),
      reason              = COALESCE(?, reason),
      notes               = COALESCE(?, notes)
    WHERE id = ?
  `).run(reclean_date, original_clean_date, client_name, tech_name, reason, notes, req.params.id)
  res.json({ ok: true })
})

// DELETE /api/recleans/:id
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM recleans WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Not found' })
  db.prepare('DELETE FROM recleans WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

module.exports = router
