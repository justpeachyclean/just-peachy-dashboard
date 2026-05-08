const express = require('express')
const router = express.Router()
const db = require('../db')
const { hashPassword } = require('../lib/auth')

// GET /api/users
router.get('/', (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  const users = db.prepare('SELECT id, username, display_name, role, active, last_login, created_at FROM users ORDER BY created_at').all()
  res.json(users)
})

// POST /api/users
router.post('/', (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  const { username, display_name, password, role = 'member' } = req.body || {}
  if (!username || !password) return res.status(400).json({ error: 'username and password required' })
  try {
    const result = db.prepare(`INSERT INTO users (username, display_name, role, password_hash) VALUES (?,?,?,?)`)
      .run(username.trim(), display_name?.trim() || username.trim(), role, hashPassword(password))
    res.json({ ok: true, id: result.lastInsertRowid })
  } catch(e) {
    res.status(400).json({ error: 'Username already taken' })
  }
})

// PATCH /api/users/:id
router.patch('/:id', (req, res) => {
  const targetId = parseInt(req.params.id)
  const isOwnAccount = req.user?.id === targetId
  const isAdmin = req.user?.role === 'admin'
  if (!isAdmin && !isOwnAccount) return res.status(403).json({ error: 'Forbidden' })
  const { display_name, password, role, active } = req.body || {}
  if (display_name !== undefined) db.prepare('UPDATE users SET display_name=? WHERE id=?').run(display_name, targetId)
  if (password) db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(password), targetId)
  if (isAdmin && role !== undefined) db.prepare('UPDATE users SET role=? WHERE id=?').run(role, targetId)
  if (isAdmin && active !== undefined) db.prepare('UPDATE users SET active=? WHERE id=?').run(active ? 1 : 0, targetId)
  res.json({ ok: true })
})

// DELETE /api/users/:id  (deactivate, not hard delete)
router.delete('/:id', (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  if (req.user?.id === parseInt(req.params.id)) return res.status(400).json({ error: "Can't delete yourself" })
  db.prepare('UPDATE users SET active=0 WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

module.exports = router
