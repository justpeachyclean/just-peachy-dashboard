const Database = require('better-sqlite3')
const path = require('path')
const SCHEMA = require('./schema')

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'peachy.db')

// Ensure data directory exists
const fs = require('fs')
const dataDir = path.dirname(DB_PATH)
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

const db = new Database(DB_PATH)
db.exec(SCHEMA)

module.exports = db
