const express = require('express')
const router = express.Router()
const db = require('../db')
const { audit } = require('../lib/auth')

// GET /api/referrals
router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT * FROM referrals ORDER BY referral_date DESC, id DESC`).all()
  res.json(rows)
})

// POST /api/referrals
router.post('/', (req, res) => {
  const { referrer_name, client_name, referral_date, third_clean_date, one_year_date,
          payout_150_paid, payout_150_date, payout_200_paid, payout_200_date, notes } = req.body
  if (!referrer_name || !client_name || !referral_date)
    return res.status(400).json({ error: 'referrer_name, client_name, and referral_date are required' })
  const result = db.prepare(`
    INSERT INTO referrals (referrer_name, client_name, referral_date, third_clean_date, one_year_date,
      payout_150_paid, payout_150_date, payout_200_paid, payout_200_date, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    referrer_name, client_name, referral_date,
    third_clean_date ?? null, one_year_date ?? null,
    payout_150_paid ? 1 : 0, payout_150_date ?? null,
    payout_200_paid ? 1 : 0, payout_200_date ?? null,
    notes ?? null
  )
  audit(req, 'referral_added', `${referrer_name} → ${client_name}`)
  res.json({ ok: true, id: result.lastInsertRowid })
})

// PATCH /api/referrals/:id
router.patch('/:id', (req, res) => {
  const { id } = req.params
  const { referrer_name, client_name, referral_date, third_clean_date, one_year_date,
          payout_150_paid, payout_150_date, payout_200_paid, payout_200_date, notes } = req.body
  const existing = db.prepare('SELECT * FROM referrals WHERE id=?').get(id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  db.prepare(`
    UPDATE referrals SET
      referrer_name    = COALESCE(?, referrer_name),
      client_name      = COALESCE(?, client_name),
      referral_date    = COALESCE(?, referral_date),
      third_clean_date = ?,
      one_year_date    = ?,
      payout_150_paid  = COALESCE(?, payout_150_paid),
      payout_150_date  = ?,
      payout_200_paid  = COALESCE(?, payout_200_paid),
      payout_200_date  = ?,
      notes            = ?,
      updated_at       = datetime('now')
    WHERE id = ?
  `).run(
    referrer_name ?? null, client_name ?? null, referral_date ?? null,
    third_clean_date !== undefined ? (third_clean_date || null) : existing.third_clean_date,
    one_year_date !== undefined ? (one_year_date || null) : existing.one_year_date,
    payout_150_paid !== undefined ? (payout_150_paid ? 1 : 0) : null,
    payout_150_date !== undefined ? (payout_150_date || null) : existing.payout_150_date,
    payout_200_paid !== undefined ? (payout_200_paid ? 1 : 0) : null,
    payout_200_date !== undefined ? (payout_200_date || null) : existing.payout_200_date,
    notes !== undefined ? (notes || null) : existing.notes,
    id
  )
  audit(req, 'referral_updated', `ID ${id}`)
  res.json({ ok: true })
})

// DELETE /api/referrals/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM referrals WHERE id=?').run(req.params.id)
  audit(req, 'referral_deleted', `ID ${req.params.id}`)
  res.json({ ok: true })
})

module.exports = router
