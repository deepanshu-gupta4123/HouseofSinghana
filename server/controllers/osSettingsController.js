/**
 * OS Settings Controller — Workflow Config, Automation Rules, Templates, Domain Events
 * 
 * Provides configuration management for:
 * - Workflow definitions (order/complaint/return lifecycles)
 * - Automation rules (trigger-condition-action)
 * - Document templates (Handlebars HTML)
 * - Domain events (debugging and replay)
 * - System health, jobs, and archive management
 */
const db = require('../db');
const archiveManager = require('../core/archiveManager');
const eventBus = require('../core/eventBus');
const systemMonitorService = require('../services/systemMonitorService');

// ═══ WORKFLOW DEFINITIONS ═══

async function listWorkflows(req, res) {
    try {
        const workflows = await db.all(`SELECT * FROM workflow_definitions ORDER BY workflow_key`);
        for (const w of workflows) {
            try { w.definition = JSON.parse(w.definition); } catch (e) { /* keep as string */ }
        }
        res.json(workflows);
    } catch (err) {
        console.error('[OS:Settings] listWorkflows failed:', err);
        res.status(500).json({ error: 'Failed to fetch workflows.' });
    }
}

async function getWorkflow(req, res) {
    try {
        const workflow = await db.get(
            `SELECT * FROM workflow_definitions WHERE workflow_key = ?`,
            [req.params.key]
        );
        if (!workflow) return res.status(404).json({ error: 'Workflow not found.' });

        try { workflow.definition = JSON.parse(workflow.definition); } catch (e) { /* keep as string */ }
        res.json(workflow);
    } catch (err) {
        console.error('[OS:Settings] getWorkflow failed:', err);
        res.status(500).json({ error: 'Failed to fetch workflow.' });
    }
}

async function updateWorkflow(req, res) {
    try {
        const { definition } = req.body;
        if (!definition) return res.status(400).json({ error: 'Definition is required.' });

        const defJson = typeof definition === 'string' ? definition : JSON.stringify(definition);

        await db.run(
            `UPDATE workflow_definitions SET definition = ?, updated_at = CURRENT_TIMESTAMP WHERE workflow_key = ?`,
            [defJson, req.params.key]
        );

        res.json({ success: true, message: 'Workflow updated.' });
    } catch (err) {
        console.error('[OS:Settings] updateWorkflow failed:', err);
        res.status(500).json({ error: 'Failed to update workflow.' });
    }
}

// ═══ AUTOMATION RULES ═══

async function listAutomations(req, res) {
    try {
        const rules = await db.all(`SELECT * FROM automation_rules ORDER BY priority DESC, created_at DESC`);
        for (const r of rules) {
            try { r.conditions = JSON.parse(r.conditions); } catch (e) { /* keep as string */ }
            try { r.actions = JSON.parse(r.actions); } catch (e) { /* keep as string */ }
        }
        res.json(rules);
    } catch (err) {
        console.error('[OS:Settings] listAutomations failed:', err);
        res.status(500).json({ error: 'Failed to fetch automation rules.' });
    }
}

async function createAutomation(req, res) {
    const { name, description, trigger_event, conditions, actions, priority } = req.body;

    if (!name || !trigger_event || !actions) {
        return res.status(400).json({ error: 'name, trigger_event, and actions are required.' });
    }

    try {
        const result = await db.run(`
            INSERT INTO automation_rules (name, description, trigger_event, conditions, actions, priority, is_active, created_by)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        `, [
            name,
            description || '',
            trigger_event,
            typeof conditions === 'string' ? conditions : JSON.stringify(conditions || {}),
            typeof actions === 'string' ? actions : JSON.stringify(actions),
            priority || 0,
            req.user.id
        ]);

        res.status(201).json({ success: true, id: result.lastID });
    } catch (err) {
        console.error('[OS:Settings] createAutomation failed:', err);
        res.status(500).json({ error: 'Failed to create automation rule.' });
    }
}

async function updateAutomation(req, res) {
    const { id } = req.params;
    const { name, description, trigger_event, conditions, actions, priority } = req.body;

    try {
        await db.run(`
            UPDATE automation_rules SET
                name = COALESCE(?, name),
                description = COALESCE(?, description),
                trigger_event = COALESCE(?, trigger_event),
                conditions = COALESCE(?, conditions),
                actions = COALESCE(?, actions),
                priority = COALESCE(?, priority),
                updated_by = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            name, description, trigger_event,
            conditions ? (typeof conditions === 'string' ? conditions : JSON.stringify(conditions)) : null,
            actions ? (typeof actions === 'string' ? actions : JSON.stringify(actions)) : null,
            priority,
            req.user.id, id
        ]);

        res.json({ success: true, message: 'Automation rule updated.' });
    } catch (err) {
        console.error('[OS:Settings] updateAutomation failed:', err);
        res.status(500).json({ error: 'Failed to update automation rule.' });
    }
}

async function toggleAutomation(req, res) {
    try {
        const rule = await db.get(`SELECT is_active FROM automation_rules WHERE id = ?`, [req.params.id]);
        if (!rule) return res.status(404).json({ error: 'Rule not found.' });

        const newState = rule.is_active ? 0 : 1;
        await db.run(
            `UPDATE automation_rules SET is_active = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [newState, req.user.id, req.params.id]
        );

        res.json({ success: true, is_active: newState, message: `Rule ${newState ? 'enabled' : 'disabled'}.` });
    } catch (err) {
        console.error('[OS:Settings] toggleAutomation failed:', err);
        res.status(500).json({ error: 'Failed to toggle automation rule.' });
    }
}

// ═══ DOCUMENT TEMPLATES ═══

async function listTemplates(req, res) {
    try {
        const templates = await db.all(`SELECT id, template_key, name, paper_size, version, is_active, updated_at FROM document_templates ORDER BY template_key`);
        res.json(templates);
    } catch (err) {
        console.error('[OS:Settings] listTemplates failed:', err);
        res.status(500).json({ error: 'Failed to fetch templates.' });
    }
}

async function getTemplate(req, res) {
    try {
        const template = await db.get(
            `SELECT * FROM document_templates WHERE template_key = ?`,
            [req.params.key]
        );
        if (!template) return res.status(404).json({ error: 'Template not found.' });
        res.json(template);
    } catch (err) {
        console.error('[OS:Settings] getTemplate failed:', err);
        res.status(500).json({ error: 'Failed to fetch template.' });
    }
}

async function updateTemplate(req, res) {
    const { template_html, template_css, paper_size } = req.body;

    try {
        await db.run(`
            UPDATE document_templates SET
                template_html = COALESCE(?, template_html),
                template_css = COALESCE(?, template_css),
                paper_size = COALESCE(?, paper_size),
                version = version + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE template_key = ?
        `, [template_html, template_css, paper_size, req.params.key]);

        res.json({ success: true, message: 'Template updated.' });
    } catch (err) {
        console.error('[OS:Settings] updateTemplate failed:', err);
        res.status(500).json({ error: 'Failed to update template.' });
    }
}

async function previewTemplate(req, res) {
    try {
        const templateEngine = require('../core/templateEngine');
        const html = await templateEngine.render(req.params.key, {
            order_number: 'HOS-PREVIEW-001',
            customer_name: 'Preview Customer',
            total_amount: '₹2,560.00',
            items: [
                { name: 'Chilli Powder — Everyday Blend', sku: 'VAR-CHIL-EVERY', qty: 2, unit_price: '₹860', total: '₹1,720' },
                { name: 'Turmeric — Standard Curcumin', sku: 'VAR-TURM-STD', qty: 1, unit_price: '₹680', total: '₹680' }
            ],
            date: new Date().toLocaleDateString('en-IN'),
            shipping_address: '14, Station Road, Singhana, Rajasthan 333515'
        });
        res.send(html);
    } catch (err) {
        console.error('[OS:Settings] previewTemplate failed:', err);
        res.status(500).json({ error: 'Failed to preview template.' });
    }
}

// ═══ DOMAIN EVENTS (Debug & Replay) ═══

async function listDomainEvents(req, res) {
    try {
        const { type, aggregate_type, aggregate_id, limit = 50, offset = 0 } = req.query;

        let query = `SELECT * FROM domain_events WHERE 1=1`;
        const params = [];

        if (type) {
            query += ` AND event_type = ?`;
            params.push(type);
        }
        if (aggregate_type) {
            query += ` AND aggregate_type = ?`;
            params.push(aggregate_type);
        }
        if (aggregate_id) {
            query += ` AND aggregate_id = ?`;
            params.push(aggregate_id);
        }

        query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const events = await db.all(query, params);

        for (const e of events) {
            try { e.payload = JSON.parse(e.payload); } catch (err) { /* keep as string */ }
        }

        const countResult = await db.get(`SELECT COUNT(*) as total FROM domain_events`);
        res.json({ data: events, total: countResult.total });
    } catch (err) {
        console.error('[OS:Settings] listDomainEvents failed:', err);
        res.status(500).json({ error: 'Failed to fetch domain events.' });
    }
}

async function replayEvent(req, res) {
    try {
        const event = await db.get(`SELECT * FROM domain_events WHERE id = ?`, [req.params.id]);
        if (!event) return res.status(404).json({ error: 'Event not found.' });

        let payload;
        try { payload = JSON.parse(event.payload); } catch (e) { payload = event.payload; }

        // Re-emit the event through the bus
        await eventBus.emit(event.event_type, payload);

        console.log(`[OS:Settings] Replayed event #${event.id} (${event.event_type})`);
        res.json({ success: true, message: `Event ${event.event_type} replayed.` });
    } catch (err) {
        console.error('[OS:Settings] replayEvent failed:', err);
        res.status(500).json({ error: 'Failed to replay event.' });
    }
}

// ═══ SYSTEM HEALTH & ADMIN ═══

async function getSystemHealth(req, res) {
    try {
        const health = await systemMonitorService.runAllChecks();
        res.json(health);
    } catch (err) {
        console.error('[OS:System] getSystemHealth failed:', err);
        res.status(500).json({ error: 'Failed to fetch system health.' });
    }
}

async function getScheduledJobs(req, res) {
    try {
        const jobs = await db.all(`SELECT * FROM scheduled_jobs ORDER BY next_run_at ASC`);
        res.json(jobs);
    } catch (err) {
        console.error('[OS:System] getScheduledJobs failed:', err);
        res.status(500).json({ error: 'Failed to fetch scheduled jobs.' });
    }
}

async function triggerJob(req, res) {
    try {
        const job = await db.get(`SELECT * FROM scheduled_jobs WHERE id = ?`, [req.params.id]);
        if (!job) return res.status(404).json({ error: 'Job not found.' });

        // Update last_run
        await db.run(
            `UPDATE scheduled_jobs SET last_run_at = CURRENT_TIMESTAMP, last_status = 'RUNNING' WHERE id = ?`,
            [req.params.id]
        );

        // Execute based on job_key
        let result = {};
        switch (job.job_key) {
            case 'nightly_closing_report':
                const closingReportService = require('../services/closingReportService');
                result = await closingReportService.generateClosingReport();
                break;
            case 'archive_old_records':
                result = await archiveManager.runAllRules();
                break;
            case 'recalculate_segments':
                const segmentationService = require('../services/segmentationService');
                result = await segmentationService.recalculateAll();
                break;
            default:
                result = { message: `Job ${job.job_key} triggered (mock execution).` };
        }

        await db.run(
            `UPDATE scheduled_jobs SET last_status = 'SUCCESS' WHERE id = ?`,
            [req.params.id]
        );

        res.json({ success: true, job_key: job.job_key, result });
    } catch (err) {
        console.error('[OS:System] triggerJob failed:', err);
        res.status(500).json({ error: 'Failed to trigger job.' });
    }
}

async function getStorageStats(req, res) {
    try {
        const fs = require('fs');
        const path = require('path');

        // DB file size
        const dbPath = path.join(__dirname, '..', 'database.sqlite');
        let dbSize = 0;
        try {
            const stats = fs.statSync(dbPath);
            dbSize = stats.size;
        } catch (e) { /* file not found */ }

        // Count uploads
        const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
        let uploadSize = 0;
        let uploadCount = 0;
        try {
            const walkDir = (dir) => {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        walkDir(fullPath);
                    } else {
                        uploadSize += fs.statSync(fullPath).size;
                        uploadCount++;
                    }
                }
            };
            walkDir(uploadsDir);
        } catch (e) { /* directory not found */ }

        // Document vault count
        const vaultCount = await db.get(`SELECT COUNT(*) as count FROM document_vault`);

        // Table row counts
        const tables = ['orders', 'products', 'customers', 'inventory_batches', 'complaints', 'reviews', 'domain_events', 'audit_logs'];
        const tableCounts = {};
        for (const table of tables) {
            try {
                const result = await db.get(`SELECT COUNT(*) as count FROM ${table}`);
                tableCounts[table] = result.count;
            } catch (e) {
                tableCounts[table] = 0;
            }
        }

        res.json({
            database: {
                size_bytes: dbSize,
                size_mb: (dbSize / (1024 * 1024)).toFixed(2)
            },
            uploads: {
                total_files: uploadCount,
                size_bytes: uploadSize,
                size_mb: (uploadSize / (1024 * 1024)).toFixed(2)
            },
            document_vault: {
                total_documents: vaultCount ? vaultCount.count : 0
            },
            table_row_counts: tableCounts
        });
    } catch (err) {
        console.error('[OS:System] getStorageStats failed:', err);
        res.status(500).json({ error: 'Failed to fetch storage stats.' });
    }
}

async function triggerArchive(req, res) {
    try {
        const { entity_type } = req.body;
        let result;

        if (entity_type) {
            result = await archiveManager.runForEntity(entity_type);
        } else {
            result = await archiveManager.runAllRules();
        }

        res.json({ success: true, result });
    } catch (err) {
        console.error('[OS:System] triggerArchive failed:', err);
        res.status(500).json({ error: err.message || 'Failed to run archive.' });
    }
}

module.exports = {
    // Workflows
    listWorkflows,
    getWorkflow,
    updateWorkflow,
    // Automations
    listAutomations,
    createAutomation,
    updateAutomation,
    toggleAutomation,
    // Templates
    listTemplates,
    getTemplate,
    updateTemplate,
    previewTemplate,
    // Domain Events
    listDomainEvents,
    replayEvent,
    // System
    getSystemHealth,
    getScheduledJobs,
    triggerJob,
    getStorageStats,
    triggerArchive
};
