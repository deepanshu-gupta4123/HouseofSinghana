const db = require('../db');

class CouponService {
    /**
     * Validate a promo coupon and return discount details
     */
    async validateAndApplyCoupon(code, subtotalAmount, customerId, regionCode = '') {
        const coupon = await db.get(
            `SELECT * FROM coupons WHERE code = ? AND is_active = 1 AND deleted_at IS NULL`,
            [code.toUpperCase().trim()]
        );

        if (!coupon) {
            throw new Error('Promo coupon code is invalid or disabled.');
        }

        const now = new Date().toISOString();

        // 1. Time Limits Check
        if (coupon.starts_at && now < coupon.starts_at) {
            throw new Error('This promo campaign has not started yet.');
        }
        if (coupon.expires_at && now > coupon.expires_at) {
            throw new Error('This promo coupon has expired.');
        }

        // 2. Global Usage limit checks
        if (coupon.usage_limit_total && coupon.used_count >= coupon.usage_limit_total) {
            throw new Error('Coupon usage limits reached.');
        }

        // 3. Minimum Order limits
        if (subtotalAmount < coupon.min_order_value) {
            throw new Error(`Minimum order value of ₹${(coupon.min_order_value / 100).toFixed(2)} is required to use this coupon.`);
        }

        // 4. First Order restriction check
        if (coupon.is_first_order_only && customerId) {
            const orderCheck = await db.get(
                `SELECT COUNT(*) as count FROM orders WHERE customer_id = ? AND order_status != 'CANCELLED'`,
                [customerId]
            );
            if (orderCheck && orderCheck.count > 0) {
                throw new Error('This coupon code is only eligible on your first purchase.');
            }
        }

        // 5. Customer specific checks
        if (coupon.customer_restriction_id && customerId && Number(coupon.customer_restriction_id) !== Number(customerId)) {
            throw new Error('This coupon code is not valid for your customer profile.');
        }

        // 6. Calculate discount value
        let discountApplied = 0;
        if (coupon.discount_type === 'PERCENTAGE') {
            discountApplied = Math.round(subtotalAmount * (coupon.discount_value / 100));
            if (coupon.max_discount_amount && discountApplied > coupon.max_discount_amount) {
                discountApplied = coupon.max_discount_amount;
            }
        } else if (coupon.discount_type === 'FLAT') {
            discountApplied = coupon.discount_value; // value in paise
        }

        // Ensure discount doesn't exceed subtotal
        if (discountApplied > subtotalAmount) {
            discountApplied = subtotalAmount;
        }

        return {
            coupon,
            discountApplied
        };
    }

    /**
     * Increment coupon usage count
     */
    async incrementUsage(couponId) {
        await db.run(
            `UPDATE coupons SET used_count = used_count + 1 WHERE id = ?`,
            [couponId]
        );
    }
}

const couponService = new CouponService();
module.exports = couponService;
