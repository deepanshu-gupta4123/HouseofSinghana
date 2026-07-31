const eventBus = require('../core/eventBus');
const db = require('../db');
const templateEngine = require('../core/templateEngine');

class NotificationService {
    initialize() {
        console.log('[NotificationService] Booting communications listeners...');

        // 1. Order Placed Notification
        eventBus.subscribe('OrderPlaced', async (event) => {
            try {
                const order = event.payload;
                const customer = await db.get(`SELECT * FROM customers WHERE id = ?`, [order.customer_id]);
                const recipient = customer ? customer.name : 'Valued Customer';
                const phone = customer ? customer.phone : '';
                const email = customer ? customer.email : '';

                // Build context
                const context = {
                    recipientName: recipient,
                    orderNumber: order.order_number,
                    amount: (order.total_amount / 100).toFixed(2)
                };

                // Compile mock messages
                const smsText = `Hello ${recipient}, your House of Singhana order #${order.order_number} has been placed. Amount: ₹${context.amount}. Thank you for choosing standard.`;
                const emailHtml = await templateEngine.render('notification_email', {
                    title: 'Order Placed successfully',
                    body: `Your transaction #${order.order_number} was logged. We are preparing the packing slips.`
                }).catch(() => `<p>Your order #${order.order_number} has been logged.</p>`);

                // Send mock logs
                this.dispatchSMS(phone, smsText);
                this.dispatchEmail(email, 'Order Placed | House of Singhana', emailHtml);
                this.dispatchWhatsApp(phone, 'order_received_template', context);
            } catch (err) {
                console.error('[NotificationService] Failed to send OrderPlaced notifications:', err);
            }
        });

        // 2. Invoice Generated Notification
        eventBus.subscribe('InvoiceGenerated', async (event) => {
            try {
                const { order } = event.payload;
                const customer = await db.get(`SELECT * FROM customers WHERE id = ?`, [order.customer_id]);
                const recipient = customer ? customer.name : 'Valued Customer';
                const phone = customer ? customer.phone : '';

                const smsText = `Hello ${recipient}, invoice has been generated for order #${order.order_number}. It is now in the packaging queue.`;
                
                this.dispatchSMS(phone, smsText);
                this.dispatchWhatsApp(phone, 'invoice_generated_template', { recipientName: recipient, orderNumber: order.order_number });
            } catch (err) {
                console.error('[NotificationService] Failed to send InvoiceGenerated notifications:', err);
            }
        });

        // 3. Order Dispatched Notification
        eventBus.subscribe('OrderDispatched', async (event) => {
            try {
                const { order } = event.payload;
                const customer = await db.get(`SELECT * FROM customers WHERE id = ?`, [order.customer_id]);
                const recipient = customer ? customer.name : 'Valued Customer';
                const phone = customer ? customer.phone : '';

                const smsText = `Hello ${recipient}, your order #${order.order_number} has been dispatched via ${order.dispatch_courier}. Tracking ID: ${order.dispatch_tracking}.`;

                this.dispatchSMS(phone, smsText);
                this.dispatchWhatsApp(phone, 'order_dispatched_template', {
                    recipientName: recipient,
                    orderNumber: order.order_number,
                    courier: order.dispatch_courier,
                    tracking: order.dispatch_tracking
                });
            } catch (err) {
                console.error('[NotificationService] Failed to send OrderDispatched notifications:', err);
            }
        });

        // 4. Complaint Raised SLA alerts
        eventBus.subscribe('ComplaintRaised', async (event) => {
            try {
                const ticket = event.payload;
                const customer = await db.get(`SELECT * FROM customers WHERE id = ?`, [ticket.customer_id]);
                const recipient = customer ? customer.name : 'Valued Customer';
                const phone = customer ? customer.phone : '';

                const smsText = `Hello ${recipient}, your ticket #${ticket.ticket_number} has been logged. Priority: ${ticket.priority}. Resolving within SLA hours.`;

                this.dispatchSMS(phone, smsText);
            } catch (err) {
                console.error('[NotificationService] Failed to send ComplaintRaised notifications:', err);
            }
        });
    }

    dispatchSMS(toPhone, message) {
        console.log(`\n=== 📱 [SMS DISPATCH MOCK] to ${toPhone || 'Guest'} ===\n${message}\n======================================\n`);
    }

    dispatchEmail(toEmail, subject, bodyHtml) {
        console.log(`\n=== ✉️ [EMAIL DISPATCH MOCK] to ${toEmail || 'Guest'} ===\nSubject: ${subject}\nBody Preview: ${bodyHtml.substring(0, 150)}...\n========================================\n`);
    }

    dispatchWhatsApp(toPhone, templateName, variables) {
        console.log(`\n=== 💬 [WHATSAPP DISPATCH MOCK] to ${toPhone || 'Guest'} ===\nTemplate: ${templateName}\nParams: ${JSON.stringify(variables)}\n============================================\n`);
    }
}

const notificationService = new NotificationService();
module.exports = notificationService;
