const path = require('path');
const fs = require('fs');

let sqlite3;
let db;
let dbError = null;

try {
    sqlite3 = require('sqlite3').verbose();
    
    if (process.env.VERCEL) {
        // Use an in-memory SQLite database on Vercel to avoid read-only file system errors
        db = new sqlite3.Database(':memory:');
    } else {
        const dbPath = path.join(__dirname, 'database.sqlite');
        db = new sqlite3.Database(dbPath);
    }

    // Enable WAL mode and foreign key constraints on every connection
    db.serialize(() => {
        db.run('PRAGMA journal_mode=WAL;');
        db.run('PRAGMA foreign_keys=ON;');
    });
} catch (err) {
    dbError = err;
    console.error('Database initialization failed:', err);
    
    // Provide a safe mock database object to prevent other modules from crashing at import-time
    db = {
        serialize: (callback) => {
            if (callback) callback();
        },
        run: (sql, params, callback) => {
            const cb = typeof params === 'function' ? params : callback;
            if (cb) cb(new Error(`Database not available: ${err.message}`));
        },
        get: (sql, params, callback) => {
            const cb = typeof params === 'function' ? params : callback;
            if (cb) cb(new Error(`Database not available: ${err.message}`));
        },
        all: (sql, params, callback) => {
            const cb = typeof params === 'function' ? params : callback;
            if (cb) cb(new Error(`Database not available: ${err.message}`));
        },
        exec: (sql, callback) => {
            if (callback) callback(new Error(`Database not available: ${err.message}`));
        },
        close: (callback) => {
            if (callback) callback();
        }
    };
}

/**
 * Promise-based wrapper for db.run
 */
function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve({ lastID: this ? this.lastID : null, changes: this ? this.changes : 0 });
        });
    });
}

/**
 * Promise-based wrapper for db.get
 */
function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

/**
 * Promise-based wrapper for db.all
 */
function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

/**
 * Promise-based wrapper for db.exec
 */
function exec(sql) {
    return new Promise((resolve, reject) => {
        db.exec(sql, (err) => {
            if (err) return reject(err);
            resolve();
        });
    });
}

/**
 * Execute a transaction callback sequentially
 */
async function transaction(callback) {
    await run('BEGIN TRANSACTION;');
    try {
        const result = await callback();
        await run('COMMIT;');
        return result;
    } catch (err) {
        await run('ROLLBACK;');
        throw err;
    }
}

module.exports = {
    db,
    dbError, // Exported to show on the health-check page
    run,
    get,
    all,
    exec,
    transaction
};
