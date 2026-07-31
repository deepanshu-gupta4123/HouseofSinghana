const db = require('../db');
const eventBus = require('../core/eventBus');

class WaitlistService {
    /**
     * Add a customer to the back-in-stock notification queue
     */
    async registerInterest(variantId, email, phone) {
        if (!variantId || !email) {
            throw new Error('Variant ID and Email are required.');
        }

        try {
            await db.run(
                `INSERT INTO stock_notifications (variant_id, customer_email, customer_phone, status) 
                 VALUES (?, ?, ?, 'WAITING')`,
                [variantId, email, phone || null]
            );
            console.log(`[WaitlistService] Logged interest for variant #${variantId} from email: ${email}`);
            return { success: true };
        } catch (err) {
            console.error('[WaitlistService] Failed to register interest:', err);
            throw err;
        }
    }

    /**
     * Dispatch notification alerts when stock becomes available
     */
    async processStockUpdate(variantId) {
        try {
            // Find all pending notifications for this variant
            const alerts = await db.all(
                `SELECT * FROM stock_notifications WHERE variant_id = ? AND status = 'WAITING'`,
                [variantId]
            );

            if (alerts.length === 0) return;

            const variant = await db.get(`
                SELECT v.variant_name, p.name as product_name 
                FROM product_variants v
                JOIN products p ON v.product_id = p.id
                WHERE v.id = ?
            `, [variantId]);

            const variantName = variant ? `${variant.product_name} - ${variant.variant_name}` : `Variant #${variantId}`;

            console.log(`[WaitlistService] Back-in-stock alerts triggered for ${variantName}. Notifying ${alerts.length} customers.`);

            for (const alert of alerts) {
                // Update status in DB
                await db.run(
                    `UPDATE stock_notifications SET status = 'NOTIFIED', notified_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [alert.id]
                );

                // Mock communication logs
                console.log(`\n=== ✉️ [EMAIL DISPATCH MOCK] to ${alert.customer_email} ===\nSubject: Back in Stock! ${variantName}\nBody: Good news! The spice selection you were waiting for is back in stock. Order now before it runs out.\n========================================\n`);
                if (alert.customer_phone) {
                    console.log(`\n=== 📱 [SMS DISPATCH MOCK] to ${alert.customer_phone} ===\nGood news! ${variantName} is back in stock at House of Singhana. Order now.\n======================================\n`);
                }
            }
        } catch (err) {
            console.error('[WaitlistService] Failed to process stock update notifications:', err);
        }
    }
}

const waitlistService = new WaitlistService();

// Subscribe to BatchReceived to notify waiting customers automatically
eventBus.subscribe('BatchReceived', async (event) => {
    const batch = event.payload;
    if (batch && batch.variant_id) {
        await waitlistService.processStockUpdate(batch.variant_id);
    }
});

module.exports = waitlistService;
