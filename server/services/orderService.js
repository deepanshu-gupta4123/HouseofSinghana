const db = require('../db');
const eventBus = require('../core/eventBus');
const workflowEngine = require('../core/workflowEngine');
const inventoryService = require('./inventoryService');
const templateEngine = require('../core/templateEngine');
const taxService = require('./taxService');
const shippingService = require('./shippingService');
const couponService = require('./couponService');
const path = require('path');
const fs = require('fs');

class OrderService {
    /**
     * Create a new Customer Order
     */
    async createOrder({
        customerId,
        warehouseId,
        shippingAddress,
        billingAddress,
        orderNotes,
        isGift = false,
        giftMessage = null,
        giftPackaging = false,
        hideInvoice = false,
        couponCode = null,
        items, // Array of { variant_id, quantity }
        paymentMethod = 'online',
        userId = 1
    }) {
        return await db.transaction(async () => {
            // 1. Generate Order Number
            const orderNumber = `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

            // 2. Fetch warehouse coordinates
            const warehouse = await db.get(`SELECT id FROM warehouses WHERE id = ? AND is_active = 1`, [warehouseId]);
            if (!warehouse) throw new Error('Selected fulfillment warehouse is inactive or invalid.');

            // 3. Compute item prices and totals
            let subtotal = 0;
            const itemsWithDetails = [];

            for (const item of items) {
                let variant = null;
                let price = 0;
                let sizeLabel = '1kg';

                if (isNaN(item.variant_id) || String(item.variant_id).includes('-')) {
                    // Composite string ID: e.g. "coriander-100g-Standard Blend"
                    const parts = String(item.variant_id).split('-');
                    const productSlug = parts[0];
                    const sizeId = parts[1] || '1kg';
                    const variantName = parts.slice(2).join('-'); // handles names with hyphens if any

                    const productObj = await db.get(
                        `SELECT id, base_price, name FROM products WHERE slug = ? AND deleted_at IS NULL`,
                        [productSlug]
                    );
                    if (!productObj) throw new Error(`Product slug ${productSlug} not found.`);

                    // Find variant matching product_id and name
                    if (variantName) {
                        variant = await db.get(
                            `SELECT v.*, p.name as product_name 
                             FROM product_variants v
                             JOIN products p ON v.product_id = p.id
                             WHERE v.product_id = ? AND v.variant_name = ? AND v.deleted_at IS NULL`,
                            [productObj.id, variantName]
                        );
                    } else {
                        variant = await db.get(
                            `SELECT v.*, p.name as product_name 
                             FROM product_variants v
                             JOIN products p ON v.product_id = p.id
                             WHERE v.product_id = ? AND v.deleted_at IS NULL LIMIT 1`,
                            [productObj.id]
                        );
                    }

                    if (!variant) throw new Error(`Product variant for slug ${productSlug} and variant ${variantName || 'default'} not found.`);

                    // Calculate price based on size
                    const sizes = {
                        '100g': { multiplier: 0.1, margin: 1.15 },
                        '250g': { multiplier: 0.25, margin: 1.15 },
                        '500g': { multiplier: 0.5, margin: 1.0 },
                        '1kg': { multiplier: 1.0, margin: 1.0 }
                    };
                    const sizeObj = sizes[sizeId] || sizes['1kg'];
                    
                    // base_price is in paise. Calculate price in paise.
                    price = Math.round((productObj.base_price * sizeObj.multiplier) * sizeObj.margin);
                    sizeLabel = sizeId;
                } else {
                    // Direct numeric ID
                    variant = await db.get(
                        `SELECT v.*, p.name as product_name 
                         FROM product_variants v 
                         JOIN products p ON v.product_id = p.id 
                         WHERE v.id = ? AND v.deleted_at IS NULL AND p.deleted_at IS NULL`,
                        [item.variant_id]
                    );
                    if (!variant) throw new Error(`Product variant #${item.variant_id} not found.`);
                    price = variant.price;
                    sizeLabel = variant.size_label || '1kg';
                }

                const totalItemPrice = price * item.quantity;
                subtotal += totalItemPrice;

                itemsWithDetails.push({
                    product_id: variant.product_id,
                    variant_id: variant.id,
                    product_name: variant.product_name,
                    variant_name: `${variant.variant_name} (${sizeLabel})`,
                    sku: variant.sku,
                    unit_price: price,
                    quantity: item.quantity,
                    total_price: totalItemPrice
                });
            }

            // 4. Calculate dynamic coupon discounts
            let discountAmount = 0;
            let resolvedCouponId = null;
            if (couponCode) {
                const pin = shippingAddress ? shippingAddress.pincode : '';
                const couponResult = await couponService.validateAndApplyCoupon(couponCode, subtotal, customerId, pin);
                discountAmount = couponResult.discountApplied;
                resolvedCouponId = couponResult.coupon.id;
                await couponService.incrementUsage(resolvedCouponId);
            }

            // 5. Calculate dynamic shipping fee
            const pin = shippingAddress ? shippingAddress.pincode : '';
            const shippingResult = await shippingService.calculateShipping(subtotal, pin, paymentMethod);
            const shippingCharge = shippingResult.chargeAmount;

            // 6. Calculate dynamic taxes per HSN
            let taxAmount = 0;
            for (const item of itemsWithDetails) {
                const prod = await db.get(`SELECT hsn_code FROM products WHERE id = ?`, [item.product_id]);
                const taxResult = await taxService.calculateTax(prod ? prod.hsn_code : null, item.total_price);
                taxAmount += taxResult.taxAmount;
            }

            const totalAmount = subtotal - discountAmount + shippingCharge + taxAmount;

            // 7. Insert main Order record
            const orderResult = await db.run(
                `INSERT INTO orders (
                    order_number, customer_id, warehouse_id, shipping_address_json, billing_address_json,
                    order_notes, is_gift, gift_message, gift_packaging, hide_invoice_in_box,
                    coupon_id, subtotal_amount, discount_amount, shipping_charge, tax_amount, total_amount,
                    payment_status, payment_method, order_status, created_by, updated_by
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, 'RECEIVED', ?, ?)`,
                [
                    orderNumber, customerId, warehouseId, JSON.stringify(shippingAddress), JSON.stringify(billingAddress),
                    orderNotes, isGift ? 1 : 0, giftMessage, giftPackaging ? 1 : 0, hideInvoice ? 1 : 0,
                    resolvedCouponId, subtotal, discountAmount, shippingCharge, taxAmount, totalAmount,
                    paymentMethod, userId, userId
                ]
            );

            const orderId = orderResult.lastID;

            // 6. Insert Order Items & Reserve stock immediately in warehouse
            for (const item of itemsWithDetails) {
                await db.run(
                    `INSERT INTO order_items (
                        order_id, product_id, variant_id, product_name, variant_name, sku,
                        unit_price, quantity, total_price, created_by, updated_by
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        orderId, item.product_id, item.variant_id, item.product_name, item.variant_name, item.sku,
                        item.unit_price, item.quantity, item.total_price, userId, userId
                    ]
                );

                // Reserve inventory to prevent overselling
                await inventoryService.reserveStock(item.variant_id, warehouseId, item.quantity, orderId, userId);
            }

            // 7. Log to order timeline
            await db.run(
                `INSERT INTO order_timeline (order_id, status, message, created_by_user_id, created_by_name)
                 VALUES (?, ?, ?, ?, ?)`,
                [orderId, 'RECEIVED', 'Order received and logged to processing queue.', userId, 'System']
            );

            const createdOrder = await db.get(`SELECT * FROM orders WHERE id = ?`, [orderId]);
            createdOrder.items = itemsWithDetails;

            // 8. Publish Domain Event
            await eventBus.publish('OrderPlaced', {
                aggregateType: 'order',
                aggregateId: String(orderId),
                payload: createdOrder,
                userId
            });

            return createdOrder;
        });
    }

    /**
     * Transition order status checking workflow engine constraints & running auto actions
     */
    async transitionOrderStatus(orderId, targetStatus, user) {
        return await db.transaction(async () => {
            const order = await db.get(`SELECT * FROM orders WHERE id = ?`, [orderId]);
            if (!order) throw new Error('Order not found.');

            const items = await db.all(`SELECT * FROM order_items WHERE order_id = ?`, [orderId]);

            // 1. Ask workflow engine to authorize transition
            const check = await workflowEngine.transition(
                'order_lifecycle',
                orderId,
                order.order_status,
                targetStatus,
                user
            );

            // 2. Perform database state mutation
            await db.run(
                `UPDATE orders 
                 SET order_status = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [targetStatus, user.id, orderId]
            );

            // 3. Log event details to order timeline
            await db.run(
                `INSERT INTO order_timeline (order_id, status, message, created_by_user_id, created_by_name)
                 VALUES (?, ?, ?, ?, ?)`,
                [orderId, targetStatus, `Status updated to ${targetStatus} by ${user.name}.`, user.id, user.name]
            );

            // 4. Run automatic actions linked to the transition
            if (check.autoActions.includes('consume_inventory')) {
                for (const item of items) {
                    // Deduct inventory batches physically via FIFO
                    await inventoryService.consumeOnInvoice(item.variant_id, order.warehouse_id, item.quantity, orderId, user.id);
                }
            }

            if (check.autoActions.includes('release_reservation')) {
                for (const item of items) {
                    await inventoryService.releaseReservation(item.variant_id, order.warehouse_id, item.quantity, orderId, user.id);
                }
            }

            if (check.autoActions.includes('generate_invoice_pdf')) {
                await this.generateAndVaultInvoice(order, items, user);
            }

            const updatedOrder = await db.get(`SELECT * FROM orders WHERE id = ?`, [orderId]);

            // 5. Emit Domain Event
            await eventBus.publish(check.event, {
                aggregateType: 'order',
                aggregateId: String(orderId),
                payload: {
                    order: updatedOrder,
                    transitionMeta: check.metadata
                },
                userId: user.id
            });

            return updatedOrder;
        });
    }

    /**
     * Generate HTML Invoice from Handlebars template and write to vault
     */
    async generateAndVaultInvoice(order, items, user) {
        try {
            const customer = await db.get(`SELECT * FROM customers WHERE id = ?`, [order.customer_id]);
            const warehouse = await db.get(`SELECT * FROM warehouses WHERE id = ?`, [order.warehouse_id]);

            const templateContext = {
                orderNumber: order.order_number,
                date: new Date().toLocaleDateString(),
                customer: {
                    name: customer ? customer.name : 'Guest Customer',
                    phone: customer ? customer.phone : ''
                },
                shippingAddress: JSON.parse(order.shipping_address_json),
                items: items.map(i => ({
                    product_name: i.product_name,
                    variant_name: i.variant_name,
                    sku: i.sku,
                    quantity: i.quantity,
                    unit_price: (i.unit_price / 100).toFixed(2),
                    total_price: (i.total_price / 100).toFixed(2)
                })),
                subtotal_amount: (order.subtotal_amount / 100).toFixed(2),
                tax_amount: (order.tax_amount / 100).toFixed(2),
                shipping_charge: (order.shipping_charge / 100).toFixed(2),
                total_amount: (order.total_amount / 100).toFixed(2)
            };

            const invoiceHtml = await templateEngine.render('invoice', templateContext);

            // Save dynamic invoice layout into local directory
            const docsDir = path.join(__dirname, '..', 'vault', 'invoices');
            if (!fs.existsSync(docsDir)) {
                fs.mkdirSync(docsDir, { recursive: true });
            }

            const fileName = `INV-${order.order_number}.html`;
            const filePath = path.join(docsDir, fileName);
            fs.writeFileSync(filePath, invoiceHtml, 'utf8');

            const relativePath = `/vault/invoices/${fileName}`;

            // Log details into document_vault
            await db.run(
                `INSERT INTO document_vault (
                    entity_type, entity_id, document_type, template_key, file_path, generated_by
                 ) VALUES ('order', ?, 'INVOICE', 'invoice', ?, ?)`,
                [order.id, relativePath, user.id]
            );

            console.log(`[OrderService] Invoice generated and vaulted successfully at: ${relativePath}`);
        } catch (err) {
            console.error('[OrderService] Invoice generation failed:', err);
        }
    }
}

const orderService = new OrderService();
module.exports = orderService;
