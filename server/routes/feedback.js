const express = require('express')
const router = express.Router()
const db = require('../db')

// GET /api/feedback?year=YYYY
router.get('/', (req, res) => {
  const year = req.query.year || new Date().getFullYear()
  const rows = db.prepare(
    `SELECT * FROM client_feedback WHERE feedback_date LIKE ? ORDER BY feedback_date DESC`
  ).all(`${year}-%`)

  const total = rows.length
  const avgRating = total > 0
    ? Math.round((rows.reduce((s, r) => s + (r.rating || 0), 0) / total) * 10) / 10
    : null

  // Monthly avg ratings
  const byMonth = {}
  rows.forEach(r => {
    const m = r.feedback_date?.slice(0, 7)
    if (!m) return
    if (!byMonth[m]) byMonth[m] = { sum: 0, count: 0 }
    byMonth[m].sum += r.rating || 0
    byMonth[m].count++
  })

  const monthly = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { sum, count }]) => ({
      month,
      avg: Math.round((sum / count) * 10) / 10,
      count,
    }))

  res.json({ feedback: rows, stats: { total, avg_rating: avgRating, monthly } })
})

// POST /api/feedback  (manual entry)
router.post('/', (req, res) => {
  const { client_id, client_name, feedback_date, rating, feedback_type, comment, tech_name } = req.body
  if (!feedback_date) return res.status(400).json({ error: 'feedback_date required' })

  const result = db.prepare(`
    INSERT INTO client_feedback
      (client_id, client_name, feedback_date, rating, feedback_type, comment, tech_name, source)
    VALUES (?,?,?,?,?,?,?,'manual')
  `).run(
    client_id ?? null, client_name ?? null, feedback_date,
    rating ? parseInt(rating) : null,
    feedback_type || 'survey',
    comment ?? null, tech_name ?? null
  )

  res.json({ ok: true, id: result.lastInsertRowid })
})

// PATCH /api/feedback/:id
router.patch('/:id', (req, res) => {
  const { client_name, feedback_date, rating, feedback_type, comment, tech_name } = req.body
  db.prepare(`
    UPDATE client_feedback SET
      client_name   = COALESCE(?, client_name),
      feedback_date = COALESCE(?, feedback_date),
      rating        = COALESCE(?, rating),
      feedback_type = COALESCE(?, feedback_type),
      comment       = COALESCE(?, comment),
      tech_name     = COALESCE(?, tech_name)
    WHERE id = ?
  `).run(
    client_name ?? null, feedback_date ?? null,
    rating ? parseInt(rating) : null,
    feedback_type ?? null, comment ?? null, tech_name ?? null,
    req.params.id
  )
  res.json({ ok: true })
})

// DELETE /api/feedback/:id
router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM client_feedback WHERE id = ?`).run(req.params.id)
  res.json({ ok: true })
})

module.exports = router
