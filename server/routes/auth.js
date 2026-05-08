const express = require('express')
const router = express.Router()
const db = require('../db')
const { makeToken } = require('../lib/auth')

// GET /api/auth/status — is a password configured?
router.get('/status', (req, res) => {
  const stored = db.prepare("SELECT value FROM settings WHERE key='dashboard_password'").get()?.value
  res.json({ auth_required: !!(stored && stored.trim() !== '') })
})

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { password } = req.body || {}
  const stored = db.prepare("SELECT value FROM settings WHERE key='dashboard_password'").get()?.value
  if (!stored || stored.trim() === '') return res.json({ ok: true, token: 'open' })
  if (!password || password !== stored) return res.status(401).json({ error: 'Incorrect password' })
  res.json({ ok: true, token: makeToken(stored) })
})

module.exports = router
