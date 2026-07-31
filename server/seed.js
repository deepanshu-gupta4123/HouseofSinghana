const db = require('./db');
const { initSchema } = require('./dbInit');
const bcrypt = require('bcrypt');

async function runSeed() {
    // 1. Initialize schema
    await initSchema();

    console.log('Seeding initial data...');

    // 2. Seed Roles
    const roles = [
        { id: 'super_admin', name: 'Super Admin', description: 'Access to everything, including system configuration and user management.' },
        { id: 'merchant', name: 'Merchant / Owner', description: 'Full operational control over orders, products, inventory, customer relationships.' },
        { id: 'ops_manager', name: 'Operations Manager', description: 'Manages fulfilment pipeline, stock receipt, warehouse locations, and support tickets.' },
        { id: 'dispatch_exec', name: 'Dispatch Executive', description: 'Assigned orders dispatch operations, labels printing, tracking updates.' },
        { id: 'packing_staff', name: 'Packing Staff', description: 'Processes order packaging items selection, prints packing slips.' },
        { id: 'customer_support', name: 'Customer Support', description: 'Manages complaints, customer details, review moderation.' },
        { id: 'accountant', name: 'Accountant', description: 'Accesses reconciliation dashboard, financial exports, revenue KPIs.' },
        { id: 'marketing', name: 'Marketing Manager', description: 'Manages coupons, customer segments, wishlists, campaigns.' }
    ];

    for (const role of roles) {
        await db.run(
            `INSERT OR IGNORE INTO roles (id, name, description) VALUES (?, ?, ?)`,
            [role.id, role.name, role.description]
        );
    }

    // 3. Seed Permissions
    const permissions = [
        // Format: { id: 'orders:read', module: 'orders', action: 'read', description: '...' }
        { id: 'dashboard:read', module: 'dashboard', action: 'read', description: 'View business health metrics.' },
        { id: 'orders:read', module: 'orders', action: 'read', description: 'View order lists and details.' },
        { id: 'orders:write', module: 'orders', action: 'write', description: 'Create and update orders.' },
        { id: 'orders:dispatch', module: 'orders', action: 'dispatch', description: 'Mark orders as dispatched.' },
        { id: 'orders:cancel', module: 'orders', action: 'cancel', description: 'Cancel active orders.' },
        { id: 'orders:export', module: 'orders', action: 'export', description: 'Export orders list to CSV.' },
        { id: 'orders:bulk_action', module: 'orders', action: 'bulk_action', description: 'Run bulk status changes.' },
        { id: 'packing:read', module: 'packing', action: 'read', description: 'View active packing queue.' },
        { id: 'packing:pack', module: 'packing', action: 'pack', description: 'Mark order as packed.' },
        { id: 'packing:print_slip', module: 'packing', action: 'print_slip', description: 'Print packing slips.' },
        { id: 'fulfilment:read', module: 'fulfilment', action: 'read', description: 'View active dispatch pipeline.' },
        { id: 'fulfilment:dispatch', module: 'fulfilment', action: 'dispatch', description: 'Assign couriers and tracking.' },
        { id: 'fulfilment:update_tracking', module: 'fulfilment', action: 'update_tracking', description: 'Edit shipping tracking info.' },
        { id: 'products:read', module: 'products', action: 'read', description: 'Browse product catalogue.' },
        { id: 'products:write', module: 'products', action: 'write', description: 'Create or edit products and variants.' },
        { id: 'products:archive', module: 'products', action: 'archive', description: 'Archive products from store.' },
        { id: 'inventory:read', module: 'inventory', action: 'read', description: 'View perpetual inventory balances.' },
        { id: 'inventory:receive', module: 'inventory', action: 'receive', description: 'Receive incoming stock batches.' },
        { id: 'inventory:audit', module: 'inventory', action: 'audit', description: 'Submit physical count audits.' },
        { id: 'inventory:adjust', module: 'inventory', action: 'adjust', description: 'Manually adjust ledger stock levels.' },
        { id: 'customers:read', module: 'customers', action: 'read', description: 'View customer records.' },
        { id: 'customers:write', module: 'customers', action: 'write', description: 'Add or edit customer profiles.' },
        { id: 'customers:export', module: 'customers', action: 'export', description: 'Export CRM database.' },
        { id: 'customers:segment', module: 'customers', action: 'segment', description: 'Recalculate customer segments.' },
        { id: 'complaints:read', module: 'complaints', action: 'read', description: 'View customer complaints.' },
        { id: 'complaints:write', module: 'complaints', action: 'write', description: 'Resolve, assign support tickets.' },
        { id: 'reviews:read', module: 'reviews', action: 'read', description: 'View reviews list.' },
        { id: 'reviews:moderate', module: 'reviews', action: 'moderate', description: 'Approve, hide, spam, archive reviews.' },
        { id: 'reviews:reply', module: 'reviews', action: 'reply', description: 'Submit official merchant responses.' },
        { id: 'analytics:read', module: 'analytics', action: 'read', description: 'View OLAP charts and summaries.' },
        { id: 'analytics:export', module: 'analytics', action: 'export', description: 'Export analytical trends.' },
        { id: 'reports:read', module: 'reports', action: 'read', description: 'View Closing and Reconciliation reports.' },
        { id: 'reports:generate', module: 'reports', action: 'generate', description: 'Generate nightly closing sheets.' },
        { id: 'reports:export', module: 'reports', action: 'export', description: 'Download CSV reports.' },
        { id: 'users:read', module: 'users', action: 'read', description: 'View internal users directory.' },
        { id: 'users:write', module: 'users', action: 'write', description: 'Add/Deactivate users.' },
        { id: 'users:roles', module: 'users', action: 'roles', description: 'Change user roles and privileges.' },
        { id: 'audit:read', module: 'audit', action: 'read', description: 'Inspect system mutation audit logs.' },
        { id: 'notifications:read', module: 'notifications', action: 'read', description: 'View notification inbox.' },
        { id: 'notifications:configure', module: 'notifications', action: 'configure', description: 'Update notification setups.' },
        { id: 'coupons:read', module: 'coupons', action: 'read', description: 'Browse active marketing coupons.' },
        { id: 'coupons:write', module: 'coupons', action: 'write', description: 'Create and update discount rules.' },
        { id: 'settings:read', module: 'settings', action: 'read', description: 'View system settings configurations.' },
        { id: 'settings:write', module: 'settings', action: 'write', description: 'Modify tax rules, shipping rules.' },
        { id: 'system:health', module: 'system', action: 'health', description: 'View Technical health checks.' },
        { id: 'system:jobs', module: 'system', action: 'jobs', description: 'Trigger or configure cron jobs.' },
        { id: 'system:archive', module: 'system', action: 'archive', description: 'Trigger manual archival processes.' },
        { id: 'workflows:read', module: 'workflows', action: 'read', description: 'Inspect workflow paths.' },
        { id: 'workflows:configure', module: 'workflows', action: 'configure', description: 'Modify lifecycle JSON states.' },
        { id: 'automations:read', module: 'automations', action: 'read', description: 'Inspect trigger rules.' },
        { id: 'automations:write', module: 'automations', action: 'write', description: 'Create or toggle triggers.' },
        { id: 'templates:read', module: 'templates', action: 'read', description: 'Inspect print templates.' },
        { id: 'templates:write', module: 'templates', action: 'write', description: 'Modify template source HTML.' }
    ];

    for (const perm of permissions) {
        await db.run(
            `INSERT OR IGNORE INTO permissions (id, module, action, description) VALUES (?, ?, ?, ?)`,
            [perm.id, perm.module, perm.action, perm.description]
        );
    }

    // 4. Map Role Permissions (Seed default matrices)
    // Super Admin gets all permissions
    for (const perm of permissions) {
        await db.run(
            `INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
            ['super_admin', perm.id]
        );
    }

    // Merchant Permissions
    const merchantPerms = permissions.filter(p => p.module !== 'users' && p.module !== 'system' && p.module !== 'workflows' && p.module !== 'automations' && p.module !== 'templates');
    for (const perm of merchantPerms) {
        await db.run(
            `INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
            ['merchant', perm.id]
        );
    }

    // Operations Manager Permissions
    const opsPerms = permissions.filter(p => ['dashboard', 'orders', 'packing', 'fulfilment', 'inventory', 'complaints', 'notifications'].includes(p.module));
    for (const perm of opsPerms) {
        await db.run(
            `INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
            ['ops_manager', perm.id]
        );
    }

    // Packing Staff Permissions
    const packPerms = permissions.filter(p => ['packing'].includes(p.module) || p.id === 'orders:read');
    for (const perm of packPerms) {
        await db.run(
            `INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
            ['packing_staff', perm.id]
        );
    }

    // Dispatch Executive Permissions
    const dispatchPerms = permissions.filter(p => ['fulfilment'].includes(p.module) || p.id === 'orders:read' || p.id === 'orders:dispatch');
    for (const perm of dispatchPerms) {
        await db.run(
            `INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
            ['dispatch_exec', perm.id]
        );
    }

    // 5. Seed default Super Admin User
    const adminEmail = 'admin@houseofsinghana.com';
    const passwordHash = await bcrypt.hash('superadmin123', 10);
    await db.run(
        `INSERT OR IGNORE INTO users (name, email, password_hash, role_id, is_active, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
        ['Super Admin', adminEmail, passwordHash, 'super_admin', 1, 1]
    );

    // 6. Seed default Warehouse
    await db.run(
        `INSERT OR IGNORE INTO warehouses (code, name, address, city, state, pincode, is_default, is_active, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['WH-SINGHANA-MAIN', 'Singhana Main Hub', 'Plot 41-A, Mandi Industrial Area', 'Jaipur', 'Rajasthan', '302012', 1, 1, 1]
    );

    // 7. Seed Default Feature Flags
    const flags = [
        { id: 'module_gift_orders', name: 'Gift Orders', module: 'orders', description: 'Enable gifting package option, message printing, and price-hiding on invoices.', is_enabled: 1 },
        { id: 'module_referrals', name: 'Referral Engine', module: 'marketing', description: 'Customer-to-friend automated coupon referral system.', is_enabled: 1 },
        { id: 'module_abandoned_cart', name: 'Abandoned Cart Tracker', module: 'marketing', description: 'Automated logging and SMS/WhatsApp follow-ups for idle checkout checkouts.', is_enabled: 1 },
        { id: 'module_reviews', name: 'Product Reviews CMS', module: 'support', description: 'Customer feedback collection and official reply threads.', is_enabled: 1 },
        { id: 'module_complaints', name: 'Complaints Resolution Ticket Portal', module: 'support', description: 'Dedicated SLA-backed operational issue tracker.', is_enabled: 1 }
    ];

    for (const flag of flags) {
        await db.run(
            `INSERT OR IGNORE INTO feature_flags (id, name, module, is_enabled, description, updated_by) VALUES (?, ?, ?, ?, ?, ?)`,
            [flag.id, flag.name, flag.module, flag.is_enabled, flag.description, 1]
        );
    }

    // 8. Seed Default Workflows
    const workflows = [
        {
            key: 'order_lifecycle',
            name: 'Order Fulfilment Workflow',
            json: JSON.stringify({
                states: [
                    { key: 'RECEIVED', label: 'Order Received', type: 'initial' },
                    { key: 'APPROVED', label: 'Approved' },
                    { key: 'PACKED', label: 'Packed' },
                    { key: 'INVOICED', label: 'Invoice Generated' },
                    { key: 'DISPATCHED', label: 'Dispatched' },
                    { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery' },
                    { key: 'DELIVERED', label: 'Delivered' },
                    { key: 'CLOSED', label: 'Closed', type: 'terminal' },
                    { key: 'CANCELLED', label: 'Cancelled', type: 'terminal' }
                ],
                transitions: [
                    { from: 'RECEIVED', to: 'APPROVED', roles: ['super_admin', 'merchant', 'ops_manager'], event: 'OrderApproved' },
                    { from: 'APPROVED', to: 'PACKED', roles: ['super_admin', 'merchant', 'ops_manager', 'packing_staff'], event: 'OrderPacked' },
                    { from: 'PACKED', to: 'INVOICED', roles: ['super_admin', 'merchant', 'ops_manager'], event: 'InvoiceGenerated', auto_actions: ['consume_inventory', 'generate_invoice_pdf'] },
                    { from: 'INVOICED', to: 'DISPATCHED', roles: ['super_admin', 'merchant', 'ops_manager', 'dispatch_exec'], event: 'OrderDispatched' },
                    { from: 'DISPATCHED', to: 'OUT_FOR_DELIVERY', roles: ['super_admin', 'merchant', 'ops_manager'], event: 'OrderOutForDelivery' },
                    { from: 'OUT_FOR_DELIVERY', to: 'DELIVERED', roles: ['super_admin', 'merchant', 'ops_manager'], event: 'OrderDelivered' },
                    { from: 'DELIVERED', to: 'CLOSED', roles: ['super_admin', 'merchant'], event: 'OrderClosed' },
                    { from: 'RECEIVED', to: 'CANCELLED', roles: ['super_admin', 'merchant'], event: 'OrderCancelled', auto_actions: ['release_reservation'] }
                ]
            })
        },
        {
            key: 'complaint_lifecycle',
            name: 'Complaints Management Workflow',
            json: JSON.stringify({
                states: [
                    { key: 'OPEN', label: 'Open Ticket', type: 'initial' },
                    { key: 'ASSIGNED', label: 'Assigned' },
                    { key: 'INVESTIGATING', label: 'Investigating' },
                    { key: 'RESOLVED', label: 'Resolved' },
                    { key: 'CLOSED', label: 'Closed', type: 'terminal' }
                ],
                transitions: [
                    { from: 'OPEN', to: 'ASSIGNED', roles: ['super_admin', 'merchant', 'ops_manager', 'customer_support'], event: 'ComplaintAssigned' },
                    { from: 'ASSIGNED', to: 'INVESTIGATING', roles: ['super_admin', 'merchant', 'customer_support'], event: 'ComplaintInvestigating' },
                    { from: 'INVESTIGATING', to: 'RESOLVED', roles: ['super_admin', 'merchant', 'customer_support'], event: 'ComplaintResolved', auto_actions: ['notify_customer_resolution'] },
                    { from: 'RESOLVED', to: 'CLOSED', roles: ['super_admin', 'merchant', 'customer_support'], event: 'ComplaintClosed' }
                ]
            })
        }
    ];

    for (const wf of workflows) {
        await db.run(
            `INSERT OR IGNORE INTO workflow_definitions (workflow_key, name, definition_json, version, is_active) VALUES (?, ?, ?, ?, ?)`,
            [wf.key, wf.name, wf.json, 1, 1]
        );
    }

    // 9. Seed Default Document Templates (Basic handlebars layout)
    const templates = [
        {
            key: 'invoice',
            name: 'Tax Invoice Layout',
            html: `
            <div style="font-family: sans-serif; padding: 20px; color: #111;">
                <h1 style="color: #c27d38; font-size: 24px;">TAX INVOICE</h1>
                <p><strong>Invoice No:</strong> {{orderNumber}}</p>
                <p><strong>Date:</strong> {{date}}</p>
                <hr/>
                <div style="display: flex; justify-content: space-between;">
                    <div>
                        <h3>Seller:</h3>
                        <p><strong>House of Singhana</strong><br/>Jaipur, Rajasthan</p>
                    </div>
                    <div>
                        <h3>Customer:</h3>
                        <p><strong>{{customer.name}}</strong><br/>{{shippingAddress.address_line1}}, {{shippingAddress.city}}</p>
                    </div>
                </div>
                <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                    <thead>
                        <tr style="border-bottom: 2px solid #ccc; text-align: left;">
                            <th>Item Description</th>
                            <th>SKU</th>
                            <th>Qty</th>
                            <th>Unit Price</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {{#each items}}
                        <tr style="border-bottom: 1px solid #eee; padding: 8px 0;">
                            <td>{{product_name}} - {{variant_name}}</td>
                            <td><code>{{sku}}</code></td>
                            <td>{{quantity}}</td>
                            <td>₹{{unit_price}}</td>
                            <td>₹{{total_price}}</td>
                        </tr>
                        {{/each}}
                    </tbody>
                </table>
                <div style="text-align: right; margin-top: 20px;">
                    <p><strong>Subtotal:</strong> ₹{{subtotal_amount}}</p>
                    <p><strong>Tax (GST):</strong> ₹{{tax_amount}}</p>
                    <p><strong>Shipping:</strong> ₹{{shipping_charge}}</p>
                    <h2><strong>Grand Total:</strong> ₹{{total_amount}}</h2>
                </div>
            </div>`,
            css: 'body { font-size: 14px; }',
            paper_size: 'A4'
        },
        {
            key: 'packing_slip',
            name: 'Warehouse Picking Slip',
            html: `
            <div style="font-family: sans-serif; padding: 20px;">
                <h2>PICKING & PACKING SLIP</h2>
                <p><strong>Order ID:</strong> {{orderNumber}}</p>
                <p><strong>Fulfill From:</strong> {{warehouseName}}</p>
                <hr/>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #f4f4f4; text-align: left;">
                            <th>Product/Variant</th>
                            <th>SKU</th>
                            <th>Location Bin</th>
                            <th>Quantity</th>
                            <th>Packed Check [ ]</th>
                        </tr>
                    </thead>
                    <tbody>
                        {{#each items}}
                        <tr>
                            <td>{{product_name}} ({{variant_name}})</td>
                            <td><code>{{sku}}</code></td>
                            <td><strong>{{location_code}}</strong></td>
                            <td>{{quantity}}</td>
                            <td>[ &nbsp; ]</td>
                        </tr>
                        {{/each}}
                    </tbody>
                </table>
                <div style="margin-top: 40px; text-align: center;">
                    <img src="{{qrCodeDataUrl}}" alt="Scan QR Code to lookup" style="width: 120px; height: 120px;"/>
                    <p style="font-size: 11px; color: #666;">Scan QR with OS Command Palette to lookup order details</p>
                </div>
            </div>`,
            css: 'body { font-size: 12px; } td, th { padding: 10px; border-bottom: 1px solid #ddd; }',
            paper_size: '4x6'
        }
    ];

    for (const temp of templates) {
        await db.run(
            `INSERT OR IGNORE INTO document_templates (template_key, name, template_html, template_css, paper_size, version, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [temp.key, temp.name, temp.html, temp.css, temp.paper_size, 1, 1]
        );
    }

    // 10. Seed Default Tax Rules (GST 5% for spices)
    await db.run(
        `INSERT OR IGNORE INTO tax_rules (hsn_code, description, gst_rate, cgst_rate, sgst_rate, igst_rate, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['091091', 'Spices - Ground/Blends', 5.0, 2.5, 2.5, 5.0, 1]
    );

    // 11. Seed Default Shipping Rules
    await db.run(
        `INSERT OR IGNORE INTO shipping_rules (name, rule_type, min_order_amount, charge_amount, allowed_payment_methods, priority, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['Free Standard Delivery', 'FREE_ABOVE', 99900, 0, '["online", "cod"]', 1, 1]
    );
    await db.run(
        `INSERT OR IGNORE INTO shipping_rules (name, rule_type, min_order_amount, charge_amount, allowed_payment_methods, priority, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['Flat Rate Shipping', 'FLAT_RATE', 0, 8000, '["online", "cod"]', 0, 1]
    );

    // 12. Seed Default Archive Rules
    await db.run(
        `INSERT OR IGNORE INTO archive_rules (entity_type, archive_after_days, description, is_active) VALUES (?, ?, ?, ?)`,
        ['orders', 365, 'Archive closed orders after 1 year.', 1]
    );
    await db.run(
        `INSERT OR IGNORE INTO archive_rules (entity_type, archive_after_days, description, is_active) VALUES (?, ?, ?, ?)`,
        ['domain_events', 90, 'Clean up domain event logs after 90 days.', 1]
    );

    // 13. Seed Spices Catalog, Variants & Inventory Stocks (For storefront connectivity)
    await db.run(
        `INSERT OR IGNORE INTO categories (id, name, slug, description, sort_order) 
         VALUES (1, 'Spices', 'spices', 'Premium ground spices from local mandis.', 1)`
    );

    const seededProducts = [
        { id: 1, name: 'Chilli', slug: 'chilli', sku: 'PRD-CHILLI-01', price: 86000, desc: 'Pure low-temperature ground red chilli powder.', img: '["assets/chilli.png"]' },
        { id: 2, name: 'Turmeric', slug: 'turmeric', sku: 'PRD-TURMERIC-01', price: 68000, desc: 'Rich curcumin-dense handpicked turmeric.', img: '["assets/turmeric.png"]' },
        { id: 3, name: 'Coriander', slug: 'coriander', sku: 'PRD-CORIANDER-01', price: 62000, desc: 'Aromatic low-temperature ground coriander seeds.', img: '["assets/coriander.png"]' }
    ];

    for (const p of seededProducts) {
        await db.run(
            `INSERT OR IGNORE INTO products (id, name, slug, sku, category_id, base_price, tax_rate, hsn_code, status, description, images) 
             VALUES (?, ?, ?, ?, 1, ?, 5.0, '091091', 'active', ?, ?)`,
            [p.id, p.name, p.slug, p.sku, p.price, p.desc, p.img]
        );
    }

    const seededVariants = [
        // Chilli variants
        { id: 1, product_id: 1, sku: 'VAR-CHIL-EVERY', name: 'Everyday Blend', price: 86000 },
        { id: 2, product_id: 1, sku: 'VAR-CHIL-HEAT', name: 'Heat Blend', price: 92000 },
        { id: 3, product_id: 1, sku: 'VAR-CHIL-COLOUR', name: 'Colour Blend', price: 89000 },
        // Turmeric variants
        { id: 4, product_id: 2, sku: 'VAR-TURM-STD', name: 'Standard Curcumin', price: 68000 },
        // Coriander variants
        { id: 5, product_id: 3, sku: 'VAR-CORI-STD', name: 'Standard Blend', price: 62000 }
    ];

    for (const v of seededVariants) {
        await db.run(
            `INSERT OR IGNORE INTO product_variants (id, product_id, sku, variant_name, size_label, packaging_type, price, weight_grams) 
             VALUES (?, ?, ?, ?, '1kg', 'Fine Jute', ?, 1000)`,
            [v.id, v.product_id, v.sku, v.name, v.price]
        );

        // Seed stock summary to ensure available_stock > 0
        await db.run(
            `INSERT OR IGNORE INTO inventory_summary (variant_id, warehouse_id, current_stock, reserved_stock, reorder_level) 
             VALUES (?, 1, 200, 0, 10)`,
            [v.id]
        );
    }

    console.log('Initial data seeded successfully.');
}

if (require.main === module) {
    runSeed().catch(err => {
        console.error('Seed process failed', err);
        process.exit(1);
    });
}

module.exports = {
    runSeed
};
