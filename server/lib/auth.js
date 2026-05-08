const crypto = require('crypto')
const db = require('../db')

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function checkPassword(pw, stored) {
  try {
    const [salt, hash] = stored.split(':')
    const check = crypto.scryptSync(pw, salt, 64).toString('hex')
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'))
  } catch { return false }
}

function getServerSecret() {
  const ws = db.prepare("SELECT value FROM settings WHERE key='webhook_secret'").get()?.value || 'fallback'
  return crypto.createHash('sha256').update(ws + ':session-v2').digest('hex')
}

function makeToken(user) {
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000
  const payload = Buffer.from(JSON.stringify({ uid: user.id, username: user.username, display_name: user.display_name, role: user.role, exp })).toString('base64url')
  const secret = getServerSecret()
  // Sign using password_hash so password changes invalidate tokens
  const sigKey = crypto.createHash('sha256').update(secret + user.password_hash).digest('hex')
  const sig = crypto.createHmac('sha256', sigKey).update(payload).digest('hex')
  return `${payload}.${sig}`
}

function verifyToken(token) {
  try {
    if (!token) return null
    const [payload, sig] = token.split('.')
    if (!payload || !sig) return null
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (Date.now() > data.exp) return null
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(data.uid)
    if (!user) return null
    const secret = getServerSecret()
    const sigKey = crypto.createHash('sha256').update(secret + user.password_hash).digest('hex')
    const expected = crypto.createHmac('sha256', sigKey).update(payload).digest('hex')
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null
    return { id: user.id, username: user.username, display_name: user.display_name, role: user.role }
  } catch { return null }
}

function authMiddleware(req, res, next) {
  // Only protect API routes — let static files (React app, index.html) pass through freely
  if (!req.path.startsWith('/api/')) return next()
  if (req.path.startsWith('/api/auth') || req.path.startsWith('/api/webhook') || req.path === '/api/health') return next()
  const hasUsers = db.prepare('SELECT COUNT(*) as n FROM users WHERE active=1').get().n > 0
  if (!hasUsers) return next()
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  const user = verifyToken(token)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })
  req.user = user
  next()
}

function audit(reqOrUser, action, description) {
  try {
    const user = reqOrUser?.user ?? reqOrUser
    const username = user?.username || user?.display_name || 'system'
    db.prepare(`INSERT INTO audit_log (action_type, description, user) VALUES (?,?,?)`)
      .run(action, description, username)
  } catch(_) {}
}

module.exports = { hashPassword, checkPassword, makeToken, verifyToken, authMiddleware, audit }
