const express = require('express')
const router = express.Router()
const db = require('../db')

// GET /api/expenses?year=2026
router.get('/', (req, res) => {
  const year = req.query.year || new Date().getFullYear()
  const rows = db.prepare(
    'SELECT month, category, amount FROM quickbooks_expenses WHERE month LIKE ? ORDER BY month'
  ).all(`${year}-%`)
  res.json(rows)
})

// PUT /api/expenses — upsert one month + category
router.put('/', (req, res) => {
  const { month, category, amount } = req.body
  if (!month || !category) return res.status(400).json({ error: 'month and category required' })
  db.prepare(`
    INSERT INTO quickbooks_expenses (month, category, amount)
    VALUES (?, ?, ?)
    ON CONFLICT(month, category) DO UPDATE SET amount = excluded.amount, synced_at = datetime('now')
  `).run(month, category, parseFloat(amount) || 0)
  res.json({ ok: true })
})

module.exports = router
