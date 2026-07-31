const db = require('../db');
const eventBus = require('./eventBus');

/**
 * Workflow Engine State Machine Helper
 */
class WorkflowEngine {
    /**
     * Get the parsed JSON definition of a workflow from DB
     */
    async getDefinition(workflowKey) {
        const row = await db.get(
            `SELECT definition_json FROM workflow_definitions WHERE workflow_key = ? AND is_active = 1`,
            [workflowKey]
        );
        if (!row) {
            throw new Error(`Active workflow definition not found for key: ${workflowKey}`);
        }
        return JSON.parse(row.definition_json);
    }

    /**
     * Validate and execute a state transition
     * @param {string} workflowKey e.g. 'order_lifecycle'
     * @param {string|number} entityId The ID of the target record (e.g. order_id)
     * @param {string} currentState The current status of the record
     * @param {string} targetState The target status
     * @param {object} user The user executing this transition (contains id, role_id, email, etc.)
     * @param {object} [additionalData] Extra properties to embed in the domain event payload
     */
    async transition(workflowKey, entityId, currentState, targetState, user, additionalData = {}) {
        console.log(`[WorkflowEngine] Checking transition: ${workflowKey} | Entity #${entityId} | ${currentState} -> ${targetState}`);

        const definition = await this.getDefinition(workflowKey);

        // 1. Find if transition is defined
        const transition = definition.transitions.find(
            t => t.from === currentState && t.to === targetState
        );

        if (!transition) {
            throw new Error(`Invalid state transition from "${currentState}" to "${targetState}" in workflow "${workflowKey}".`);
        }

        // 2. Enforce Role Privileges
        const userRole = user.role_id;
        const isAllowed = transition.roles.includes(userRole) || userRole === 'super_admin';

        if (!isAllowed) {
            throw new Error(`Role "${userRole}" is not authorized to transition "${currentState}" to "${targetState}" in workflow "${workflowKey}".`);
        }

        // 3. Execute automatic actions linked to the transition
        // We will define these actions in our orderService/inventoryService as handlers.
        // For now, the transition method returns the details of what auto_actions and event should fire.
        console.log(`[WorkflowEngine] Transition authorized. Event to emit: ${transition.event}. Auto actions:`, transition.auto_actions || []);

        // 4. Return transition specifications
        return {
            event: transition.event,
            autoActions: transition.auto_actions || [],
            metadata: {
                workflowKey,
                entityId,
                fromState: currentState,
                toState: targetState,
                transitionEvent: transition.event,
                executedBy: user.id,
                executedByName: user.name,
                roleId: userRole
            }
        };
    }
}

const workflowEngine = new WorkflowEngine();
module.exports = workflowEngine;
