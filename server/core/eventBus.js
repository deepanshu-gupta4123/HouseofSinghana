const EventEmitter = require('events');
const db = require('../db');

class DomainEventBus extends EventEmitter {
    constructor() {
        super();
        // Handle error events to prevent Node crash if no handler is registered for 'error'
        this.on('error', (err) => {
            console.error('EventBus error:', err);
        });
    }

    /**
     * Emit a domain event, persist it to the database, and trigger local handlers.
     * @param {string} eventType e.g., 'OrderPlaced', 'InvoiceGenerated'
     * @param {object} params
     * @param {string} params.aggregateType e.g., 'order', 'product', 'customer'
     * @param {string|number} params.aggregateId The target entity ID
     * @param {object} params.payload Full event payload (JSON-serializable)
     * @param {number} [params.userId] The user ID who triggered this event
     */
    async publish(eventType, { aggregateType, aggregateId, payload, userId = null }) {
        console.log(`[EventBus] Publishing event: ${eventType} for ${aggregateType}#${aggregateId}`);

        const payloadStr = JSON.stringify(payload);

        try {
            // Persist the event to domain_events first
            const result = await db.run(
                `INSERT INTO domain_events (event_type, aggregate_type, aggregate_id, payload, emitted_by_user_id, processed)
                 VALUES (?, ?, ?, ?, ?, 0)`,
                [eventType, aggregateType, String(aggregateId), payloadStr, userId]
            );
            
            const eventId = result.lastID;

            // Trigger actual EventEmitter handlers.
            // Pass the persisted event ID and parameters to the handler.
            this.emit(eventType, {
                eventId,
                eventType,
                aggregateType,
                aggregateId,
                payload,
                userId,
                createdAt: new Date().toISOString()
            });

            // Mark event as processed in the database
            await db.run(`UPDATE domain_events SET processed = 1 WHERE id = ?`, [eventId]);

        } catch (err) {
            console.error(`[EventBus] Failed to persist/emit event ${eventType}:`, err);
            // Even if DB insert fails, we trigger local emit for recovery/routing (optional, but keep it robust)
            this.emit(eventType, {
                eventId: null,
                eventType,
                aggregateType,
                aggregateId,
                payload,
                userId,
                createdAt: new Date().toISOString()
            });
        }
    }

    /**
     * Register a subscriber listener. Alias for 'on'.
     */
    subscribe(eventType, handler) {
        this.on(eventType, handler);
    }
}

// Global singleton instance
const eventBus = new DomainEventBus();

module.exports = eventBus;
