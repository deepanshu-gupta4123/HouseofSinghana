const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const email = process.argv[2];

if (!email) {
    console.error("Please provide an email. Usage: node make-admin.js your@email.com");
    process.exit(1);
}

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Error connecting to database:", err);
        process.exit(1);
    }
});

db.run(`UPDATE users SET role_id = 'super_admin' WHERE email = ?`, [email], function(err) {
    if (err) {
        console.error("Error updating user:", err);
    } else if (this.changes === 0) {
        console.error(`User with email ${email} not found.`);
    } else {
        console.log(`Successfully elevated ${email} to super_admin role.`);
    }
    db.close();
});
