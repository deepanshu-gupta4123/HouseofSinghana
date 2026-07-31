const db = require('../db');
const eventBus = require('../core/eventBus');

class ReferralService {
    /**
     * Trigger reward checks when an order transitions to DELIVERED status state
     */
    async evaluateCompletedOrder(order) {
        if (!order || !order.customer_id) return;

        try {
            // 1. Fetch referee profile to check if they were referred by someone
            const customer = await db.get(
                `SELECT id, referred_by_customer_id FROM customers WHERE id = ? AND deleted_at IS NULL`,
                [order.customer_id]
            );

            if (!customer || !customer.referred_by_customer_id) {
                console.log(`[ReferralService] Customer #${order.customer_id} checkout did not have a referrer. Skipping.`);
                return;
            }

            const referrerId = customer.referred_by_customer_id;

            // 2. Check if a reward was already granted for this relationship
            const existing = await db.get(
                `SELECT * FROM referrals WHERE referrer_customer_id = ? AND referee_customer_id = ?`,
                [referrerId, customer.id]
            );

            if (existing) {
                console.log(`[ReferralService] Reward already logs existence for Referrer #${referrerId} -> Referee #${customer.id}.`);
                return;
            }

            // 3. Generate a unique single-use coupon reward
            const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            const rewardCouponCode = `REF-${randomCode}`;

            await db.transaction(async () => {
                // Write referral record
                await db.run(
                    `INSERT INTO referrals (
                        referrer_customer_id, referee_customer_id, referee_order_id, 
                        reward_type, reward_value, reward_status
                     ) VALUES (?, ?, ?, 'COUPON', 20000, 'GRANTED')`,
                    [referrerId, customer.id, order.id]
                );

                // Write the coupon rule to database (₹200 discount, min purchase ₹500, restricted to referrer)
                const expiryDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days
                await db.run(
                    `INSERT INTO coupons (
                        code, name, discount_type, discount_value, min_order_value,
                        customer_restriction_id, usage_limit_total, used_count, expires_at, is_active
                     ) VALUES (?, ?, 'FLAT', 20000, 50000, ?, 1, 0, ?, 1)`,
                    [
                        rewardCouponCode,
                        'Referral Reward Discount',
                        referrerId,
                        expiryDate
                    ]
                );
            });

            console.log(`[ReferralService] Reward granted successfully! Code: ${rewardCouponCode} issued to Referrer #${referrerId}`);

            // Emit communication alert
            const referrer = await db.get(`SELECT phone, name FROM customers WHERE id = ?`, [referrerId]);
            if (referrer && referrer.phone) {
                console.log(`\n=== 📱 [SMS DISPATCH MOCK] to ${referrer.phone} ===\nCongratulations ${referrer.name}! Your friend completed their first purchase. Use coupon "${rewardCouponCode}" for ₹200 off your next order.\n======================================\n`);
            }
        } catch (err) {
            console.error('[ReferralService] Failed to evaluate completed order:', err);
        }
    }
}

const referralService = new ReferralService();

// Subscribe to OrderDelivered to reward referrers automatically
eventBus.subscribe('OrderDelivered', async (event) => {
    const order = event.payload.order || event.payload;
    await referralService.evaluateCompletedOrder(order);
});

module.exports = referralService;
