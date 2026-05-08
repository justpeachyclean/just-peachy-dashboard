const express = require('express')
const router = express.Router()
const db = require('../db')
const { checkPassword, makeToken, hashPassword } = require('../lib/auth')

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

// POST /api/auth/reset-admin  — emergency admin password reset, requires webhook secret
// Body: { new_password: "..." }  Header: x-webhook-secret: <secret>
router.post('/reset-admin', (req, res) => {
  const secret = db.prepare("SELECT value FROM settings WHERE key='webhook_secret'").get()?.value
  const provided = req.headers['x-webhook-secret']
  if (!secret || !provided || provided !== secret) {
    return res.status(403).json({ error: 'Forbidden — invalid webhook secret' })
  }
  const { new_password } = req.body || {}
  if (!new_password || new_password.length < 4) return res.status(400).json({ error: 'new_password required (min 4 chars)' })

  const existing = db.prepare("SELECT id FROM users WHERE username = 'admin' COLLATE NOCASE").get()
  if (existing) {
    db.prepare("UPDATE users SET password_hash = ?, active = 1 WHERE username = 'admin' COLLATE NOCASE")
      .run(hashPassword(new_password))
  } else {
    db.prepare("INSERT INTO users (username, display_name, role, password_hash) VALUES ('admin','Admin','admin',?)")
      .run(hashPassword(new_password))
  }
  console.log('🔐 Admin password reset via /api/auth/reset-admin')
  res.json({ ok: true, message: 'Admin password updated. Log in with username: admin' })
})

module.exports = router
