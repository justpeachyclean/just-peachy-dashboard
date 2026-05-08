const express = require('express')
const router = express.Router()
const db = require('../db')
const { checkPassword, makeToken } = require('../lib/auth')

// GET /api/auth/status
router.get('/status', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as n FROM users WHERE active=1').get().n
  res.json({ auth_required: count > 0 })
})

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) return res.status(400).json({ error: 'username and password required' })
  const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE AND active = 1').get(username)
  if (!user || !checkPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' })
  }
  db.prepare(`UPDATE users SET last_login = datetime('now') WHERE id = ?`).run(user.id)
  res.json({ ok: true, token: makeToken(user), user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role } })
})

module.exports = router
