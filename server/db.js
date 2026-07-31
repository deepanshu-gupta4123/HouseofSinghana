const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Enable WAL mode and foreign key constraints on every connection
db.serialize(() => {
    db.run('PRAGMA journal_mode=WAL;');
    db.run('PRAGMA foreign_keys=ON;');
});

/**
 * Promise-based wrapper for db.run
 */
function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve({ lastID: this.lastID, changes: this.changes });
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
    run,
    get,
    all,
    exec,
    transaction
};
