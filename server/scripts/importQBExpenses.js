/**
 * Import QuickBooks marketing & recruiting spend into quickbooks_expenses table.
 * Annual totals distributed evenly across months.
 *
 * 2024: Marketing $87,183 | Recruiting $4,685  (12 months)
 * 2025: Marketing $137,003 | Recruiting $7,402  (12 months)
 * 2026: Marketing $55,725 | Recruiting $3,927   (5 months Jan-May)
 */
const db = require('../db')

const MARKETING = 'Marketing'
const RECRUITING = 'Recruiting'

const ANNUAL = [
  { year: 2024, months: 12, marketing: 87183,  recruiting: 4685  },
  { year: 2025, months: 12, marketing: 137003, recruiting: 7402  },
  { year: 2026, months: 5,  marketing: 55725,  recruiting: 3927  },
]

const upsert = db.prepare(`
  INSERT INTO quickbooks_expenses (month, category, amount)
  VALUES (?, ?, ?)
  ON CONFLICT(month, category) DO UPDATE SET amount = excluded.amount, synced_at = datetime('now')
`)

const run = db.transaction(() => {
  let count = 0
  for (const { year, months, marketing, recruiting } of ANNUAL) {
    const mktPerMonth    = Math.round((marketing  / months) * 100) / 100
    const recPerMonth    = Math.round((recruiting / months) * 100) / 100

    for (let m = 1; m <= months; m++) {
      const month = `${year}-${String(m).padStart(2, '0')}`
      upsert.run(month, MARKETING,  mktPerMonth)
      upsert.run(month, RECRUITING, recPerMonth)
      count += 2
    }
  }
  return count
})

const n = run()
console.log(`✓ Upserted ${n} expense rows`)

// Also update settings so the categories match
db.prepare(`UPDATE settings SET value = ? WHERE key = 'qb_marketing_category'`).run(MARKETING)
db.prepare(`UPDATE settings SET value = ? WHERE key = 'qb_recruiting_category'`).run(RECRUITING)
console.log('✓ Updated settings: qb_marketing_category → Marketing, qb_recruiting_category → Recruiting')

// Verify
const rows = db.prepare(`SELECT month, category, amount FROM quickbooks_expenses ORDER BY month, category`).all()
console.log(`\nTotal expense rows in DB: ${rows.length}`)
console.log('Sample (first 6):')
rows.slice(0, 6).forEach(r => console.log(` ${r.month} | ${r.category.padEnd(12)} | $${r.amount}`))
console.log('Sample (last 3):')
rows.slice(-3).forEach(r => console.log(` ${r.month} | ${r.category.padEnd(12)} | $${r.amount}`))
