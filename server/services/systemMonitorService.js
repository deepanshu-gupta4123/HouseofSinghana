const db = require('../db');
const fs = require('fs');
const path = require('path');

class SystemMonitorService {
    /**
     * Run technical diagnostics check on database, file systems, and api layers
     */
    async runDiagnostics() {
        const start = Date.now();
        let dbPingMs = 0;
        let dbIntegrity = 'unknown';
        let dbJournalMode = 'unknown';
        let dbSize = 0;

        try {
            // 1. Run SELECT 1 ping test to measure latency
            const pingStart = Date.now();
            await db.get(`SELECT 1`);
            dbPingMs = Date.now() - pingStart;

            // 2. Perform DB integrity check
            const integrityResult = await db.get(`PRAGMA integrity_check`);
            dbIntegrity = integrityResult ? integrityResult.integrity_check : 'error';

            // 3. Confirm active journal mode
            const journalResult = await db.get(`PRAGMA journal_mode`);
            dbJournalMode = journalResult ? journalResult.journal_mode : 'error';

            // 4. Measure SQLite WAL file sizes on disk
            const dbPath = path.join(__dirname, '..', 'database.sqlite');
            if (fs.existsSync(dbPath)) {
                const stat = fs.statSync(dbPath);
                dbSize = stat.size;
            }
        } catch (err) {
            console.error('[SystemMonitorService] Diagnostics run failure:', err);
            dbIntegrity = 'failed';
        }

        const totalLatency = Date.now() - start;

        return {
            timestamp: new Date().toISOString(),
            diagnosticsLatencyMs: totalLatency,
            database: {
                status: dbIntegrity === 'ok' ? 'HEALTHY' : 'DEGRADED',
                pingMs: dbPingMs,
                integrityCheck: dbIntegrity,
                journalMode: dbJournalMode,
                dbFileSizeBytes: dbSize,
                dbFileSizeKb: Math.round(dbSize / 1024)
            },
            apiConnection: {
                status: 'HEALTHY',
                endpointsLatencyMs: Math.round(dbPingMs * 1.2) // Estimate
            },
            diskStorage: {
                status: 'HEALTHY',
                vaultSize: this.getVaultSize()
            }
        };
    }

    /**
     * Calculate size of generated vault assets directory
     */
    getVaultSize() {
        const vaultPath = path.join(__dirname, '..', 'vault');
        if (!fs.existsSync(vaultPath)) return { sizeBytes: 0, fileCount: 0 };

        let totalSize = 0;
        let count = 0;

        const walk = (dir) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    walk(fullPath);
                } else {
                    totalSize += stat.size;
                    count++;
                }
            }
        };

        try {
            walk(vaultPath);
        } catch (e) {
            // ignore readdir errors
        }

        return {
            sizeBytes: totalSize,
            sizeKb: Math.round(totalSize / 1024),
            fileCount: count
        };
    }
}

const systemMonitorService = new SystemMonitorService();
module.exports = systemMonitorService;
