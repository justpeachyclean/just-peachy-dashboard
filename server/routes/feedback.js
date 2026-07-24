const express = require('express')
const router = express.Router()
const db = require('../db')
const { audit } = require('../lib/auth')
const { maybeForward } = require('../lib/forward')

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

// POST /api/feedback/import  (bulk scorecard import — additive, never overwrites manual)
router.post('/import', (req, res) => {
  const { records } = req.body
  if (!Array.isArray(records) || records.length === 0)
    return res.status(400).json({ error: 'records array required' })

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO client_feedback
      (client_name, feedback_date, rating, feedback_type, comment, tech_name, external_id, source)
    VALUES (?,?,?,?,?,?,?,'scorecard')
  `)

  let inserted = 0, skipped = 0
  db.transaction(() => {
    for (const rec of records) {
      const { client_name, feedback_date, rating, feedback_type, comment, tech_name, external_id } = rec
      if (!feedback_date) { skipped++; continue }

      // Never overwrite a manual entry for the same client + date
      if (client_name) {
        const manual = db.prepare(
          `SELECT id FROM client_feedback WHERE source='manual' AND LOWER(client_name)=LOWER(?) AND feedback_date=? LIMIT 1`
        ).get(client_name, feedback_date)
        if (manual) { skipped++; continue }
      }

      const r = insertStmt.run(
        client_name ?? null, feedback_date,
        rating != null ? Math.round(parseFloat(rating)) : null,
        feedback_type || 'scorecard',
        comment ?? null, tech_name ?? null,
        external_id ?? null
      )
      if (r.changes > 0) inserted++; else skipped++
    }
  })()

  // NOTE: bulk scorecards are NOT forwarded per-record to the Barometer — they are reviews that
  // already belong in Quality (via the tech's average rating), so per-row praise/complaint would
  // double-count. A future "average rating → Quality" bridge is the right approach.
  audit(req, 'feedback_imported', `${inserted} inserted, ${skipped} skipped`)
  res.json({ ok: true, inserted, skipped })
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

  // praise (≥4★) helps the tech's score, complaint (≤2★) hurts it; 3★ is neutral
  const r = rating ? parseInt(rating) : null
  if (tech_name && r != null && r !== 3) {
    maybeForward('client_feedback', result.lastInsertRowid, r >= 4 ? 'praise' : 'complaint', { tech: tech_name, date: feedback_date, client: client_name, note: comment })
  }
  audit(req, 'feedback_added', `${client_name || 'Unknown'} — ${rating}★`)
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
  audit(req, 'feedback_updated', `ID ${req.params.id}`)
  res.json({ ok: true })
})

// DELETE /api/feedback/:id
router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM client_feedback WHERE id = ?`).run(req.params.id)
  audit(req, 'feedback_deleted', `ID ${req.params.id}`)
  res.json({ ok: true })
})

module.exports = router
