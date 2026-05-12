const express = require('express')
const router = express.Router()
const db = require('../db')
const { audit } = require('../lib/auth')

// GET /api/care?status=pending|completed|all
router.get('/', (req, res) => {
  const { status = 'all' } = req.query
  let where = ''
  if (status === 'pending')   where = 'WHERE completed = 0'
  if (status === 'completed') where = 'WHERE completed = 1'

  const rows = db.prepare(
    `SELECT * FROM client_care ${where} ORDER BY completed ASC, scheduled_date ASC, created_at DESC`
  ).all()

  // KPI counts
  const today = new Date().toISOString().split('T')[0]
  const weekEnd = new Date(Date.now() + 7 * 864e5).toISOString().split('T')[0]
  const monthStart = today.slice(0, 7) + '-01'

  const all = db.prepare('SELECT * FROM client_care').all()
  const pending = all.filter(r => !r.completed)
  const kpi = {
    due_this_week:    pending.filter(r => r.scheduled_date && r.scheduled_date <= weekEnd).length,
    overdue:          pending.filter(r => r.scheduled_date && r.scheduled_date < today).length,
    completed_month:  all.filter(r => r.completed && r.completed_date >= monthStart).length,
    gifts_sent:       all.filter(r => r.completed && r.gift_type).length,
  }

  res.json({ care: rows, kpi })
})

// POST /api/care
router.post('/', (req, res) => {
  const { client_id, client_name, care_type, gift_type, gift_notes, scheduled_date, notes, assigned_to } = req.body
  if (!client_name) return res.status(400).json({ error: 'client_name required' })
  if (!care_type)   return res.status(400).json({ error: 'care_type required' })

  const result = db.prepare(`
    INSERT INTO client_care (client_id, client_name, care_type, gift_type, gift_notes, scheduled_date, notes, assigned_to)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(
    client_id ?? null, client_name, care_type,
    gift_type ?? null, gift_notes ?? null,
    scheduled_date ?? null, notes ?? null, assigned_to ?? null
  )
  audit(req, 'care_added', `${client_name} — ${care_type}`)
  res.json({ ok: true, id: result.lastInsertRowid })
})

// PATCH /api/care/:id
router.patch('/:id', (req, res) => {
  const { client_name, care_type, gift_type, gift_notes, scheduled_date, completed, completed_date, notes, assigned_to } = req.body
  // 'completed_date' in req.body means the key was sent (even if null) — allows explicit clear
  const completedDatePresent = 'completed_date' in req.body
  db.prepare(`
    UPDATE client_care SET
      client_name    = COALESCE(?, client_name),
      care_type      = COALESCE(?, care_type),
      gift_type      = COALESCE(?, gift_type),
      gift_notes     = COALESCE(?, gift_notes),
      scheduled_date = COALESCE(?, scheduled_date),
      completed      = COALESCE(?, completed),
      completed_date = CASE WHEN ? THEN ? ELSE completed_date END,
      notes          = COALESCE(?, notes),
      assigned_to    = COALESCE(?, assigned_to),
      updated_at     = datetime('now')
    WHERE id = ?
  `).run(
    client_name ?? null, care_type ?? null, gift_type ?? null, gift_notes ?? null,
    scheduled_date ?? null,
    completed !== undefined ? (completed ? 1 : 0) : null,
    completedDatePresent ? 1 : 0, completed_date ?? null,
    notes ?? null, assigned_to ?? null,
    req.params.id
  )
  audit(req, 'care_updated', `ID ${req.params.id}`)
  res.json({ ok: true })
})

// DELETE /api/care/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM client_care WHERE id = ?').run(req.params.id)
  audit(req, 'care_deleted', `ID ${req.params.id}`)
  res.json({ ok: true })
})

module.exports = router
