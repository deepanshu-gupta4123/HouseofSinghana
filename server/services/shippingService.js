const db = require('../db');

class ShippingService {
    /**
     * Determine shipping charge based on order subtotal and custom shipping rules
     * @param {number} subtotalAmount Subtotal in paise
     * @param {string} [regionCode] Pincode or state name to check region limits
     * @param {string} [paymentMethod] 'online' or 'cod'
     */
    async calculateShipping(subtotalAmount, regionCode = '', paymentMethod = 'online') {
        try {
            const rules = await db.all(
                `SELECT * FROM shipping_rules WHERE is_active = 1 ORDER BY priority DESC, id ASC`
            );

            for (const rule of rules) {
                // Check payment method eligibility
                if (rule.allowed_payment_methods) {
                    try {
                        const methods = JSON.parse(rule.allowed_payment_methods);
                        if (!methods.includes(paymentMethod)) continue;
                    } catch (e) {
                        // ignore malformed fields
                    }
                }

                // Check region rules
                if (rule.region_codes && regionCode) {
                    try {
                        const regions = JSON.parse(rule.region_codes);
                        if (regions.length > 0 && !regions.includes(regionCode)) continue;
                    } catch (e) {
                        // ignore malformed fields
                    }
                }

                // Evaluate rule criteria
                if (rule.rule_type === 'FREE_ABOVE') {
                    if (subtotalAmount >= rule.min_order_amount) {
                        return {
                            chargeAmount: 0,
                            ruleName: rule.name
                        };
                    }
                } else if (rule.rule_type === 'FLAT_RATE') {
                    if (subtotalAmount >= rule.min_order_amount && (!rule.max_order_amount || subtotalAmount <= rule.max_order_amount)) {
                        return {
                            chargeAmount: rule.charge_amount,
                            ruleName: rule.name
                        };
                    }
                }
            }

            // Fallback (Standard shipping flat rate ₹80)
            return {
                chargeAmount: 8000,
                ruleName: 'Standard Shipping Fallback'
            };

        } catch (err) {
            console.error('[ShippingService] Failed to calculate shipping:', err);
            return {
                chargeAmount: 8000,
                ruleName: 'Error Fallback flat rate'
            };
        }
    }
}

const shippingService = new ShippingService();
module.exports = shippingService;
