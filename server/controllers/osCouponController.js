/**
 * OS Coupon Controller — Merchant-facing coupon management CRUD
 * 
 * Provides endpoints for browsing, creating, updating, and toggling coupons.
 * Follows DDD: thin controller, delegates business logic to couponService.
 */
const db = require('../db');

/**
 * List all coupons with usage statistics
 */
async function listCoupons(req, res) {
    try {
        const { status, type } = req.query;
        let query = `
            SELECT c.*, 
                (SELECT COUNT(*) FROM coupon_usages cu WHERE cu.coupon_id = c.id) as times_used
            FROM coupons c 
            WHERE c.deleted_at IS NULL
        `;
        const params = [];

        if (status === 'active') {
            query += ` AND c.is_active = 1 AND (c.valid_until IS NULL OR c.valid_until > datetime('now'))`;
        } else if (status === 'expired') {
            query += ` AND (c.valid_until IS NOT NULL AND c.valid_until <= datetime('now'))`;
        } else if (status === 'inactive') {
            query += ` AND c.is_active = 0`;
        }

        if (type) {
            query += ` AND c.discount_type = ?`;
            params.push(type);
        }

        query += ` ORDER BY c.created_at DESC`;

        const coupons = await db.all(query, params);
        res.json(coupons);
    } catch (err) {
        console.error('[OS:Coupons] listCoupons failed:', err);
        res.status(500).json({ error: 'Failed to fetch coupons.' });
    }
}

/**
 * Get a single coupon by ID with full usage history
 */
async function getCouponDetails(req, res) {
    try {
        const coupon = await db.get(
            `SELECT * FROM coupons WHERE id = ? AND deleted_at IS NULL`,
            [req.params.id]
        );

        if (!coupon) return res.status(404).json({ error: 'Coupon not found.' });

        // Get usage history
        const usages = await db.all(`
            SELECT cu.*, c.name as customer_name, c.email as customer_email
            FROM coupon_usages cu
            LEFT JOIN customers c ON cu.customer_id = c.id
            WHERE cu.coupon_id = ?
            ORDER BY cu.used_at DESC
        `, [coupon.id]);

        res.json({ ...coupon, usages });
    } catch (err) {
        console.error('[OS:Coupons] getCouponDetails failed:', err);
        res.status(500).json({ error: 'Failed to fetch coupon details.' });
    }
}

/**
 * Create a new coupon
 */
async function createCoupon(req, res) {
    const {
        code, description, discount_type, discount_value,
        min_order_amount, max_discount_amount, max_uses, max_uses_per_customer,
        valid_from, valid_until, restricted_to_customer_id
    } = req.body;

    if (!code || !discount_type || !discount_value) {
        return res.status(400).json({ error: 'Code, discount_type, and discount_value are required.' });
    }

    try {
        // Check uniqueness
        const existing = await db.get(`SELECT id FROM coupons WHERE code = ?`, [code.toUpperCase()]);
        if (existing) {
            return res.status(409).json({ error: 'Coupon code already exists.' });
        }

        const result = await db.run(`
            INSERT INTO coupons (
                code, description, discount_type, discount_value, 
                min_order_amount, max_discount_amount, max_uses, max_uses_per_customer,
                valid_from, valid_until, restricted_to_customer_id, is_active,
                created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        `, [
            code.toUpperCase(),
            description || '',
            discount_type,
            discount_value,
            min_order_amount || 0,
            max_discount_amount || null,
            max_uses || null,
            max_uses_per_customer || 1,
            valid_from || null,
            valid_until || null,
            restricted_to_customer_id || null,
            req.user.id
        ]);

        console.log(`[OS:Coupons] Created coupon ${code.toUpperCase()} by user #${req.user.id}`);
        res.status(201).json({ success: true, id: result.lastID, code: code.toUpperCase() });
    } catch (err) {
        console.error('[OS:Coupons] createCoupon failed:', err);
        res.status(500).json({ error: 'Failed to create coupon.' });
    }
}

/**
 * Update an existing coupon
 */
async function updateCoupon(req, res) {
    const { id } = req.params;
    const {
        description, discount_type, discount_value,
        min_order_amount, max_discount_amount, max_uses, max_uses_per_customer,
        valid_from, valid_until, is_active
    } = req.body;

    try {
        const coupon = await db.get(`SELECT * FROM coupons WHERE id = ? AND deleted_at IS NULL`, [id]);
        if (!coupon) return res.status(404).json({ error: 'Coupon not found.' });

        await db.run(`
            UPDATE coupons SET
                description = COALESCE(?, description),
                discount_type = COALESCE(?, discount_type),
                discount_value = COALESCE(?, discount_value),
                min_order_amount = COALESCE(?, min_order_amount),
                max_discount_amount = COALESCE(?, max_discount_amount),
                max_uses = COALESCE(?, max_uses),
                max_uses_per_customer = COALESCE(?, max_uses_per_customer),
                valid_from = COALESCE(?, valid_from),
                valid_until = COALESCE(?, valid_until),
                is_active = COALESCE(?, is_active),
                updated_by = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            description, discount_type, discount_value,
            min_order_amount, max_discount_amount, max_uses, max_uses_per_customer,
            valid_from, valid_until, is_active,
            req.user.id, id
        ]);

        res.json({ success: true, message: 'Coupon updated.' });
    } catch (err) {
        console.error('[OS:Coupons] updateCoupon failed:', err);
        res.status(500).json({ error: 'Failed to update coupon.' });
    }
}

/**
 * Soft-delete a coupon
 */
async function deleteCoupon(req, res) {
    try {
        await db.run(
            `UPDATE coupons SET deleted_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?`,
            [req.user.id, req.params.id]
        );
        res.json({ success: true, message: 'Coupon soft-deleted.' });
    } catch (err) {
        console.error('[OS:Coupons] deleteCoupon failed:', err);
        res.status(500).json({ error: 'Failed to delete coupon.' });
    }
}

module.exports = {
    listCoupons,
    getCouponDetails,
    createCoupon,
    updateCoupon,
    deleteCoupon
};
