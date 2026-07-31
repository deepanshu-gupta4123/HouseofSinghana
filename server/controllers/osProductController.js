const db = require('../db');
const { active } = require('../middleware/softDelete');

// --- CATEGORIES CRUD ---

/**
 * List all categories (active only)
 */
async function listCategories(req, res) {
    try {
        const rows = await db.all(
            `SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order ASC`
        );
        res.json(rows);
    } catch (err) {
        console.error('[ProductCMS] listCategories failed:', err);
        res.status(500).json({ error: 'Failed to retrieve categories.' });
    }
}

/**
 * Create Category
 */
async function createCategory(req, res) {
    const { name, slug, description, sort_order } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Name and slug are required.' });

    try {
        const result = await db.run(
            `INSERT INTO categories (name, slug, description, sort_order, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [name, slug, description, sort_order || 0, req.user.id, req.user.id]
        );

        const newCategory = await db.get(`SELECT * FROM categories WHERE id = ?`, [result.lastID]);
        
        await req.logAudit('CREATE_CATEGORY', 'category', result.lastID, null, newCategory);
        res.status(201).json(newCategory);
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Slug must be unique.' });
        }
        console.error('[ProductCMS] createCategory failed:', err);
        res.status(500).json({ error: 'Failed to create category.' });
    }
}

/**
 * Update Category
 */
async function updateCategory(req, res) {
    const { id } = req.params;
    const { name, slug, description, sort_order } = req.body;

    try {
        const oldCategory = await db.get(`SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL`, [id]);
        if (!oldCategory) return res.status(404).json({ error: 'Category not found.' });

        await db.run(
            `UPDATE categories 
             SET name = ?, slug = ?, description = ?, sort_order = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [name || oldCategory.name, slug || oldCategory.slug, description !== undefined ? description : oldCategory.description, sort_order !== undefined ? sort_order : oldCategory.sort_order, req.user.id, id]
        );

        const updatedCategory = await db.get(`SELECT * FROM categories WHERE id = ?`, [id]);
        await req.logAudit('UPDATE_CATEGORY', 'category', id, oldCategory, updatedCategory);
        
        res.json(updatedCategory);
    } catch (err) {
        console.error('[ProductCMS] updateCategory failed:', err);
        res.status(500).json({ error: 'Failed to update category.' });
    }
}

/**
 * Soft Delete Category
 */
async function deleteCategory(req, res) {
    const { id } = req.params;
    try {
        const oldCategory = await db.get(`SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL`, [id]);
        if (!oldCategory) return res.status(404).json({ error: 'Category not found or already deleted.' });

        await db.run(
            `UPDATE categories 
             SET deleted_at = CURRENT_TIMESTAMP, updated_by = ?, updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [req.user.id, id]
        );

        await req.logAudit('DELETE_CATEGORY', 'category', id, oldCategory, { ...oldCategory, deleted_at: 'now' });
        res.json({ success: true, message: 'Category soft-deleted successfully.' });
    } catch (err) {
        console.error('[ProductCMS] deleteCategory failed:', err);
        res.status(500).json({ error: 'Failed to delete category.' });
    }
}


// --- PRODUCTS & VARIANTS CRUD ---

/**
 * List all products with their variants (active only)
 */
async function listProducts(req, res) {
    try {
        const products = await db.all(
            `SELECT p.*, c.name as category_name 
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.deleted_at IS NULL 
             ORDER BY p.id DESC`
        );

        // Fetch variants for each product
        for (const product of products) {
            product.variants = await db.all(
                `SELECT * FROM product_variants WHERE product_id = ? AND deleted_at IS NULL`,
                [product.id]
            );
        }

        res.json(products);
    } catch (err) {
        console.error('[ProductCMS] listProducts failed:', err);
        res.status(500).json({ error: 'Failed to retrieve products.' });
    }
}

/**
 * Get single product detail
 */
async function getProduct(req, res) {
    const { id } = req.params;
    try {
        const product = await db.get(
            `SELECT p.*, c.name as category_name 
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.id = ? AND p.deleted_at IS NULL`,
            [id]
        );

        if (!product) return res.status(404).json({ error: 'Product not found.' });

        product.variants = await db.all(
            `SELECT * FROM product_variants WHERE product_id = ? AND deleted_at IS NULL`,
            [id]
        );

        res.json(product);
    } catch (err) {
        console.error('[ProductCMS] getProduct failed:', err);
        res.status(500).json({ error: 'Failed to retrieve product details.' });
    }
}

/**
 * Create Product with Variants (Atomic Transaction)
 */
async function createProduct(req, res) {
    const {
        name, slug, sku, barcode, category_id, base_price, discount_price,
        tax_rate, hsn_code, description, merchant_notes, status, seo_title,
        seo_description, images, videos, variants
    } = req.body;

    if (!name || !slug || !sku || !base_price) {
        return res.status(400).json({ error: 'Name, slug, base SKU, and base price are required.' });
    }

    try {
        const result = await db.transaction(async () => {
            // 1. Insert product record
            const prodResult = await db.run(
                `INSERT INTO products (
                    name, slug, sku, barcode, category_id, base_price, discount_price,
                    tax_rate, hsn_code, description, merchant_notes, status, seo_title,
                    seo_description, images, videos, created_by, updated_by
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    name, slug, sku, barcode, category_id || null, base_price, discount_price || null,
                    tax_rate || 0.0, hsn_code, description, merchant_notes, status || 'draft',
                    seo_title, seo_description, 
                    images ? JSON.stringify(images) : '[]', 
                    videos ? JSON.stringify(videos) : '[]',
                    req.user.id, req.user.id
                ]
            );

            const productId = prodResult.lastID;

            // 2. Insert variants if provided
            if (variants && Array.isArray(variants)) {
                for (const variant of variants) {
                    await db.run(
                        `INSERT INTO product_variants (
                            product_id, sku, barcode, variant_name, size_label,
                            packaging_type, price, discount_price, weight_grams,
                            reorder_level, created_by, updated_by
                         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            productId, variant.sku, variant.barcode || null, variant.variant_name,
                            variant.size_label, variant.packaging_type, variant.price,
                            variant.discount_price || null, variant.weight_grams || 0,
                            variant.reorder_level || 10, req.user.id, req.user.id
                        ]
                    );

                    // Initialize the inventory summary rows for this variant across default warehouses
                    const whs = await db.all(`SELECT id FROM warehouses WHERE is_active = 1`);
                    for (const wh of whs) {
                        await db.run(
                            `INSERT OR IGNORE INTO inventory_summary (
                                variant_id, warehouse_id, current_stock, reserved_stock,
                                incoming_stock, damaged_stock, blocked_stock, reorder_level,
                                created_by, updated_by
                             ) VALUES (?, ?, 0, 0, 0, 0, 0, ?, ?, ?)`,
                            [
                                productId, wh.id, variant.reorder_level || 10, req.user.id, req.user.id
                            ]
                        );
                    }
                }
            }

            return productId;
        });

        const newProduct = await db.get(`SELECT * FROM products WHERE id = ?`, [result]);
        newProduct.variants = await db.all(`SELECT * FROM product_variants WHERE product_id = ?`, [result]);

        await req.logAudit('CREATE_PRODUCT', 'product', result, null, newProduct);
        res.status(201).json(newProduct);

    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'SKU or Slug already exists.' });
        }
        console.error('[ProductCMS] createProduct failed:', err);
        res.status(500).json({ error: 'Failed to create product.' });
    }
}

/**
 * Update Product with Price Approval logic
 */
async function updateProduct(req, res) {
    const { id } = req.params;
    const {
        name, slug, sku, barcode, category_id, base_price, discount_price,
        tax_rate, hsn_code, description, merchant_notes, status, seo_title,
        seo_description, images, videos, variants
    } = req.body;

    try {
        const oldProduct = await db.get(`SELECT * FROM products WHERE id = ? AND deleted_at IS NULL`, [id]);
        if (!oldProduct) return res.status(404).json({ error: 'Product not found.' });

        const oldVariants = await db.all(`SELECT * FROM product_variants WHERE product_id = ? AND deleted_at IS NULL`, [id]);

        // PRICE APPROVAL GUARD: If base_price is changed, verify user permissions.
        // If user role is support or packing or accountant (not super_admin or merchant), route it to approval table.
        const isPriceChanged = base_price && Number(base_price) !== Number(oldProduct.base_price);
        const needsApproval = isPriceChanged && !['super_admin', 'merchant'].includes(req.user.role_id);

        if (needsApproval) {
            // Create approval request instead of updating price directly
            await db.run(
                `INSERT INTO approval_requests (request_type, entity_type, entity_id, details, requested_by)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    'PRICE_UPDATE', 'product', String(id),
                    JSON.stringify({
                        old_price: oldProduct.base_price,
                        new_price: base_price,
                        user: req.user.email
                    }),
                    req.user.id
                ]
            );

            console.log(`[ProductCMS] Price update for Product #${id} requested approval by ${req.user.email}`);
        }

        // Apply product updates (excluding price if approval is pending)
        const activePrice = needsApproval ? oldProduct.base_price : (base_price || oldProduct.base_price);

        await db.transaction(async () => {
            await db.run(
                `UPDATE products 
                 SET name = ?, slug = ?, sku = ?, barcode = ?, category_id = ?, 
                     base_price = ?, discount_price = ?, tax_rate = ?, hsn_code = ?, 
                     description = ?, merchant_notes = ?, status = ?, seo_title = ?, 
                     seo_description = ?, images = ?, videos = ?, 
                     updated_by = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [
                    name || oldProduct.name,
                    slug || oldProduct.slug,
                    sku || oldProduct.sku,
                    barcode !== undefined ? barcode : oldProduct.barcode,
                    category_id !== undefined ? category_id : oldProduct.category_id,
                    activePrice,
                    discount_price !== undefined ? discount_price : oldProduct.discount_price,
                    tax_rate !== undefined ? tax_rate : oldProduct.tax_rate,
                    hsn_code !== undefined ? hsn_code : oldProduct.hsn_code,
                    description !== undefined ? description : oldProduct.description,
                    merchant_notes !== undefined ? merchant_notes : oldProduct.merchant_notes,
                    status || oldProduct.status,
                    seo_title !== undefined ? seo_title : oldProduct.seo_title,
                    seo_description !== undefined ? seo_description : oldProduct.seo_description,
                    images ? JSON.stringify(images) : oldProduct.images,
                    videos ? JSON.stringify(videos) : oldProduct.videos,
                    req.user.id, id
                ]
            );

            // Update variants list if provided
            if (variants && Array.isArray(variants)) {
                // Soft delete old variants not present in incoming list
                const incomingVariantSkus = variants.map(v => v.sku);
                for (const oldVar of oldVariants) {
                    if (!incomingVariantSkus.includes(oldVar.sku)) {
                        await db.run(
                            `UPDATE product_variants SET deleted_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?`,
                            [req.user.id, oldVar.id]
                        );
                    }
                }

                // Insert or update incoming variants
                for (const variant of variants) {
                    const existingVar = oldVariants.find(v => v.sku === variant.sku);
                    if (existingVar) {
                        // Check if variant price changed and needs approval
                        const isVarPriceChanged = variant.price && Number(variant.price) !== Number(existingVar.price);
                        const varPriceNeedsApproval = isVarPriceChanged && !['super_admin', 'merchant'].includes(req.user.role_id);
                        const activeVarPrice = varPriceNeedsApproval ? existingVar.price : variant.price;

                        if (varPriceNeedsApproval) {
                            await db.run(
                                `INSERT INTO approval_requests (request_type, entity_type, entity_id, details, requested_by)
                                 VALUES (?, ?, ?, ?, ?)`,
                                [
                                    'VARIANT_PRICE_UPDATE', 'product_variant', String(existingVar.id),
                                    JSON.stringify({
                                        product_id: id,
                                        sku: variant.sku,
                                        old_price: existingVar.price,
                                        new_price: variant.price
                                    }),
                                    req.user.id
                                ]
                            );
                        }

                        await db.run(
                            `UPDATE product_variants 
                             SET barcode = ?, variant_name = ?, size_label = ?, packaging_type = ?, 
                                 price = ?, discount_price = ?, weight_grams = ?, reorder_level = ?, 
                                 updated_by = ?, updated_at = CURRENT_TIMESTAMP, deleted_at = NULL
                             WHERE id = ?`,
                            [
                                variant.barcode !== undefined ? variant.barcode : existingVar.barcode,
                                variant.variant_name || existingVar.variant_name,
                                variant.size_label || existingVar.size_label,
                                variant.packaging_type !== undefined ? variant.packaging_type : existingVar.packaging_type,
                                activeVarPrice,
                                variant.discount_price !== undefined ? variant.discount_price : existingVar.discount_price,
                                variant.weight_grams !== undefined ? variant.weight_grams : existingVar.weight_grams,
                                variant.reorder_level !== undefined ? variant.reorder_level : existingVar.reorder_level,
                                req.user.id, existingVar.id
                            ]
                        );
                    } else {
                        // Create brand new variant
                        await db.run(
                            `INSERT INTO product_variants (
                                product_id, sku, barcode, variant_name, size_label,
                                packaging_type, price, discount_price, weight_grams,
                                reorder_level, created_by, updated_by
                             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                id, variant.sku, variant.barcode || null, variant.variant_name,
                                variant.size_label, variant.packaging_type, variant.price,
                                variant.discount_price || null, variant.weight_grams || 0,
                                variant.reorder_level || 10, req.user.id, req.user.id
                            ]
                        );
                    }
                }
            }
        });

        const updatedProduct = await db.get(`SELECT * FROM products WHERE id = ?`, [id]);
        updatedProduct.variants = await db.all(`SELECT * FROM product_variants WHERE product_id = ? AND deleted_at IS NULL`, [id]);

        await req.logAudit('UPDATE_PRODUCT', 'product', id, oldProduct, updatedProduct);
        
        res.json({
            product: updatedProduct,
            approvalPending: needsApproval,
            message: needsApproval ? 'Product updated successfully, but price changes require supervisor approval.' : 'Product updated successfully.'
        });

    } catch (err) {
        console.error('[ProductCMS] updateProduct failed:', err);
        res.status(500).json({ error: 'Failed to update product.' });
    }
}

/**
 * Soft Delete Product
 */
async function deleteProduct(req, res) {
    const { id } = req.params;
    try {
        const oldProduct = await db.get(`SELECT * FROM products WHERE id = ? AND deleted_at IS NULL`, [id]);
        if (!oldProduct) return res.status(404).json({ error: 'Product not found or already deleted.' });

        await db.transaction(async () => {
            // Soft delete product
            await db.run(
                `UPDATE products SET deleted_at = CURRENT_TIMESTAMP, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [req.user.id, id]
            );
            // Soft delete linked variants
            await db.run(
                `UPDATE product_variants SET deleted_at = CURRENT_TIMESTAMP, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?`,
                [req.user.id, id]
            );
        });

        await req.logAudit('DELETE_PRODUCT', 'product', id, oldProduct, { ...oldProduct, deleted_at: 'now' });
        res.json({ success: true, message: 'Product and variants soft-deleted successfully.' });
    } catch (err) {
        console.error('[ProductCMS] deleteProduct failed:', err);
        res.status(500).json({ error: 'Failed to delete product.' });
    }
}

async function listPendingApprovals(req, res) {
    try {
        const rows = await db.all(`
            SELECT approval_requests.*, users.email as requested_by_email
            FROM approval_requests
            LEFT JOIN users ON approval_requests.requested_by = users.id
            WHERE approval_requests.status = 'PENDING'
            ORDER BY approval_requests.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error('[ProductCMS] listPendingApprovals failed:', err);
        res.status(500).json({ error: 'Failed to retrieve approval requests.' });
    }
}

async function respondToApproval(req, res) {
    const { id } = req.params;
    const { action } = req.body; // 'APPROVED' or 'REJECTED'
    if (!['APPROVED', 'REJECTED'].includes(action)) {
        return res.status(400).json({ error: 'Invalid response action.' });
    }

    try {
        await db.run('BEGIN TRANSACTION');

        const request = await db.get(`SELECT * FROM approval_requests WHERE id = ? AND status = 'PENDING'`, [id]);
        if (!request) {
            await db.run('ROLLBACK');
            return res.status(404).json({ error: 'Approval request not found or already processed.' });
        }

        const details = JSON.parse(request.details);

        await db.run(
            `UPDATE approval_requests 
             SET status = ?, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [action, req.user.id, id]
        );

        if (action === 'APPROVED') {
            if (request.request_type === 'PRICE_UPDATE') {
                await db.run(
                    `UPDATE products SET base_price = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?`,
                    [details.new_price, req.user.id, request.entity_id]
                );
            } else if (request.request_type === 'VARIANT_PRICE_UPDATE') {
                await db.run(
                    `UPDATE product_variants SET price = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?`,
                    [details.new_price, req.user.id, request.entity_id]
                );
            }
        }

        await db.run('COMMIT');
        res.json({ success: true, message: `Request successfully ${action.toLowerCase()}.` });
    } catch (err) {
        await db.run('ROLLBACK');
        console.error('[ProductCMS] respondToApproval failed:', err);
        res.status(500).json({ error: 'Failed to process approval request.' });
    }
}

module.exports = {
    listCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    listProducts,
    getProduct,
    createProduct,
    updateProduct,
    deleteProduct,
    listPendingApprovals,
    respondToApproval
};
