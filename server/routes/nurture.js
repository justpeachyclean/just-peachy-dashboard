const express = require('express')
const router = express.Router()
const db = require('../db')
const { audit } = require('../lib/auth')

// GET /api/nurture
router.get('/', (req, res) => {
  const rows = db.prepare(
    `SELECT n.*, c.client_quote, c.reason_label, c.frequency, c.revenue_lost_monthly
     FROM client_nurture n
     LEFT JOIN cancelled_clients c ON c.id = n.cancelled_id
     ORDER BY n.next_contact ASC, n.cancel_date DESC`
  ).all()
  res.json(rows)
})

// PATCH /api/nurture/:id  (update status / notes / next_contact)
router.patch('/:id', (req, res) => {
  const { status, contact_notes, next_contact, won_back, won_back_date } = req.body
  const { id } = req.params

  db.prepare(`
    UPDATE client_nurture SET
      status       = COALESCE(?, status),
      contact_notes = COALESCE(?, contact_notes),
      next_contact = COALESCE(?, next_contact),
      won_back     = COALESCE(?, won_back),
      won_back_date = COALESCE(?, won_back_date),
      updated_at   = datetime('now')
    WHERE id = ?
  `).run(
    status ?? null, contact_notes ?? null, next_contact ?? null,
    won_back !== undefined ? (won_back ? 1 : 0) : null,
    won_back_date ?? null, id
  )
  audit(req, 'nurture_updated', `ID ${id}`)
  res.json({ ok: true })
})

// DELETE /api/nurture/:id
router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM client_nurture WHERE id = ?`).run(req.params.id)
  audit(req, 'nurture_deleted', `ID ${req.params.id}`)
  res.json({ ok: true })
})

// POST /api/nurture  (manually add a client to nurture)
router.post('/', (req, res) => {
  const { client_id, client_name, reason_code, cancel_date, next_contact } = req.body
  if (!client_name) return res.status(400).json({ error: 'client_name required' })

  const next = next_contact || (() => {
    const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]
  })()

  const result = db.prepare(`
    INSERT INTO client_nurture (client_id, client_name, reason_code, cancel_date, next_contact)
    VALUES (?,?,?,?,?)
  `).run(client_id ?? null, client_name, reason_code ?? null, cancel_date ?? null, next)

  res.json({ ok: true, id: result.lastInsertRowid })
})

module.exports = router
