require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const twilio = require('twilio');

// Load Merchant OS Core Architecture Modules
const dbHelper = require('./db');
const db = dbHelper.db;
const eventBus = require('./core/eventBus');
const automationEngine = require('./core/automationEngine');

// Load Middlewares
const authenticateToken = require('./middleware/auth');
const requirePermission = require('./middleware/rbac');
const { auditMiddleware } = require('./middleware/audit');
const { softDeleteMiddleware } = require('./middleware/softDelete');
const requireFeature = require('./middleware/featureFlag');

// Load Controllers
const storeController = require('./controllers/storeController');
const osProductController = require('./controllers/osProductController');
const osMediaController = require('./controllers/osMediaController');
const osInventoryController = require('./controllers/osInventoryController');
const osOrderController = require('./controllers/osOrderController');
const osPackingController = require('./controllers/osPackingController');
const osFulfilmentController = require('./controllers/osFulfilmentController');
const osCustomerController = require('./controllers/osCustomerController');
const osComplaintController = require('./controllers/osComplaintController');
const osReviewController = require('./controllers/osReviewController');
const osIntelligenceController = require('./controllers/osIntelligenceController');
const osCouponController = require('./controllers/osCouponController');
const osAuditController = require('./controllers/osAuditController');
const osSettingsController = require('./controllers/osSettingsController');

// Load Services
const notificationService = require('./services/notificationService');
const analyticsService = require('./services/analyticsService');
const referralService = require('./services/referralService');
const waitlistService = require('./services/waitlistService');
const cartRecoveryService = require('./services/cartRecoveryService');
const segmentationService = require('./services/segmentationService');
const archiveManager = require('./core/archiveManager');

// Boot Engines & Services
automationEngine.initialize().catch(err => {
    console.error('Failed to initialize Automation Engine:', err);
});
notificationService.initialize();
analyticsService.initialize();
cartRecoveryService.ensureTableExists()
    .then(() => {
        // Only set background intervals if running directly (not in Serverless/Vercel environments)
        if (require.main === module) {
            setInterval(() => cartRecoveryService.scanAndRemind(), 5 * 60 * 1000);
        }
    })
    .catch(err => {
        console.error('Failed to initialize Cart Recovery Service database table:', err);
    });

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-singhana-key';

// Global context middleware mapping
app.use(auditMiddleware);
app.use(softDeleteMiddleware);

// --- PRODUCTION MIDDLEWARE ---
app.use(helmet({
    contentSecurityPolicy: false,  // disabled so inline scripts work
    crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate Limiting — Auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,                   // 20 attempts per window
    message: { error: 'Too many attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/auth', authLimiter);

// Serve frontend static files with caching
const frontendPath = path.join(__dirname, '..');
app.use(express.static(frontendPath, {
    maxAge: '1d',
    etag: true
}));

// Initialize Razorpay (Test Keys)
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_dummykey12345',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummysecret1234567890',
});

// Expose Public Config
app.get('/api/config', (req, res) => {
    res.json({ razorpayKeyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_dummykey12345' });
});

// Database helper loaded via require('./db') at top of server.js

// --- THIRD-PARTY SERVICES (TWILIO) ---
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log('Twilio client initialized.');
} else {
    console.warn('TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not found. Running in MOCK mode for SMS/WhatsApp.');
}

async function sendWhatsAppNotification(phone, templateType, data) {
    if (!phone) return;
    
    // Convert local phone to international format if needed (Twilio requires E.164)
    // E.g. 9999999999 -> +919999999999
    let toPhone = phone.startsWith('+') ? phone : `+91${phone}`;

    let bodyText = '';
    if (templateType === 'ORDER_PLACED') {
        bodyText = `Thank you for your order from House of Singhana! Your order #${data.orderId} for ₹${data.total} has been received and is pending credit approval.`;
    } else if (templateType === 'INVOICE') {
        bodyText = `Your order #${data.orderId} from House of Singhana has been approved and invoiced! We are preparing it for dispatch.`;
    } else if (templateType === 'DISPATCH') {
        bodyText = `Good news! Your order #${data.orderId} has been dispatched via ${data.courier}. Tracking number: ${data.tracking}.`;
    }

    if (twilioClient && process.env.TWILIO_WHATSAPP_NUMBER) {
        try {
            await twilioClient.messages.create({
                body: bodyText,
                from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
                to: `whatsapp:${toPhone}`
            });
            console.log(`WhatsApp sent to ${toPhone}`);
        } catch (error) {
            console.error(`Twilio WhatsApp Error:`, error);
        }
    } else {
        console.log(`\n=== 🚀 [WHATSAPP API MOCK] to ${toPhone} ===\n${bodyText}\n=================================\n`);
    }
}

async function sendSMSOTP(phone, otp) {
    if (!phone) return;
    let toPhone = phone.startsWith('+') ? phone : `+91${phone}`;
    const bodyText = `Your House of Singhana verification code is: ${otp}. Do not share this with anyone.`;

    if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
        try {
            await twilioClient.messages.create({
                body: bodyText,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: toPhone
            });
            console.log(`SMS OTP sent to ${toPhone}`);
        } catch (error) {
            console.error(`Twilio SMS Error:`, error);
        }
    } else {
        console.log(`\n=== 📱 [SMS API MOCK] to ${toPhone} ===\n${bodyText}\n=================================\n`);
    }
}

// --- AUTHENTICATION MIDDLEWARE ---
// authenticateToken is imported from './middleware/auth' at top of file

const authenticateAdmin = (req, res, next) => {
    authenticateToken(req, res, () => {
        if (req.user && (req.user.is_admin || req.user.role_id === 'super_admin' || req.user.role_id === 'merchant')) {
            next();
        } else {
            res.status(403).json({ error: 'Admin access required' });
        }
    });
};

// --- API ROUTES ---

// AUTH: Send OTP
app.post('/api/auth/send-otp', (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000).toISOString(); // 10 mins

    db.run(`INSERT INTO otps (phone, otp, expires_at) VALUES (?, ?, ?)`, [phone, otp, expiresAt], function(err) {
        if (err) return res.status(500).json({ error: 'Failed to generate OTP' });
        
        // Trigger mock SMS API
        sendSMSOTP(phone, otp);
        res.json({ success: true, message: 'OTP Sent successfully' });
    });
});

// AUTH: Register
app.post('/api/auth/register', async (req, res) => {
    const { email, password, phone, otp, referral_code, name = 'Valued Customer' } = req.body;
    if (!email || !password || !phone || !otp) return res.status(400).json({ error: 'All fields required' });

    // Verify OTP
    db.get(`SELECT * FROM otps WHERE phone = ? AND otp = ? AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1`, [phone, otp], async (err, validOtp) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!validOtp) return res.status(400).json({ error: 'Invalid or expired OTP' });

        try {
            const hashedPassword = await bcrypt.hash(password, 10);

            // Check referrer
            let referredByCustomerId = null;
            if (referral_code) {
                const referrer = await db.get(`SELECT id FROM customers WHERE referral_code = ?`, [referral_code.toUpperCase().trim()]);
                if (referrer) referredByCustomerId = referrer.id;
            }

            // Generate unique customer referral code
            const uniqueCode = `REF-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

            db.run(
                `INSERT INTO customers (
                    name, email, phone, password_hash, is_verified, referral_code, referred_by_customer_id
                 ) VALUES (?, ?, ?, ?, 1, ?, ?)`,
                [name, email, phone, hashedPassword, uniqueCode, referredByCustomerId],
                function(err) {
                    if (err) {
                        if (err.message.includes('UNIQUE')) {
                            return res.status(400).json({ error: 'Email or phone already registered.' });
                        }
                        return res.status(500).json({ error: 'Registration failed.' });
                    }
                    const token = jwt.sign({ id: this.lastID, email, scope: 'customer' }, JWT_SECRET, { expiresIn: '24h' });
                    res.status(201).json({ token, user: { id: this.lastID, email, name, scope: 'customer' } });
                }
            );
        } catch (e) {
            res.status(500).json({ error: 'Server error' });
        }
    });
});

// AUTH: Login
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    db.get(`SELECT * FROM users WHERE email = ? AND deleted_at IS NULL`, [email], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Login failed' });
        
        if (user) {
            const match = await bcrypt.compare(password, user.password_hash);
            if (!match) return res.status(401).json({ error: 'Invalid credentials' });

            const token = jwt.sign({ id: user.id, email: user.email, scope: 'os' }, JWT_SECRET, { expiresIn: '24h' });
            return res.json({ token, user: { id: user.id, email: user.email, name: user.name, role_id: user.role_id, scope: 'os' } });
        }

        db.get(`SELECT * FROM customers WHERE email = ? AND deleted_at IS NULL`, [email], async (err, customer) => {
            if (err) return res.status(500).json({ error: 'Login failed' });
            if (!customer) return res.status(401).json({ error: 'Invalid credentials' });

            const match = await bcrypt.compare(password, customer.password_hash);
            if (!match) return res.status(401).json({ error: 'Invalid credentials' });

            const token = jwt.sign({ id: customer.id, email: customer.email, scope: 'customer' }, JWT_SECRET, { expiresIn: '24h' });
            return res.json({ token, user: { id: customer.id, email: customer.email, name: customer.name, scope: 'customer' } });
        });
    });
});

// AUTH: Reset Password
app.post('/api/auth/reset-password', async (req, res) => {
    const { phone, otp, new_password } = req.body;
    if (!phone || !otp || !new_password) return res.status(400).json({ error: 'All fields required' });

    db.get(`SELECT * FROM otps WHERE phone = ? AND otp = ? AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1`, [phone, otp], async (err, validOtp) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!validOtp) return res.status(400).json({ error: 'Invalid or expired OTP' });

        try {
            const hashedPassword = await bcrypt.hash(new_password, 10);
            db.run(`UPDATE users SET password_hash = ? WHERE phone = ?`, [hashedPassword, phone], function(err) {
                if (err) return res.status(500).json({ error: 'Failed to reset password' });
                if (this.changes === 0) return res.status(404).json({ error: 'User with this phone not found' });
                res.json({ success: true, message: 'Password reset successful' });
            });
        } catch (e) {
            res.status(500).json({ error: 'Server error' });
        }
    });
});

// ORDERS: Create Razorpay Order
app.post('/api/orders/create', authenticateToken, async (req, res) => {
    const { items, total_amount, payment_method } = req.body; // total_amount in INR
    
    // Save order in DB
    const initialStatus = payment_method === 'cod' ? 'PENDING_COD' : 'PENDING';
    db.run(`INSERT INTO orders (user_id, items_json, total_amount, payment_status, payment_method) VALUES (?, ?, ?, ?, ?)`, 
        [req.user.id, JSON.stringify(items), total_amount, initialStatus, payment_method || 'online'], 
        async function(err) {
            if (err) return res.status(500).json({ error: 'Failed to create order' });
            
            const orderId = this.lastID;

            if (payment_method === 'cod') {
                notifyOrderPlaced(orderId);
                return res.json({ orderId: orderId, success: true, message: 'COD Order Confirmed' });
            }

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
    const { db_order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    // 1. Verify Razorpay Signature
    const secret = process.env.RAZORPAY_KEY_SECRET || 'dummysecret1234567890';
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generated_signature = hmac.digest('hex');

    if (generated_signature !== razorpay_signature) {
        return res.status(400).json({ error: 'Payment verification failed: Invalid Signature' });
    }

    // 2. Update DB
    db.run(`UPDATE orders SET payment_status = 'PAID', payment_id = ? WHERE id = ? AND user_id = ?`, 
        [razorpay_payment_id, db_order_id, req.user.id], 
        function(err) {
            if (err) return res.status(500).json({ error: 'Failed to update order' });
            notifyOrderPlaced(db_order_id);
            res.json({ success: true, message: 'Payment verified and order confirmed!' });
        }
    );
});

function notifyOrderPlaced(orderId) {
    db.get(`SELECT users.phone FROM orders JOIN users ON orders.user_id = users.id WHERE orders.id = ?`, [orderId], (err, row) => {
        if (row && row.phone) sendWhatsAppNotification(row.phone, 'order_placed', { orderId });
    });
}

// ADMIN: Get Orders
app.get('/api/admin/orders', authenticateAdmin, (req, res) => {
    db.all(`
        SELECT orders.*, users.email, users.phone 
        FROM orders 
        JOIN users ON orders.user_id = users.id 
        ORDER BY orders.created_at DESC
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch orders' });
        res.json(rows);
    });
});

// ADMIN: Get Inquiries
app.get('/api/admin/inquiries', authenticateAdmin, (req, res) => {
    db.all(`SELECT * FROM inquiries ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch inquiries' });
        res.json(rows);
    });
});

// ADMIN: Approve Credit & Create Sales Order
app.post('/api/admin/orders/:id/approve', authenticateAdmin, (req, res) => {
    db.run(`UPDATE orders SET order_status = 'CREDIT_APPROVED' WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Update failed' });
        db.get(`SELECT users.phone FROM orders JOIN users ON orders.user_id = users.id WHERE orders.id = ?`, [req.params.id], (err, row) => {
            if (row && row.phone) sendWhatsAppNotification(row.phone, 'sales_order_created', { orderId: req.params.id });
        });
        res.json({ success: true });
    });
});

// ADMIN: Invoice Order
app.post('/api/admin/orders/:id/invoice', authenticateAdmin, (req, res) => {
    db.run(`UPDATE orders SET order_status = 'INVOICED' WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Update failed' });
        db.get(`SELECT users.phone FROM orders JOIN users ON orders.user_id = users.id WHERE orders.id = ?`, [req.params.id], (err, row) => {
            if (row && row.phone) sendWhatsAppNotification(row.phone, 'invoice_generated', { orderId: req.params.id });
        });
        res.json({ success: true });
    });
});

// ADMIN: Dispatch Order
app.post('/api/admin/orders/:id/dispatch', authenticateAdmin, (req, res) => {
    const { courier, tracking } = req.body;
    db.run(`UPDATE orders SET order_status = 'DISPATCHED', dispatch_courier = ?, dispatch_tracking = ? WHERE id = ?`, 
        [courier, tracking, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Update failed' });
        db.get(`SELECT users.phone FROM orders JOIN users ON orders.user_id = users.id WHERE orders.id = ?`, [req.params.id], (err, row) => {
            if (row && row.phone) sendWhatsAppNotification(row.phone, 'order_dispatched', { orderId: req.params.id, courier, tracking });
        });
        res.json({ success: true });
    });
});

// --- PUBLIC STORE APIs ---
app.get('/api/store/categories', storeController.listCategories);
app.get('/api/store/products', storeController.listProducts);
app.get('/api/store/products/:slug', storeController.getProductBySlug);
app.get('/api/store/faqs', storeController.listFaqs);
app.get('/api/store/homepage', storeController.getHomepageLayout);
app.get('/api/store/seo', storeController.getSeoMetadata);

// --- CUSTOMER SCROLLS & CHECKOUT APIs (Authenticated) ---
app.get('/api/store/addresses', authenticateToken, storeController.listAddresses);
app.post('/api/store/addresses', authenticateToken, storeController.createAddress);
app.delete('/api/store/addresses/:id', authenticateToken, storeController.deleteAddress);
app.post('/api/store/coupons/apply', authenticateToken, storeController.applyCoupon);
app.post('/api/store/orders/create', authenticateToken, storeController.checkoutOrder);
app.post('/api/orders/create', authenticateToken, storeController.checkoutOrder); // Backwards compatibility for frontend client

// --- OS PRODUCTS & CATEGORIES CMS APIs (Authenticated & RBAC) ---
app.get('/api/os/categories', authenticateToken, requirePermission('products:read'), osProductController.listCategories);
app.post('/api/os/categories', authenticateToken, requirePermission('products:write'), osProductController.createCategory);
app.put('/api/os/categories/:id', authenticateToken, requirePermission('products:write'), osProductController.updateCategory);
app.delete('/api/os/categories/:id', authenticateToken, requirePermission('products:write'), osProductController.deleteCategory);

app.get('/api/os/products', authenticateToken, requirePermission('products:read'), osProductController.listProducts);
app.get('/api/os/products/:id', authenticateToken, requirePermission('products:read'), osProductController.getProduct);
app.post('/api/os/products', authenticateToken, requirePermission('products:write'), osProductController.createProduct);
app.put('/api/os/products/:id', authenticateToken, requirePermission('products:write'), osProductController.updateProduct);
app.delete('/api/os/products/:id', authenticateToken, requirePermission('products:write'), osProductController.deleteProduct);
app.get('/api/os/approvals', authenticateToken, requirePermission('products:write'), osProductController.listPendingApprovals);
app.post('/api/os/approvals/:id/respond', authenticateToken, requirePermission('products:write'), osProductController.respondToApproval);

// --- OS MEDIA LIBRARY APIs (Authenticated) ---
const multer = require('multer');
const upload = multer({ dest: process.env.VERCEL ? '/tmp/uploads/temp/' : 'uploads/temp/' });
app.get('/api/os/media', authenticateToken, osMediaController.listMedia);
app.post('/api/os/media/upload', authenticateToken, upload.single('file'), osMediaController.uploadMedia);
app.delete('/api/os/media/:id', authenticateToken, osMediaController.deleteMedia);

// --- OS PERPETUAL INVENTORY APIs (Authenticated & RBAC) ---
app.get('/api/os/inventory/summary', authenticateToken, requirePermission('inventory:read'), osInventoryController.listInventorySummary);
app.get('/api/os/inventory/batches', authenticateToken, requirePermission('inventory:read'), osInventoryController.listBatches);
app.post('/api/os/inventory/batches', authenticateToken, requirePermission('inventory:receive'), osInventoryController.receiveBatch);
app.post('/api/os/inventory/audit', authenticateToken, requirePermission('inventory:audit'), osInventoryController.runAuditAdjustment);
app.get('/api/os/inventory/:variantId/history', authenticateToken, requirePermission('inventory:read'), osInventoryController.getVariantHistory);
app.get('/api/os/inventory/health', authenticateToken, requirePermission('inventory:read'), osInventoryController.getInventoryHealth);

// --- OS ORDER MANAGEMENT SYSTEM (OMS) APIs (Authenticated & RBAC) ---
app.get('/api/os/orders', authenticateToken, requirePermission('orders:read'), osOrderController.listOrders);
app.get('/api/os/orders/:id', authenticateToken, requirePermission('orders:read'), osOrderController.getOrderDetails);
app.post('/api/os/orders/:id/transition', authenticateToken, requirePermission('orders:write'), osOrderController.transitionStatus);
app.post('/api/os/orders/bulk-transition', authenticateToken, requirePermission('orders:bulk_action'), osOrderController.bulkTransition);

// --- OS WAREHOUSE PACKING QUEUE APIs (Authenticated & RBAC) ---
app.get('/api/os/packing/queue', authenticateToken, requirePermission('packing:read'), osPackingController.listPackingQueue);
app.post('/api/os/packing/:id/pack', authenticateToken, requirePermission('packing:pack'), osPackingController.markPacked);

// --- OS COURIER DISPATCH / FULFILMENT APIs (Authenticated & RBAC) ---
app.get('/api/os/fulfilment/queue', authenticateToken, requirePermission('fulfilment:read'), osFulfilmentController.listFulfilmentQueue);
app.post('/api/os/fulfilment/:id/dispatch', authenticateToken, requirePermission('fulfilment:dispatch'), osFulfilmentController.dispatchOrder);

// --- CUSTOMER COMPLAINTS & REVIEWS FORWARDING STORE APIs (Authenticated) ---
app.post('/api/store/complaints', authenticateToken, osComplaintController.customerCreateTicket);
app.post('/api/store/reviews', authenticateToken, osReviewController.customerCreateReview);

// --- CUSTOMER WISHLISTS APIs (Authenticated) ---
app.get('/api/store/wishlist', authenticateToken, storeController.getWishlist);
app.post('/api/store/wishlist', authenticateToken, storeController.addToWishlist);
app.delete('/api/store/wishlist/:productId', authenticateToken, storeController.removeFromWishlist);

// (Address APIs registered above — see CUSTOMER SCROLLS section)

// --- PRODUCT AVAILABILITY NOTIFICATIONS APIs (Public) ---
app.post('/api/store/notify-me', storeController.registerInterest);

// --- CUSTOMER CART RECOVERY APIs (Authenticated) ---
app.post('/api/store/cart/sync', authenticateToken, storeController.syncCart);

// --- OS CUSTOMER CRM APIs (Authenticated & RBAC) ---
app.get('/api/os/customers', authenticateToken, requirePermission('customers:read'), osCustomerController.listCustomers);
app.get('/api/os/customers/:id', authenticateToken, requirePermission('customers:read'), osCustomerController.getCustomerDetails);
app.post('/api/os/customers/:id/segment', authenticateToken, requirePermission('customers:write'), osCustomerController.overrideSegment);

// --- OS SLA COMPLAINT TICKETING APIs (Authenticated & RBAC) ---
app.get('/api/os/complaints', authenticateToken, requirePermission('complaints:read'), osComplaintController.listTickets);
app.get('/api/os/complaints/:id', authenticateToken, requirePermission('complaints:read'), osComplaintController.getTicketDetails);
app.post('/api/os/complaints/:id/transition', authenticateToken, requirePermission('complaints:write'), osComplaintController.transitionTicket);

// --- OS AUDITABLE REVIEWS MODERATION CMS APIs (Authenticated & RBAC) ---
app.get('/api/os/reviews', authenticateToken, requirePermission('reviews:read'), osReviewController.listReviews);
app.post('/api/os/reviews/:id/moderate', authenticateToken, requirePermission('reviews:write'), osReviewController.moderateReview);
app.post('/api/os/reviews/:id/respond', authenticateToken, requirePermission('reviews:write'), osReviewController.respondToReview);

// --- OS INTELLIGENCE & OPERATIONS DASHBOARD APIs (Authenticated & RBAC) ---
app.get('/api/os/intelligence/dashboard', authenticateToken, requirePermission('dashboard:read'), osIntelligenceController.getDashboardSummary);
app.get('/api/os/intelligence/metrics', authenticateToken, requirePermission('dashboard:read'), osIntelligenceController.getDailyMetricsHistory);
app.get('/api/os/intelligence/top-skus', authenticateToken, requirePermission('dashboard:read'), osIntelligenceController.getTopSkus);
app.post('/api/os/intelligence/closing-report', authenticateToken, requirePermission('dashboard:write'), osIntelligenceController.triggerClosingReport);

// --- OS COUPON MANAGEMENT APIs (Authenticated & RBAC) ---
app.get('/api/os/coupons', authenticateToken, requirePermission('coupons:read'), osCouponController.listCoupons);
app.get('/api/os/coupons/:id', authenticateToken, requirePermission('coupons:read'), osCouponController.getCouponDetails);
app.post('/api/os/coupons', authenticateToken, requirePermission('coupons:write'), osCouponController.createCoupon);
app.put('/api/os/coupons/:id', authenticateToken, requirePermission('coupons:write'), osCouponController.updateCoupon);
app.delete('/api/os/coupons/:id', authenticateToken, requirePermission('coupons:write'), osCouponController.deleteCoupon);

// --- OS AUDIT LOG APIs (Authenticated & RBAC) ---
app.get('/api/os/audit', authenticateToken, requirePermission('audit:read'), osAuditController.listAuditLogs);
app.get('/api/os/audit/:entityType/:entityId', authenticateToken, requirePermission('audit:read'), osAuditController.getEntityAuditTrail);

// --- OS WORKFLOW CONFIGURATION APIs (Authenticated & RBAC) ---
app.get('/api/os/workflows', authenticateToken, requirePermission('workflows:read'), osSettingsController.listWorkflows);
app.get('/api/os/workflows/:key', authenticateToken, requirePermission('workflows:read'), osSettingsController.getWorkflow);
app.put('/api/os/workflows/:key', authenticateToken, requirePermission('workflows:configure'), osSettingsController.updateWorkflow);

// --- OS AUTOMATION RULES APIs (Authenticated & RBAC) ---
app.get('/api/os/automations', authenticateToken, requirePermission('automations:read'), osSettingsController.listAutomations);
app.post('/api/os/automations', authenticateToken, requirePermission('automations:write'), osSettingsController.createAutomation);
app.put('/api/os/automations/:id', authenticateToken, requirePermission('automations:write'), osSettingsController.updateAutomation);
app.put('/api/os/automations/:id/toggle', authenticateToken, requirePermission('automations:write'), osSettingsController.toggleAutomation);

// --- OS DOCUMENT TEMPLATE APIs (Authenticated & RBAC) ---
app.get('/api/os/templates', authenticateToken, requirePermission('templates:read'), osSettingsController.listTemplates);
app.get('/api/os/templates/:key', authenticateToken, requirePermission('templates:read'), osSettingsController.getTemplate);
app.put('/api/os/templates/:key', authenticateToken, requirePermission('templates:write'), osSettingsController.updateTemplate);
app.get('/api/os/templates/:key/preview', authenticateToken, requirePermission('templates:read'), osSettingsController.previewTemplate);

// --- OS DOMAIN EVENTS (Debug/Replay) APIs (Authenticated & RBAC) ---
app.get('/api/os/events', authenticateToken, requirePermission('audit:read'), osSettingsController.listDomainEvents);
app.post('/api/os/events/replay/:id', authenticateToken, requirePermission('audit:read'), osSettingsController.replayEvent);

// --- OS SYSTEM HEALTH & ADMIN APIs (Authenticated & RBAC) ---
app.get('/api/os/system/health', authenticateToken, requirePermission('system:health'), osSettingsController.getSystemHealth);
app.get('/api/os/system/jobs', authenticateToken, requirePermission('system:jobs'), osSettingsController.getScheduledJobs);
app.post('/api/os/system/jobs/:id/run', authenticateToken, requirePermission('system:jobs'), osSettingsController.triggerJob);
app.get('/api/os/system/storage', authenticateToken, requirePermission('system:health'), osSettingsController.getStorageStats);
app.post('/api/os/system/archive/run', authenticateToken, requirePermission('system:archive'), osSettingsController.triggerArchive);

// Export the app instance for Serverless / Vercel usage
module.exports = app;

// Start Server ONLY if run directly (e.g. node server.js, pm2, docker)
if (require.main === module) {
    const server = app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Graceful Shutdown
    process.on('SIGTERM', () => {
        console.log('SIGTERM received. Shutting down gracefully...');
        server.close(() => {
            db.close(() => {
                console.log('Database connection closed.');
                process.exit(0);
            });
        });
    });

    process.on('SIGINT', () => {
        console.log('SIGINT received. Shutting down...');
        server.close(() => {
            db.close(() => {
                process.exit(0);
            });
        });
    });
}
