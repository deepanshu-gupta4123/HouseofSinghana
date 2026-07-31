const db = require('../db');

class CartRecoveryService {
    /**
     * Ensure customer carts table exists for tracking cart state
     */
    async ensureTableExists() {
        await db.run(`
            CREATE TABLE IF NOT EXISTS customer_carts (
                customer_id INTEGER PRIMARY KEY,
                items_json TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    /**
     * Sync active cart contents from the storefront localStorage
     */
    async syncCart(customerId, items) {
        await this.ensureTableExists();
        const json = JSON.stringify(items || []);

        try {
            await db.run(
                `INSERT INTO customer_carts (customer_id, items_json, updated_at) 
                 VALUES (?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(customer_id) DO UPDATE SET 
                    items_json = excluded.items_json, 
                    updated_at = CURRENT_TIMESTAMP`,
                [customerId, json]
            );
        } catch (err) {
            console.error('[CartRecoveryService] Failed to sync customer cart:', err);
        }
    }

    /**
     * Clear customer cart database row when order is placed successfully
     */
    async clearCart(customerId) {
        await this.ensureTableExists();
        try {
            await db.run(`DELETE FROM customer_carts WHERE customer_id = ?`, [customerId]);
        } catch (err) {
            console.error('[CartRecoveryService] Failed to clear cart:', err);
        }
    }

    /**
     * Background scan task to identify cart records updated > 30 mins ago
     */
    async scanAndRemind() {
        await this.ensureTableExists();
        try {
            // Find carts that haven't been completed and are older than 30 minutes
            const rows = await db.all(`
                SELECT c.*, cust.email, cust.phone, cust.name
                FROM customer_carts c
                JOIN customers cust ON c.customer_id = cust.id
                WHERE c.updated_at < datetime('now', '-30 minutes')
            `);

            if (rows.length === 0) return;

            console.log(`[CartRecoveryService] Found ${rows.length} abandoned carts. Dispatching reminders.`);

            for (const row of rows) {
                // Delete from recovery log so we don't spam the user repeatedly
                await db.run(`DELETE FROM customer_carts WHERE customer_id = ?`, [row.customer_id]);

                const items = JSON.parse(row.items_json);
                const itemsCount = items.reduce((sum, item) => sum + (item.quantity || 1), 0);

                console.log(`\n=== ✉️ [EMAIL DISPATCH MOCK] to ${row.email} ===\nSubject: You left items in your cart!\nBody: Hello ${row.name}, we noticed you left ${itemsCount} item(s) in your cart. Return now to complete your checkout at House of Singhana.\n========================================\n`);
                if (row.phone) {
                    console.log(`\n=== 📱 [SMS DISPATCH MOCK] to ${row.phone} ===\nHello ${row.name}, you left items in your cart. Visit http://localhost:3000/checkout.html to complete your checkout.\n======================================\n`);
                }
            }
        } catch (err) {
            console.error('[CartRecoveryService] Scan job failed:', err);
        }
    }
}

const cartRecoveryService = new CartRecoveryService();
module.exports = cartRecoveryService;
