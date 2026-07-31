const db = require('../db');
const inventoryService = require('../services/inventoryService');

/**
 * List active inventory summary entries
 */
async function listInventorySummary(req, res) {
    try {
        const rows = await db.all(`
            SELECT s.*, v.variant_name, v.sku, v.size_label, v.price, p.name as product_name, w.name as warehouse_name
            FROM inventory_summary s
            JOIN product_variants v ON s.variant_id = v.id
            JOIN products p ON v.product_id = p.id
            JOIN warehouses w ON s.warehouse_id = w.id
            WHERE p.deleted_at IS NULL AND v.deleted_at IS NULL
            ORDER BY s.available_stock ASC
        `);
        res.json(rows);
    } catch (err) {
        console.error('[InventoryCMS] listInventorySummary failed:', err);
        res.status(500).json({ error: 'Failed to fetch inventory summary.' });
    }
}

/**
 * List procurement batches
 */
async function listBatches(req, res) {
    try {
        const rows = await db.all(`
            SELECT b.*, v.variant_name, v.sku, p.name as product_name, w.name as warehouse_name
            FROM inventory_batches b
            JOIN product_variants v ON b.variant_id = v.id
            JOIN products p ON v.product_id = p.id
            JOIN warehouses w ON b.warehouse_id = w.id
            WHERE p.deleted_at IS NULL
            ORDER BY b.procurement_date DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error('[InventoryCMS] listBatches failed:', err);
        res.status(500).json({ error: 'Failed to fetch procurement batches.' });
    }
}

/**
 * Receive new procurement batch (Purchase Receipt)
 */
async function receiveBatch(req, res) {
    const {
        batch_number, variant_id, warehouse_id, supplier_name,
        procurement_date, unit_purchase_cost, quantity_received, expiry_date, remarks
    } = req.body;

    if (!batch_number || !variant_id || !warehouse_id || !supplier_name || !quantity_received || !unit_purchase_cost) {
        return res.status(400).json({ error: 'All core procurement parameters are required.' });
    }

    try {
        const batchId = await inventoryService.receiveBatch({
            batchNumber: batch_number,
            variantId: variant_id,
            warehouseId: warehouse_id,
            supplierName: supplier_name,
            procurementDate: procurement_date,
            unitPurchaseCost: unit_purchase_cost,
            quantityReceived: quantity_received,
            expiryDate: expiry_date,
            remarks,
            userId: req.user ? req.user.id : 1
        });

        const newBatch = await db.get(`SELECT * FROM inventory_batches WHERE id = ?`, [batchId]);

        res.status(201).json({
            message: 'Batch successfully received and logged to inventory ledger.',
            batch: newBatch
        });
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: `Batch number "${batch_number}" already exists.` });
        }
        console.error('[InventoryCMS] receiveBatch failed:', err);
        res.status(500).json({ error: 'Failed to log procurement batch.' });
    }
}

/**
 * Run Physical Stock Audit count
 */
async function runAuditAdjustment(req, res) {
    const { variant_id, warehouse_id, physical_count, remarks } = req.body;

    if (!variant_id || !warehouse_id || physical_count === undefined || !remarks) {
        return res.status(400).json({ error: 'Variant ID, Warehouse ID, physical count, and remarks are required.' });
    }

    try {
        const result = await inventoryService.adjustAudit(
            variant_id,
            warehouse_id,
            physical_count,
            remarks,
            req.user ? req.user.id : 1
        );
        res.json({
            message: 'Physical audit logged and ledger updated.',
            ...result
        });
    } catch (err) {
        console.error('[InventoryCMS] runAuditAdjustment failed:', err);
        res.status(500).json({ error: 'Failed to record inventory audit adjustment.' });
    }
}

/**
 * Get ledger movement history for a specific variant SKU
 */
async function getVariantHistory(req, res) {
    const { variantId } = req.params;
    try {
        const rows = await db.all(`
            SELECT l.*, u.name as user_name, b.batch_number
            FROM inventory_ledger l
            LEFT JOIN users u ON l.user_id = u.id
            LEFT JOIN inventory_batches b ON l.batch_id = b.id
            WHERE l.variant_id = ?
            ORDER BY l.created_at DESC
        `, [variantId]);
        res.json(rows);
    } catch (err) {
        console.error('[InventoryCMS] getVariantHistory failed:', err);
        res.status(500).json({ error: 'Failed to fetch variant ledger history.' });
    }
}

/**
 * Get inventory health stats (reorder indicators, asset valuation)
 */
async function getInventoryHealth(req, res) {
    try {
        // 1. Count low stock items
        const lowStockCount = await db.get(`
            SELECT COUNT(*) as count 
            FROM inventory_summary 
            WHERE available_stock < reorder_level
        `);

        // 2. Count depleted items
        const depletedCount = await db.get(`
            SELECT COUNT(*) as count 
            FROM inventory_summary 
            WHERE available_stock <= 0
        `);

        // 3. Asset valuation (quantity remaining * unit purchase cost in batches)
        const valuationResult = await db.get(`
            SELECT SUM(quantity_remaining * unit_purchase_cost) as total_value 
            FROM inventory_batches
        `);

        res.json({
            lowStockCount: lowStockCount ? lowStockCount.count : 0,
            depletedCount: depletedCount ? depletedCount.count : 0,
            totalValuationPaise: valuationResult ? (valuationResult.total_value || 0) : 0,
            totalValuationRupees: valuationResult ? ((valuationResult.total_value || 0) / 100) : 0
        });
    } catch (err) {
        console.error('[InventoryCMS] getInventoryHealth failed:', err);
        res.status(500).json({ error: 'Failed to fetch inventory health metrics.' });
    }
}

module.exports = {
    listInventorySummary,
    listBatches,
    receiveBatch,
    runAuditAdjustment,
    getVariantHistory,
    getInventoryHealth
};
