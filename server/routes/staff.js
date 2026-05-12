const express = require('express')
const router = express.Router()
const db = require('../db')

// GET /api/staff/terminations?year=2026
router.get('/terminations', (req, res) => {
  const { year, limit = 500 } = req.query
  let sql = 'SELECT * FROM staff_terminations'
  const params = []
  if (year) {
    sql += ` WHERE SUBSTR(termination_date, 1, 4) = ?`
    params.push(String(year))
  }
  sql += ' ORDER BY termination_date DESC, id DESC LIMIT ?'
  params.push(Math.min(parseInt(limit), 2000))
  res.json(db.prepare(sql).all(...params))
})

// POST /api/staff/terminations — add one (manual or webhook)
router.post('/terminations', (req, res) => {
  const {
    employee_name,
    termination_date,
    termination_type = 'fired',
    reason,
    source = 'manual',
    external_id,
    notes,
  } = req.body

  if (!employee_name) return res.status(400).json({ error: 'employee_name required' })
  if (!termination_date) return res.status(400).json({ error: 'termination_date required' })
  if (!['fired', 'quit'].includes(termination_type)) {
    return res.status(400).json({ error: 'termination_type must be "fired" or "quit"' })
  }

  const result = db.prepare(`
    INSERT INTO staff_terminations
      (employee_name, termination_date, termination_type, reason, source, external_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(external_id) DO UPDATE SET
      employee_name    = excluded.employee_name,
      termination_date = excluded.termination_date,
      termination_type = excluded.termination_type,
      reason           = excluded.reason,
      source           = excluded.source,
      notes            = excluded.notes
  `).run(
    employee_name, termination_date, termination_type,
    reason ?? null, source, external_id ?? null, notes ?? null
  )

  db.prepare(`INSERT INTO audit_log (action_type, entity, description) VALUES ('create','staff_termination',?)`)
    .run(`${termination_type}: ${employee_name} on ${termination_date}`)

  res.json({ ok: true, id: result.lastInsertRowid })
})

// PATCH /api/staff/terminations/:id — toggle type, edit notes/reason
router.patch('/terminations/:id', (req, res) => {
  const { termination_type, notes, reason, termination_date } = req.body
  const row = db.prepare('SELECT * FROM staff_terminations WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Not found' })

  db.prepare(`
    UPDATE staff_terminations SET
      termination_type = COALESCE(?, termination_type),
      notes            = COALESCE(?, notes),
      reason           = COALESCE(?, reason),
      termination_date = COALESCE(?, termination_date)
    WHERE id = ?
  `).run(
    termination_type ?? null,
    notes ?? null,
    reason ?? null,
    termination_date ?? null,
    req.params.id
  )
  res.json({ ok: true })
})

// DELETE /api/staff/terminations/:id
router.delete('/terminations/:id', (req, res) => {
  db.prepare('DELETE FROM staff_terminations WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// GET /api/staff/headcount — baseline setting
router.get('/headcount', (req, res) => {
  const settings = db.prepare(
    "SELECT key, value FROM settings WHERE key IN ('staff_headcount_baseline','staff_headcount_baseline_date')"
  ).all()
  const cfg = Object.fromEntries(settings.map(s => [s.key, s.value]))
  res.json({
    baseline: cfg.staff_headcount_baseline ? parseInt(cfg.staff_headcount_baseline) : null,
    baseline_date: cfg.staff_headcount_baseline_date ?? null,
  })
})

// POST /api/staff/headcount — save baseline
router.post('/headcount', (req, res) => {
  const { baseline, baseline_date } = req.body
  if (baseline !== undefined) {
    db.prepare("UPDATE settings SET value = ? WHERE key = 'staff_headcount_baseline'")
      .run(baseline != null ? String(baseline) : null)
  }
  if (baseline_date !== undefined) {
    db.prepare("UPDATE settings SET value = ? WHERE key = 'staff_headcount_baseline_date'")
      .run(baseline_date ?? null)
  }
  res.json({ ok: true })
})

// ── Employee Directory ─────────────────────────────────────────────────────
// GET /api/staff/employees?status=active|terminated|all
router.get('/employees', (req, res) => {
  const { status = 'all', limit = 2000 } = req.query
  let sql = 'SELECT * FROM employees'
  const params = []
  if (status === 'active') {
    sql += ' WHERE (termination_date IS NULL OR termination_date = "")'
  } else if (status === 'terminated') {
    sql += ' WHERE termination_date IS NOT NULL AND termination_date != ""'
  }
  sql += ' ORDER BY employee_name ASC LIMIT ?'
  params.push(Math.min(parseInt(limit), 5000))
  res.json(db.prepare(sql).all(...params))
})

// POST /api/staff/employees — add one
router.post('/employees', (req, res) => {
  const { employee_name, hire_date, termination_date, termination_type, notes, source = 'manual', external_id } = req.body
  if (!employee_name) return res.status(400).json({ error: 'employee_name required' })
  const result = db.prepare(`
    INSERT INTO employees (employee_name, hire_date, termination_date, termination_type, notes, source, external_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(external_id) DO UPDATE SET
      employee_name    = excluded.employee_name,
      hire_date        = excluded.hire_date,
      termination_date = excluded.termination_date,
      termination_type = excluded.termination_type,
      notes            = excluded.notes,
      source           = excluded.source
  `).run(
    employee_name,
    hire_date ?? null,
    termination_date ?? null,
    termination_type ?? null,
    notes ?? null,
    source,
    external_id ?? null
  )
  res.json({ ok: true, id: result.lastInsertRowid })
})

// PATCH /api/staff/employees/:id
router.patch('/employees/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Not found' })
  const { employee_name, hire_date, termination_date, termination_type, notes } = req.body
  db.prepare(`
    UPDATE employees SET
      employee_name    = COALESCE(?, employee_name),
      hire_date        = ?,
      termination_date = ?,
      termination_type = ?,
      notes            = ?
    WHERE id = ?
  `).run(
    employee_name ?? null,
    'hire_date' in req.body ? (hire_date ?? null) : row.hire_date,
    'termination_date' in req.body ? (termination_date ?? null) : row.termination_date,
    'termination_type' in req.body ? (termination_type ?? null) : row.termination_type,
    'notes' in req.body ? (notes ?? null) : row.notes,
    req.params.id
  )
  res.json({ ok: true })
})

// DELETE /api/staff/employees/:id
router.delete('/employees/:id', (req, res) => {
  db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// POST /api/staff/employees/parse-excel — accepts { data: base64 }, returns parsed rows
router.post('/employees/parse-excel', (req, res) => {
  try {
    const XLSX = require('xlsx')
    const { data } = req.body
    if (!data) return res.status(400).json({ error: 'data (base64) required' })
    const buf = Buffer.from(data, 'base64')
    const wb = XLSX.read(buf, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1 })
    if (raw.length < 2) return res.json({ rows: [] })

    const headers = raw[0].map(h => String(h || '').toLowerCase().trim())

    function col(row, names) {
      for (const n of names) {
        const idx = headers.findIndex(h => h.includes(n))
        if (idx !== -1 && row[idx] !== undefined && row[idx] !== null && row[idx] !== '') {
          return String(row[idx]).trim()
        }
      }
      return ''
    }

    // Convert "M/D/YYYY" or "MM/DD/YYYY" to "YYYY-MM-DD"
    function parseDate(s) {
      if (!s) return null
      // Handle Excel serial numbers
      if (!isNaN(s) && Number(s) > 1000) {
        const d = XLSX.SSF.parse_date_code(Number(s))
        if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
      }
      const parts = String(s).split('/')
      if (parts.length === 3) {
        const [m, d, y] = parts
        return `${y.padStart(4,'20')}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
      }
      return s || null
    }

    const rows = raw.slice(1).map(row => {
      const firstName = col(row, ['first name', 'firstname', 'first'])
      const lastName  = col(row, ['last name', 'lastname', 'last'])
      const fullName  = firstName && lastName ? `${firstName} ${lastName}` : (firstName || lastName || col(row, ['name']))
      const hireRaw   = col(row, ['hire date', 'hiredate', 'start date', 'hire'])
      const termRaw   = col(row, ['termination date', 'term date', 'end date', 'termination', 'term'])
      return {
        employee_name:    fullName,
        hire_date:        parseDate(hireRaw),
        termination_date: parseDate(termRaw),
        termination_type: null,
        notes:            col(row, ['notes', 'reason']),
      }
    }).filter(r => r.employee_name)

    res.json({ rows })
  } catch (err) {
    console.error('parse-excel error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/staff/employees/bulk — insert many rows (upsert by employee_name + hire_date)
router.post('/employees/bulk', (req, res) => {
  const { rows } = req.body
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'rows array required' })

  const stmt = db.prepare(`
    INSERT INTO employees (employee_name, hire_date, termination_date, termination_type, notes, source)
    VALUES (?, ?, ?, ?, ?, 'import')
  `)

  let inserted = 0
  const insertMany = db.transaction((items) => {
    for (const r of items) {
      if (!r.employee_name) continue
      try {
        stmt.run(r.employee_name, r.hire_date ?? null, r.termination_date ?? null, r.termination_type ?? null, r.notes ?? null)
        inserted++
      } catch (_) { /* skip dupes */ }
    }
  })
  insertMany(rows)

  db.prepare(`INSERT INTO audit_log (action_type, entity, description) VALUES ('bulk_import','employees',?)`)
    .run(`Imported ${inserted} employees`)

  res.json({ ok: true, inserted })
})

module.exports = router
