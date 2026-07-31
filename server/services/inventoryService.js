const db = require('../db');
const eventBus = require('../core/eventBus');

class InventoryService {
    /**
     * Get or initialize inventory summary record for a variant and warehouse
     */
    async getOrInitSummary(variantId, warehouseId, userId = 1) {
        let summary = await db.get(
            `SELECT * FROM inventory_summary WHERE variant_id = ? AND warehouse_id = ?`,
            [variantId, warehouseId]
        );

        if (!summary) {
            // Get reorder level from variant definition
            const variant = await db.get(`SELECT reorder_level FROM product_variants WHERE id = ?`, [variantId]);
            const reorderLevel = variant ? variant.reorder_level : 10;

            await db.run(
                `INSERT OR IGNORE INTO inventory_summary (
                    variant_id, warehouse_id, current_stock, reserved_stock,
                    incoming_stock, damaged_stock, blocked_stock, reorder_level,
                    created_by, updated_by
                 ) VALUES (?, ?, 0, 0, 0, 0, 0, ?, ?, ?)`,
                [variantId, warehouseId, reorderLevel, userId, userId]
            );

            summary = await db.get(
                `SELECT * FROM inventory_summary WHERE variant_id = ? AND warehouse_id = ?`,
                [variantId, warehouseId]
            );
        }

        return summary;
    }

    /**
     * Reserve stock immediately when an order is placed
     */
    async reserveStock(variantId, warehouseId, quantity, orderId, userId = 1) {
        return await db.transaction(async () => {
            const summary = await this.getOrInitSummary(variantId, warehouseId, userId);

            // Available Stock = Current - Reserved
            if (summary.available_stock < quantity) {
                throw new Error(`Insufficient stock available to reserve for Variant #${variantId} at Warehouse #${warehouseId}. Requested: ${quantity}, Available: ${summary.available_stock}`);
            }

            const newReserved = summary.reserved_stock + quantity;

            // Update Summary
            await db.run(
                `UPDATE inventory_summary 
                 SET reserved_stock = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [newReserved, userId, summary.id]
            );

            // Log ledger transaction
            await db.run(
                `INSERT INTO inventory_ledger (
                    variant_id, warehouse_id, transaction_type, change_qty,
                    balance_current_before, balance_current_after,
                    balance_reserved_before, balance_reserved_after,
                    reference_type, reference_id, remarks, user_id
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    variantId, warehouseId, 'RESERVATION', quantity,
                    summary.current_stock, summary.current_stock,
                    summary.reserved_stock, newReserved,
                    'order', String(orderId), 'Order placed reservation', userId
                ]
            );

            // Emit Reservation Event
            await eventBus.publish('InventoryReserved', {
                aggregateType: 'inventory',
                aggregateId: String(summary.id),
                payload: {
                    variantId,
                    warehouseId,
                    orderId,
                    quantityReserved: quantity,
                    currentReserved: newReserved
                },
                userId
            });

            return true;
        });
    }

    /**
     * Release a reservation if an order is cancelled or edited
     */
    async releaseReservation(variantId, warehouseId, quantity, orderId, userId = 1) {
        return await db.transaction(async () => {
            const summary = await this.getOrInitSummary(variantId, warehouseId, userId);

            if (summary.reserved_stock < quantity) {
                throw new Error(`Cannot release ${quantity} units: only ${summary.reserved_stock} reserved.`);
            }

            const newReserved = summary.reserved_stock - quantity;

            await db.run(
                `UPDATE inventory_summary 
                 SET reserved_stock = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [newReserved, userId, summary.id]
            );

            await db.run(
                `INSERT INTO inventory_ledger (
                    variant_id, warehouse_id, transaction_type, change_qty,
                    balance_current_before, balance_current_after,
                    balance_reserved_before, balance_reserved_after,
                    reference_type, reference_id, remarks, user_id
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    variantId, warehouseId, 'RESERVATION_RELEASE', -quantity,
                    summary.current_stock, summary.current_stock,
                    summary.reserved_stock, newReserved,
                    'order', String(orderId), 'Order reservation released', userId
                ]
            );

            return true;
        });
    }

    /**
     * Consume reserved stock when an order is Invoiced.
     * Implements FIFO batch matching.
     */
    async consumeOnInvoice(variantId, warehouseId, quantity, orderId, userId = 1) {
        return await db.transaction(async () => {
            const summary = await this.getOrInitSummary(variantId, warehouseId, userId);

            if (summary.current_stock < quantity || summary.reserved_stock < quantity) {
                throw new Error(`Insufficient stock elements to complete invoice consumption of ${quantity} units.`);
            }

            const newCurrent = summary.current_stock - quantity;
            const newReserved = summary.reserved_stock - quantity;

            // 1. Update Summary
            await db.run(
                `UPDATE inventory_summary 
                 SET current_stock = ?, reserved_stock = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [newCurrent, newReserved, userId, summary.id]
            );

            // 2. FIFO Batch Matching: Deduct remaining quantities from inspection-passed batches
            const batches = await db.all(
                `SELECT * FROM inventory_batches 
                 WHERE variant_id = ? AND warehouse_id = ? AND quantity_remaining > 0 AND inspection_status = 'PASSED'
                 ORDER BY procurement_date ASC, id ASC`,
                [variantId, warehouseId]
            );

            let remainingToDeduct = quantity;
            for (const batch of batches) {
                if (remainingToDeduct <= 0) break;

                const deductQty = Math.min(batch.quantity_remaining, remainingToDeduct);
                const updatedRemaining = batch.quantity_remaining - deductQty;

                await db.run(
                    `UPDATE inventory_batches 
                     SET quantity_remaining = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ?
                     WHERE id = ?`,
                    [updatedRemaining, userId, batch.id]
                );

                // Write consumption link to inventory ledger with batch_id reference
                await db.run(
                    `INSERT INTO inventory_ledger (
                        variant_id, warehouse_id, batch_id, transaction_type, change_qty,
                        balance_current_before, balance_current_after,
                        balance_reserved_before, balance_reserved_after,
                        reference_type, reference_id, remarks, user_id
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        variantId, warehouseId, batch.id, 'INVOICE_CONSUMPTION', -deductQty,
                        summary.current_stock - (quantity - remainingToDeduct), 
                        summary.current_stock - (quantity - remainingToDeduct) - deductQty,
                        summary.reserved_stock - (quantity - remainingToDeduct),
                        summary.reserved_stock - (quantity - remainingToDeduct) - deductQty,
                        'order', String(orderId), `FIFO batch consumption: ${batch.batch_number}`, userId
                    ]
                );

                remainingToDeduct -= deductQty;
            }

            if (remainingToDeduct > 0) {
                // If we ran out of passed batches but still have general stock (fallback)
                console.warn(`[InventoryService] FIFO matching fell short of batch inventory by ${remainingToDeduct} units. Logging fallback transaction.`);
                await db.run(
                    `INSERT INTO inventory_ledger (
                        variant_id, warehouse_id, transaction_type, change_qty,
                        balance_current_before, balance_current_after,
                        balance_reserved_before, balance_reserved_after,
                        reference_type, reference_id, remarks, user_id
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        variantId, warehouseId, 'INVOICE_CONSUMPTION', -remainingToDeduct,
                        newCurrent + remainingToDeduct, newCurrent,
                        newReserved + remainingToDeduct, newReserved,
                        'order', String(orderId), 'Fallback consumption without batch link', userId
                    ]
                );
            }

            // 3. Emit Domain Event
            await eventBus.publish('InventoryConsumed', {
                aggregateType: 'inventory',
                aggregateId: String(summary.id),
                payload: {
                    variantId,
                    warehouseId,
                    orderId,
                    quantityConsumed: quantity,
                    currentStock: newCurrent,
                    availableStock: newCurrent - newReserved
                },
                userId
            });

            // 4. Evaluate Threshold Alerts
            const finalAvailable = newCurrent - newReserved;
            if (finalAvailable <= 0) {
                await eventBus.publish('StockDepleted', {
                    aggregateType: 'inventory',
                    aggregateId: String(summary.id),
                    payload: { variantId, warehouseId },
                    userId
                });
            } else if (finalAvailable < summary.reorder_level) {
                await eventBus.publish('StockLow', {
                    aggregateType: 'inventory',
                    aggregateId: String(summary.id),
                    payload: { variantId, warehouseId, available: finalAvailable, reorderLevel: summary.reorder_level },
                    userId
                });
            }

            return true;
        });
    }

    /**
     * Receive new batch stock (Procurement receipt)
     */
    async receiveBatch({
        batchNumber, variantId, warehouseId, supplierName, procurementDate,
        unitPurchaseCost, quantityReceived, expiryDate, remarks = '', userId = 1
    }) {
        return await db.transaction(async () => {
            const summary = await this.getOrInitSummary(variantId, warehouseId, userId);

            // 1. Create procurement batch record
            const batchResult = await db.run(
                `INSERT INTO inventory_batches (
                    batch_number, variant_id, warehouse_id, supplier_name,
                    procurement_date, unit_purchase_cost, quantity_received,
                    quantity_remaining, merchant_quality_notes, inspection_status, expiry_date,
                    created_by, updated_by
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PASSED', ?, ?, ?)`,
                [
                    batchNumber, variantId, warehouseId, supplierName,
                    procurementDate || new Date().toISOString().split('T')[0],
                    unitPurchaseCost, quantityReceived, quantityReceived,
                    remarks, expiryDate || null, userId, userId
                ]
            );

            const batchId = batchResult.lastID;
            const newCurrent = summary.current_stock + quantityReceived;

            // 2. Update Inventory Summary
            await db.run(
                `UPDATE inventory_summary 
                 SET current_stock = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [newCurrent, userId, summary.id]
            );

            // 3. Log Ledger Transaction
            await db.run(
                `INSERT INTO inventory_ledger (
                    variant_id, warehouse_id, batch_id, transaction_type, change_qty,
                    balance_current_before, balance_current_after,
                    balance_reserved_before, balance_reserved_after,
                    reference_type, reference_id, remarks, user_id
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    variantId, warehouseId, batchId, 'PURCHASE_RECEIPT', quantityReceived,
                    summary.current_stock, newCurrent,
                    summary.reserved_stock, summary.reserved_stock,
                    'batch', String(batchId), `Batch received: ${batchNumber}`, userId
                ]
            );

            // 4. Emit Domain Event
            await eventBus.publish('BatchReceived', {
                aggregateType: 'inventory',
                aggregateId: String(summary.id),
                payload: {
                    batchId,
                    batchNumber,
                    variantId,
                    warehouseId,
                    quantityReceived,
                    currentStock: newCurrent
                },
                userId
            });

            return batchId;
        });
    }

    /**
     * Run physical count inventory audit adjustment
     */
    async adjustAudit(variantId, warehouseId, physicalCount, auditRemarks, userId = 1) {
        return await db.transaction(async () => {
            const summary = await this.getOrInitSummary(variantId, warehouseId, userId);
            const variance = physicalCount - summary.current_stock;

            if (variance === 0) return { success: true, message: 'No variance detected.' };

            const auditNumber = `AUD-${Date.now()}`;

            // 1. Insert physical count record
            await db.run(
                `INSERT INTO inventory_audits (
                    audit_number, variant_id, warehouse_id, physical_count,
                    system_quantity, variance, audit_remarks, adjusted_by
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    auditNumber, variantId, warehouseId, physicalCount,
                    summary.current_stock, variance, auditRemarks, userId
                ]
            );

            // 2. Update summary
            await db.run(
                `UPDATE inventory_summary 
                 SET current_stock = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [physicalCount, userId, summary.id]
            );

            // 3. Log into ledger
            await db.run(
                `INSERT INTO inventory_ledger (
                    variant_id, warehouse_id, transaction_type, change_qty,
                    balance_current_before, balance_current_after,
                    balance_reserved_before, balance_reserved_after,
                    remarks, user_id
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    variantId, warehouseId, 'STOCK_ADJUSTMENT', variance,
                    summary.current_stock, physicalCount,
                    summary.reserved_stock, summary.reserved_stock,
                    `Audit Adjustment: ${auditNumber} | ${auditRemarks}`, userId
                ]
            );

            // 4. Emit Event
            await eventBus.publish('InventoryAdjusted', {
                aggregateType: 'inventory',
                aggregateId: String(summary.id),
                payload: {
                    variantId,
                    warehouseId,
                    variance,
                    physicalCount
                },
                userId
            });

            return { success: true, variance };
        });
    }
}

const inventoryService = new InventoryService();
module.exports = inventoryService;
