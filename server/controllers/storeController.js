const db = require('../db');

/**
 * Public API: List active categories
 */
async function listCategories(req, res) {
    try {
        const rows = await db.all(
            `SELECT name, slug, description, sort_order 
             FROM categories 
             WHERE deleted_at IS NULL AND is_archived = 0 
             ORDER BY sort_order ASC`
        );
        res.json(rows);
    } catch (err) {
        console.error('[StoreFrontAPI] listCategories failed:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
}

/**
 * Public API: List active products with variants
 */
async function listProducts(req, res) {
    const { category_slug } = req.query;
    try {
        let query = `
            SELECT p.id, p.name, p.slug, p.sku, p.base_price, p.discount_price, p.tax_rate, p.images, p.videos, p.seo_title, p.seo_description, c.name as category_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.deleted_at IS NULL AND p.is_archived = 0 AND p.status = 'active'
        `;
        const params = [];

        if (category_slug) {
            query += ` AND c.slug = ?`;
            params.push(category_slug);
        }

        query += ` ORDER BY p.id DESC`;

        const products = await db.all(query, params);

        for (const product of products) {
            // Parse images/videos JSON strings if they aren't parsed
            try {
                product.images = JSON.parse(product.images || '[]');
            } catch (e) {
                product.images = [];
            }
            try {
                product.videos = JSON.parse(product.videos || '[]');
            } catch (e) {
                product.videos = [];
            }

            product.variants = await db.all(
                `SELECT id, variant_name, size_label, packaging_type, price, discount_price, weight_grams, reorder_level
                 FROM product_variants 
                 WHERE product_id = ? AND deleted_at IS NULL AND is_archived = 0`,
                [product.id]
            );

            // Fetch available stock levels from inventory_summary
            for (const variant of product.variants) {
                const stockResult = await db.get(
                    `SELECT SUM(available_stock) as available 
                     FROM inventory_summary 
                     WHERE variant_id = ?`,
                    [variant.id]
                );
                variant.available_stock = stockResult ? (stockResult.available || 0) : 0;
            }
        }

        res.json(products);
    } catch (err) {
        console.error('[StoreFrontAPI] listProducts failed:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
}

/**
 * Public API: Get single product by slug
 */
async function getProductBySlug(req, res) {
    const { slug } = req.params;
    try {
        const product = await db.get(
            `SELECT p.id, p.name, p.slug, p.sku, p.base_price, p.discount_price, p.tax_rate, p.description, p.images, p.videos, p.seo_title, p.seo_description, c.name as category_name
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.slug = ? AND p.deleted_at IS NULL AND p.is_archived = 0 AND p.status = 'active'`,
            [slug]
        );

        if (!product) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        try {
            product.images = JSON.parse(product.images || '[]');
        } catch (e) {
            product.images = [];
        }
        try {
            product.videos = JSON.parse(product.videos || '[]');
        } catch (e) {
            product.videos = [];
        }

        product.variants = await db.all(
            `SELECT id, variant_name, size_label, packaging_type, price, discount_price, weight_grams, reorder_level
             FROM product_variants 
             WHERE product_id = ? AND deleted_at IS NULL AND is_archived = 0`,
            [product.id]
        );

        for (const variant of product.variants) {
            const stockResult = await db.get(
                `SELECT SUM(available_stock) as available 
                 FROM inventory_summary 
                 WHERE variant_id = ?`,
                [variant.id]
            );
            variant.available_stock = stockResult ? (stockResult.available || 0) : 0;
        }

        res.json(product);
    } catch (err) {
        console.error('[StoreFrontAPI] getProductBySlug failed:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
}

/**
 * Public API: List visible FAQs
 */
async function listFaqs(req, res) {
    try {
        const rows = await db.all(
            `SELECT id, question, answer, category 
             FROM faqs 
             WHERE is_visible = 1 AND deleted_at IS NULL 
             ORDER BY sort_order ASC, id ASC`
        );
        res.json(rows);
    } catch (err) {
        console.error('[StoreFrontAPI] listFaqs failed:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
}

/**
 * Public API: Get visible homepage sections configuration
 */
async function getHomepageLayout(req, res) {
    try {
        const rows = await db.all(
            `SELECT section_key, title, content_json 
             FROM homepage_sections 
             WHERE is_visible = 1 
             ORDER BY sort_order ASC`
        );

        // Parse content JSON strings
        const parsed = rows.map(r => {
            let content = {};
            try {
                content = JSON.parse(r.content_json);
            } catch (e) {
                content = {};
            }
            return {
                section_key: r.section_key,
                title: r.title,
                content
            };
        });

        res.json(parsed);
    } catch (err) {
        console.error('[StoreFrontAPI] getHomepageLayout failed:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
}

/**
 * Public API: Retrieve SEO metadata for a page path
 */
async function getSeoMetadata(req, res) {
    const { path } = req.query;
    if (!path) return res.status(400).json({ error: 'Query path is required.' });

    try {
        const row = await db.get(
            `SELECT meta_title, meta_description, og_image_url, canonical_url, robots, schema_json 
             FROM seo_metadata 
             WHERE page_path = ?`,
            [path]
        );

        if (!row) {
            return res.json({
                meta_title: 'House of Singhana | Premium Spices',
                meta_description: 'Authentic high-grade Indian spices sourced directly from single estates.',
                robots: 'index, follow'
            });
        }

        res.json(row);
    } catch (err) {
        console.error('[StoreFrontAPI] getSeoMetadata failed:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
}

/**
 * Customer API: List saved customer addresses
 */
async function listAddresses(req, res) {
    try {
        const rows = await db.all(
            `SELECT *, recipient_phone as phone, label as address_label FROM customer_addresses WHERE customer_id = ? AND deleted_at IS NULL`,
            [req.user.id]
        );
        res.json(rows);
    } catch (err) {
        console.error('[StoreAPI] listAddresses failed:', err);
        res.status(500).json({ error: 'Failed to retrieve addresses.' });
    }
}

/**
 * Customer API: Add a new saved address
 */
async function createAddress(req, res) {
    const { address_label, recipient_name, phone, address_line1, address_line2, city, state, pincode, is_default } = req.body;
    if (!address_label || !recipient_name || !phone || !address_line1 || !city || !state || !pincode) {
        return res.status(400).json({ error: 'All core address fields are required.' });
    }

    try {
        await db.transaction(async () => {
            if (is_default) {
                // Clear any other default address first
                await db.run(
                    `UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?`,
                    [req.user.id]
                );
            }

            await db.run(
                `INSERT INTO customer_addresses (
                    customer_id, label, recipient_name, recipient_phone,
                    address_line1, address_line2, city, state, pincode, is_default
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    req.user.id, address_label, recipient_name, phone,
                    address_line1, address_line2 || '', city, state, pincode, is_default ? 1 : 0
                ]
            );
        });

        res.status(201).json({ success: true, message: 'Address saved successfully.' });
    } catch (err) {
        console.error('[StoreAPI] createAddress failed:', err);
        res.status(500).json({ error: 'Failed to save address.' });
    }
}

/**
 * Customer API: Remove a saved address (soft-delete)
 */
async function deleteAddress(req, res) {
    const { id } = req.params;
    try {
        const result = await db.run(
            `UPDATE customer_addresses SET deleted_at = datetime('now') WHERE id = ? AND customer_id = ?`,
            [id, req.user.id]
        );
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Address not found or access denied.' });
        }
        res.json({ success: true, message: 'Address removed.' });
    } catch (err) {
        console.error('[StoreAPI] deleteAddress failed:', err);
        res.status(500).json({ error: 'Failed to remove address.' });
    }
}

/**
 * Customer API: Validate and preview coupon discount
 */
async function applyCoupon(req, res) {
    const couponService = require('../services/couponService');
    const { code, subtotal } = req.body;
    if (!code || !subtotal) {
        return res.status(400).json({ error: 'Coupon code and subtotal are required.' });
    }

    try {
        const result = await couponService.validateAndApplyCoupon(code, subtotal, req.user.id);
        res.json({
            success: true,
            discountApplied: result.discountApplied,
            couponCode: result.coupon.code
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
}

/**
 * Customer API: Process Order Checkout placing
 */
async function checkoutOrder(req, res) {
    const orderService = require('../services/orderService');
    const {
        warehouse_id = 1,
        shipping_address,
        billing_address,
        order_notes,
        is_gift,
        gift_message,
        gift_packaging,
        hide_invoice,
        coupon_code,
        items,
        payment_method
    } = req.body;

    if (!shipping_address || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Shipping address and cart items are required.' });
    }

    try {
        const customerId = req.user.id;

        // Process order creation
        const order = await orderService.createOrder({
            customerId,
            warehouseId: warehouse_id,
            shippingAddress: shipping_address,
            billingAddress: billing_address || shipping_address,
            orderNotes: order_notes,
            isGift: is_gift,
            giftMessage: gift_message,
            giftPackaging: gift_packaging,
            hideInvoice: hide_invoice,
            couponCode: coupon_code,
            items: items.map(item => ({
                variant_id: item.variant_id || item.id,
                quantity: item.qty || item.quantity || 1
            })),
            paymentMethod: payment_method || 'online',
            userId: customerId
        });

        let rzpOrder = null;
        if (payment_method !== 'cod') {
            rzpOrder = {
                id: `order_${Math.random().toString(36).substring(2, 17)}`,
                amount: order.total_amount,
                currency: "INR"
            };
        }

        // Clear cart recovery database row
        const cartRecoveryService = require('../services/cartRecoveryService');
        await cartRecoveryService.clearCart(customerId);

        res.status(201).json({
            success: true,
            message: 'Order created successfully.',
            orderId: order.id,
            orderNumber: order.order_number,
            total_amount: order.total_amount,
            rzpOrder
        });

    } catch (err) {
        console.error('[StoreAPI] checkoutOrder failed:', err);
        res.status(400).json({ error: err.message });
    }
}

/**
 * Public API: Add product to customer wishlist
 */
async function addToWishlist(req, res) {
    const { product_id } = req.body;
    if (!product_id) return res.status(400).json({ error: 'Product ID is required.' });

    try {
        await db.run(
            `INSERT OR IGNORE INTO wishlists (customer_id, product_id) VALUES (?, ?)`,
            [req.user.id, product_id]
        );
        res.json({ success: true, message: 'Added to wishlist.' });
    } catch (err) {
        console.error('[StoreAPI] addToWishlist failed:', err);
        res.status(500).json({ error: 'Failed to update wishlist.' });
    }
}

/**
 * Public API: Remove product from customer wishlist
 */
async function removeFromWishlist(req, res) {
    const { productId } = req.params;
    try {
        await db.run(
            `DELETE FROM wishlists WHERE customer_id = ? AND product_id = ?`,
            [req.user.id, productId]
        );
        res.json({ success: true, message: 'Removed from wishlist.' });
    } catch (err) {
        console.error('[StoreAPI] removeFromWishlist failed:', err);
        res.status(500).json({ error: 'Failed to update wishlist.' });
    }
}

/**
 * Public API: Get customer wishlist items
 */
async function getWishlist(req, res) {
    try {
        const rows = await db.all(
            `SELECT w.created_at, p.id, p.name, p.slug, p.base_price, p.discount_price, p.images
             FROM wishlists w
             JOIN products p ON w.product_id = p.id
             WHERE w.customer_id = ?`,
            [req.user.id]
        );
        
        // Parse images
        for (const product of rows) {
            try {
                product.images = JSON.parse(product.images || '[]');
            } catch (e) {
                product.images = [];
            }
        }
        res.json(rows);
    } catch (err) {
        console.error('[StoreAPI] getWishlist failed:', err);
        res.status(500).json({ error: 'Failed to fetch wishlist.' });
    }
}

/**
 * Public API: Register interest for out-of-stock item
 */
async function registerInterest(req, res) {
    const { variant_id, email, phone } = req.body;
    try {
        const waitlistService = require('../services/waitlistService');
        await waitlistService.registerInterest(variant_id, email, phone);
        res.json({ success: true, message: 'Interest registered successfully. We will notify you when it returns to stock.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
}

/**
 * Public API: Sync active cart contents from the storefront localStorage
 */
async function syncCart(req, res) {
    const { cartItems } = req.body;
    try {
        const cartRecoveryService = require('../services/cartRecoveryService');
        await cartRecoveryService.syncCart(req.user.id, cartItems);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to sync cart.' });
    }
}

module.exports = {
    listCategories,
    listProducts,
    getProductBySlug,
    listFaqs,
    getHomepageLayout,
    getSeoMetadata,
    listAddresses,
    createAddress,
    deleteAddress,
    applyCoupon,
    checkoutOrder,
    addToWishlist,
    removeFromWishlist,
    getWishlist,
    registerInterest,
    syncCart
};
