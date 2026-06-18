const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

let usePostgres = !!process.env.DATABASE_URL;
let pgPool = null;
let sqliteDb = null;

if (usePostgres) {
    console.log('Database Config: PostgreSQL enabled.');
    pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 20, // Max concurrent connections for scalability
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
    });
} else {
    console.log('Database Config: DATABASE_URL not set. Falling back to local SQLite (hellodiary.db).');
    const dbPath = path.join(__dirname, '..', 'hellodiary.db');
    sqliteDb = new sqlite3.Database(dbPath);
}

// Helper to run queries
async function query(text, params = []) {
    const start = Date.now();
    try {
        if (usePostgres) {
            const res = await pgPool.query(text, params);
            const duration = Date.now() - start;
            console.log('[DB Query PG]', { duration, rows: res.rowCount });
            return res;
        } else {
            // Translate PostgreSQL placeholders ($1, $2) to SQLite placeholders (?)
            const sqliteText = text.replace(/\$\d+/g, '?');
            
            // Determine if it's a SELECT or modifying command
            const isSelect = sqliteText.trim().toLowerCase().startsWith('select');
            
            return new Promise((resolve, reject) => {
                if (isSelect) {
                    sqliteDb.all(sqliteText, params, (err, rows) => {
                        if (err) return reject(err);
                        const duration = Date.now() - start;
                        console.log('[DB Query SQLite]', { duration, rows: rows.length });
                        resolve({ rows, rowCount: rows.length });
                    });
                } else {
                    sqliteDb.run(sqliteText, params, function(err) {
                        if (err) return reject(err);
                        const duration = Date.now() - start;
                        console.log('[DB Query SQLite]', { duration, rows: this.changes });
                        resolve({ rows: [], rowCount: this.changes });
                    });
                }
            });
        }
    } catch (err) {
        console.error('[DB Query Error]', { text, error: err.message });
        throw err;
    }
}

// Database tables initialization schema for PostgreSQL
const SCHEMA_PG = `
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS entries (
    id UUID PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    encrypted_data TEXT NOT NULL,
    updated_at BIGINT NOT NULL,
    deleted BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_entries_user_updated ON entries(user_id, updated_at);
`;

// Database tables initialization schema for SQLite
const SCHEMA_SQLITE = `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    encrypted_data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_entries_user_updated ON entries(user_id, updated_at);
`;

async function initDB() {
    console.log('Initializing database schema...');
    try {
        if (usePostgres) {
            await query(SCHEMA_PG);
        } else {
            await new Promise((resolve, reject) => {
                sqliteDb.exec(SCHEMA_SQLITE, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }
        console.log('Database schema verified/initialized successfully.');
    } catch (err) {
        console.error('Failed to initialize database schema:', err.message);
        throw err;
    }
}

module.exports = {
    query,
    initDB
};
