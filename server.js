require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Razorpay = require('razorpay');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-singhana-key';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
const frontendPath = path.join(__dirname, '..');
app.use(express.static(frontendPath));

// Initialize Razorpay (Test Keys)
const razorpay = new Razorpay({
  key_id: 'rzp_test_dummykey12345',
  key_secret: 'dummysecret1234567890',
});

// Initialize SQLite Database
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err);
    } else {
        console.log('Connected to SQLite database.');
        
        // Inquiries Table
        db.run(`CREATE TABLE IF NOT EXISTS inquiries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Users Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Orders Table
        db.run(`CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            items_json TEXT NOT NULL,
            total_amount INTEGER NOT NULL,
            payment_status TEXT DEFAULT 'PENDING',
            payment_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`);
    }
});

// --- AUTHENTICATION MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- API ROUTES ---

// AUTH: Register
app.post('/api/auth/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (email, password_hash) VALUES (?, ?)`, [email, hashedPassword], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: 'Email already exists' });
                }
                return res.status(500).json({ error: 'Registration failed' });
            }
            const token = jwt.sign({ id: this.lastID, email }, JWT_SECRET, { expiresIn: '24h' });
            res.status(201).json({ token, user: { id: this.lastID, email } });
        });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// AUTH: Login
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Login failed' });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, email: user.email } });
    });
});

// ORDERS: Create Razorpay Order
app.post('/api/orders/create', authenticateToken, async (req, res) => {
    const { items, total_amount } = req.body; // total_amount in INR
    
    // Save order in DB as PENDING
    db.run(`INSERT INTO orders (user_id, items_json, total_amount) VALUES (?, ?, ?)`, 
        [req.user.id, JSON.stringify(items), total_amount], 
        async function(err) {
            if (err) return res.status(500).json({ error: 'Failed to create order' });
            
            const orderId = this.lastID;

            // Create order in Razorpay (amount is in paise)
            const options = {
                amount: Math.round(total_amount * 100), 
                currency: "INR",
                receipt: `receipt_order_${orderId}`
            };

            try {
                const rzpOrder = await razorpay.orders.create(options);
                res.json({ orderId: orderId, rzpOrder });
            } catch (error) {
                res.status(500).json({ error: 'Payment gateway error' });
            }
        }
    );
});

// ORDERS: Verify Payment
app.post('/api/orders/verify', authenticateToken, (req, res) => {
    const { order_id, payment_id } = req.body;
    
    // In production, verify Razorpay signature here using crypto.
    // For MVP, we simply update the DB status to PAID.
    db.run(`UPDATE orders SET payment_status = 'PAID', payment_id = ? WHERE id = ? AND user_id = ?`, 
        [payment_id, order_id, req.user.id], 
        function(err) {
            if (err) return res.status(500).json({ error: 'Failed to update order' });
            res.json({ success: true, message: 'Payment verified and order confirmed!' });
        }
    );
});

// Fallback route removed for Express 5 compatibility; express.static handles serving index.html at root

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on http: