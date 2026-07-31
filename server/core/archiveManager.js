/**
 * Archive Manager — Scheduled soft-archive processor
 * 
 * Reads archive_rules from DB and sets is_archived = 1, archived_at = NOW()
 * on records older than the configured threshold. Runs as a scheduled job.
 */
const db = require('../db');

class ArchiveManager {
    /**
     * Run archival for all active rules
     */
    async runAllRules() {
        try {
            const rules = await db.all(
                `SELECT * FROM archive_rules WHERE is_active = 1`
            );

            if (rules.length === 0) {
                console.log('[ArchiveManager] No active archive rules found.');
                return { processed: 0 };
            }

            let totalArchived = 0;

            for (const rule of rules) {
                const count = await this.executeRule(rule);
                totalArchived += count;
            }

            console.log(`[ArchiveManager] Archival complete. Total records archived: ${totalArchived}`);
            return { processed: totalArchived };
        } catch (err) {
            console.error('[ArchiveManager] Archive run failed:', err);
            throw err;
        }
    }

    /**
     * Execute a single archive rule against its target entity table
     */
    async executeRule(rule) {
        const { entity_type, archive_after_days } = rule;

        // Map entity types to their table names and date columns
        const entityMap = {
            'orders': { table: 'orders', dateCol: 'created_at', statusCol: 'status', terminalStates: ['CLOSED', 'CANCELLED', 'DELIVERED'] },
            'domain_events': { table: 'domain_events', dateCol: 'created_at', statusCol: null, terminalStates: null },
            'complaints': { table: 'complaints', dateCol: 'created_at', statusCol: 'status', terminalStates: ['CLOSED', 'RESOLVED'] },
            'reviews': { table: 'reviews', dateCol: 'created_at', statusCol: null, terminalStates: null },
            'inventory_batches': { table: 'inventory_batches', dateCol: 'created_at', statusCol: null, terminalStates: null },
            'audit_logs': { table: 'audit_logs', dateCol: 'created_at', statusCol: null, terminalStates: null }
        };

        const config = entityMap[entity_type];
        if (!config) {
            console.warn(`[ArchiveManager] Unknown entity type: ${entity_type}. Skipping.`);
            return 0;
        }

        try {
            let query;
            const params = [archive_after_days];

            if (config.statusCol && config.terminalStates) {
                // Only archive records that are in terminal states
                const placeholders = config.terminalStates.map(() => '?').join(', ');
                query = `
                    UPDATE ${config.table} 
                    SET is_archived = 1, archived_at = CURRENT_TIMESTAMP 
                    WHERE is_archived = 0 
                    AND ${config.dateCol} < datetime('now', '-' || ? || ' days')
                    AND ${config.statusCol} IN (${placeholders})
                `;
                params.push(...config.terminalStates);
            } else if (config.table === 'domain_events' || config.table === 'audit_logs') {
                // These tables don't have is_archived — delete old records instead
                query = `
                    DELETE FROM ${config.table} 
                    WHERE ${config.dateCol} < datetime('now', '-' || ? || ' days')
                `;
            } else {
                query = `
                    UPDATE ${config.table} 
                    SET is_archived = 1, archived_at = CURRENT_TIMESTAMP 
                    WHERE is_archived = 0 
                    AND ${config.dateCol} < datetime('now', '-' || ? || ' days')
                `;
            }

            const result = await db.run(query, params);
            const count = result.changes || 0;

            if (count > 0) {
                console.log(`[ArchiveManager] Archived ${count} records from ${config.table} (rule: ${entity_type}, threshold: ${archive_after_days} days)`);
            }

            return count;
        } catch (err) {
            console.error(`[ArchiveManager] Failed to archive ${entity_type}:`, err);
            return 0;
        }
    }

    /**
     * Run archival for a specific entity type
     */
    async runForEntity(entityType) {
        try {
            const rule = await db.get(
                `SELECT * FROM archive_rules WHERE entity_type = ? AND is_active = 1`,
                [entityType]
            );

            if (!rule) {
                throw new Error(`No active archive rule for entity: ${entityType}`);
            }

            const count = await this.executeRule(rule);
            return { entity_type: entityType, archived: count };
        } catch (err) {
            console.error(`[ArchiveManager] Failed to run for entity ${entityType}:`, err);
            throw err;
        }
    }
}

module.exports = new ArchiveManager();
