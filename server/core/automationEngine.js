const db = require('../db');
const eventBus = require('./eventBus');

class AutomationEngine {
    constructor() {
        // Subscribe the engine to all common events or dynamically bind them on boot.
        // For Node's EventEmitter, we can subscribe to general event handlers.
    }

    /**
     * Start listening to relevant events defined in active automation rules
     */
    async initialize() {
        console.log('[AutomationEngine] Initializing rules engine...');

        // Fetch all active trigger events to register event bus hooks
        const rules = await db.all(`SELECT DISTINCT trigger_event FROM automation_rules WHERE is_active = 1`);
        
        for (const rule of rules) {
            const eventType = rule.trigger_event;
            console.log(`[AutomationEngine] Listening for automation trigger: ${eventType}`);
            
            eventBus.subscribe(eventType, async (eventData) => {
                try {
                    await this.evaluateRules(eventType, eventData);
                } catch (err) {
                    console.error(`[AutomationEngine] Error executing rules for event ${eventType}:`, err);
                }
            });
        }
    }

    /**
     * Evaluate rules matching a triggered event
     */
    async evaluateRules(eventType, eventData) {
        const rules = await db.all(
            `SELECT * FROM automation_rules WHERE trigger_event = ? AND is_active = 1 ORDER BY priority DESC`,
            [eventType]
        );

        for (const rule of rules) {
            let condition;
            try {
                condition = JSON.parse(rule.condition_json);
            } catch (err) {
                console.error(`[AutomationEngine] Invalid JSON condition in rule #${rule.id}`, err);
                continue;
            }

            const isMatched = this.checkCondition(condition, eventData.payload);

            if (isMatched) {
                console.log(`[AutomationEngine] Rule "${rule.name}" matches. Executing action: ${rule.action_type}`);
                await this.executeAction(rule, eventData);
            }
        }
    }

    /**
     * Check if a condition holds against payload data
     */
    checkCondition(condition, payload) {
        if (!condition || Object.keys(condition).length === 0) return true; // Empty condition matches automatically

        const { field, operator, value } = condition;
        
        // Retrieve nested properties if dot notation is used (e.g., 'customer.segment')
        const payloadVal = this.getNestedValue(payload, field);
        
        // If the value to compare against is a field in the payload, get its value.
        // Otherwise, use it as a literal.
        let compareVal = value;
        if (typeof value === 'string' && value.startsWith('payload:')) {
            compareVal = this.getNestedValue(payload, value.replace('payload:', ''));
        }

        switch (operator) {
            case '==':
            case 'equals':
                return payloadVal == compareVal;
            case '!=':
            case 'notequals':
                return payloadVal != compareVal;
            case '>':
                return Number(payloadVal) > Number(compareVal);
            case '<':
                return Number(payloadVal) < Number(compareVal);
            case '>=':
                return Number(payloadVal) >= Number(compareVal);
            case '<=':
                return Number(payloadVal) <= Number(compareVal);
            case 'contains':
                return String(payloadVal).includes(compareVal);
            case 'in':
                return Array.isArray(compareVal) && compareVal.includes(payloadVal);
            default:
                console.warn(`[AutomationEngine] Unsupported operator: ${operator}`);
                return false;
        }
    }

    /**
     * Retrieve nested object properties (e.g. 'address.city' from {address: {city: 'Jaipur'}})
     */
    getNestedValue(obj, path) {
        if (!obj || !path) return undefined;
        return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined) ? acc[part] : undefined, obj);
    }

    /**
     * Execute action type
     */
    async executeAction(rule, eventData) {
        let config;
        try {
            config = JSON.parse(rule.action_config);
        } catch (err) {
            console.error(`[AutomationEngine] Invalid action config in rule #${rule.id}`, err);
            return;
        }

        const { action_type } = rule;

        if (action_type === 'SEND_NOTIFICATION') {
            const { channel, template, title, message, recipients } = config;
            
            // Format message variables if placeholders are used
            let formattedMsg = message;
            if (message && eventData.payload) {
                // simple replacement template variable interpolation
                Object.keys(eventData.payload).forEach(key => {
                    const val = eventData.payload[key];
                    formattedMsg = formattedMsg.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val));
                });
            }

            // Write notification entries to DB
            for (const rec of recipients) {
                await db.run(
                    `INSERT INTO notifications (type, channel, title, message, status) VALUES (?, ?, ?, ?, 'PENDING')`,
                    ['SYSTEM', channel || 'INTERNAL', title || rule.name, formattedMsg, 'PENDING']
                );
            }
            console.log(`[AutomationEngine] Notifications queued successfully.`);
        } else if (action_type === 'CREATE_APPROVAL') {
            const { request_type, entity_type, details_template } = config;
            // Insert request into approvals
            await db.run(
                `INSERT INTO approval_requests (request_type, entity_type, entity_id, details, requested_by)
                 VALUES (?, ?, ?, ?, ?)`,
                [request_type || 'SYSTEM_TRIGGERED', entity_type || rule.trigger_event, String(eventData.aggregateId), JSON.stringify(eventData.payload), 1]
            );
            console.log(`[AutomationEngine] Approval request queued for approval workflow.`);
        } else {
            console.warn(`[AutomationEngine] Action type "${action_type}" not implemented.`);
        }
    }
}

const automationEngine = new AutomationEngine();
module.exports = automationEngine;
