const db = require('../db');
const eventBus = require('../core/eventBus');
const workflowEngine = require('../core/workflowEngine');

/**
 * Customer: Submit a new complaint / ticket
 */
async function customerCreateTicket(req, res) {
    const { order_id, category, description, priority = 'MEDIUM' } = req.body;
    if (!description || !category) {
        return res.status(400).json({ error: 'Ticket category and description are required.' });
    }

    try {
        const ticketNumber = `TKT-${Date.now()}`;

        // 1. Calculate SLA expiry time based on priority
        let slaHours = 48; // Medium fallback
        if (priority === 'HIGH') slaHours = 24;
        if (priority === 'LOW') slaHours = 72;

        const slaExpiresAt = new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString();

        // 2. Write ticket to DB
        const result = await db.run(
            `INSERT INTO complaints (
                ticket_number, customer_id, order_id, category, priority, 
                description, status, sla_expires_at, created_by, updated_by
             ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)`,
            [
                ticketNumber, req.user.id, order_id || null, category, priority,
                description, slaExpiresAt, req.user.id, req.user.id
            ]
        );

        const newTicket = await db.get(`SELECT * FROM complaints WHERE id = ?`, [result.lastID]);

        // 3. Emit Domain Event
        await eventBus.publish('ComplaintRaised', {
            aggregateType: 'complaint',
            aggregateId: String(result.lastID),
            payload: newTicket,
            userId: req.user.id
        });

        res.status(201).json({
            success: true,
            message: 'Complaint logged successfully. The merchant operations team will review within SLA terms.',
            ticket: newTicket
        });

    } catch (err) {
        console.error('[Complaints] customerCreateTicket failed:', err);
        res.status(500).json({ error: 'Failed to submit complaint.' });
    }
}

/**
 * Merchant OS: List tickets sorted by SLA urgency
 */
async function listTickets(req, res) {
    try {
        const rows = await db.all(`
            SELECT c.*, cust.name as customer_name, cust.phone as customer_phone
            FROM complaints c
            JOIN customers cust ON c.customer_id = cust.id
            WHERE c.deleted_at IS NULL
            ORDER BY 
                CASE WHEN c.status = 'CLOSED' THEN 1 ELSE 0 END ASC,
                c.sla_expires_at ASC
        `);
        res.json(rows);
    } catch (err) {
        console.error('[Complaints] listTickets failed:', err);
        res.status(500).json({ error: 'Failed to fetch tickets.' });
    }
}

/**
 * Merchant OS: Get detailed ticket views
 */
async function getTicketDetails(req, res) {
    const { id } = req.params;
    try {
        const ticket = await db.get(`
            SELECT c.*, cust.name as customer_name, cust.email as customer_email, cust.phone as customer_phone
            FROM complaints c
            JOIN customers cust ON c.customer_id = cust.id
            WHERE c.id = ? AND c.deleted_at IS NULL
        `, [id]);

        if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

        // Fetch updates from audit logs or history
        ticket.history = await db.all(
            `SELECT * FROM audit_logs 
             WHERE entity_type = 'complaints' AND entity_id = ? 
             ORDER BY created_at ASC`,
            [id]
        );

        res.json(ticket);
    } catch (err) {
        console.error('[Complaints] getTicketDetails failed:', err);
        res.status(500).json({ error: 'Failed to retrieve ticket details.' });
    }
}

/**
 * Merchant OS: Execute workflow transitions on tickets
 */
async function transitionTicket(req, res) {
    const { id } = req.params;
    const { status, remarks } = req.body; // e.g. 'ASSIGNED', 'RESOLVED', 'CLOSED'

    if (!status) return res.status(400).json({ error: 'Target status state is required.' });

    try {
        const ticket = await db.get(`SELECT * FROM complaints WHERE id = ? AND deleted_at IS NULL`, [id]);
        if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

        // 1. Run workflow transition rule check
        const check = await workflowEngine.transition(
            'complaint_lifecycle',
            id,
            ticket.status,
            status,
            req.user
        );

        // 2. Perform DB update
        await db.run(
            `UPDATE complaints 
             SET status = ?, resolution_notes = COALESCE(?, resolution_notes), updated_by = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [status, remarks || null, req.user.id, id]
        );

        const updated = await db.get(`SELECT * FROM complaints WHERE id = ?`, [id]);

        // 3. Emit workflow event
        await eventBus.publish(check.event, {
            aggregateType: 'complaint',
            aggregateId: String(id),
            payload: {
                ticket: updated,
                transitionRemarks: remarks
            },
            userId: req.user.id
        });

        res.json({
            message: `Ticket successfully transitioned to ${status}.`,
            ticket: updated
        });

    } catch (err) {
        console.error('[Complaints] transitionTicket failed:', err.message);
        res.status(400).json({ error: err.message });
    }
}

module.exports = {
    customerCreateTicket,
    listTickets,
    getTicketDetails,
    transitionTicket
};
