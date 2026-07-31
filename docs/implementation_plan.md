# Merchant OS v1.0 — Final Architectural Blueprint

---

## System Philosophy

Merchant OS is not an admin panel. It is the operating system that runs the business. Every employee logs into the same system. What they see is determined by their role. What they can do is enforced at every layer.

Twelve architectural principles govern every design decision:

1. **Each domain owns its data exclusively.** The system is structured around bounded contexts (Auth, Products, Inventory, Orders, Fulfilment, Customers, Payments, Support, Marketing, CMS, Analytics, System). No module directly reads or writes another module's tables. Cross-domain communication happens only through service interfaces or domain events.

2. **Inventory is the sum of recorded business events.** Stock levels are never edited directly. They are derived from an immutable transaction ledger. Every unit is traceable to its procurement batch.

3. **Dashboards never query live transactional tables.** OLTP (transactions) and OLAP (analytics) are separated. Mutations trigger aggregation into pre-computed tables. Dashboards read from these.

4. **Nothing is silently editable.** Every mutation is permanently recorded: who, when, what changed, old value, new value. Every mutable entity carries `created_by`, `updated_by`, `created_at`, `updated_at`, and where applicable `archived_at` and `deleted_at`.

5. **Modules communicate through events, not direct calls.** When an order is invoiced, the order service emits `InvoiceGenerated`. The inventory service, notification service, and analytics service each react independently. No module knows about the others.

6. **Business workflows are data, not code.** The order lifecycle, complaint lifecycle, and return lifecycle are defined as JSON state machines stored in the database. Adding a step (e.g., "Quality Check" before dispatch) requires a configuration change, not a code deployment.

7. **Nothing is permanently deleted.** Orders, products, customers, reviews, complaints, and inventory records are soft-deleted (`deleted_at` timestamp). Archived data remains searchable. Historical integrity is non-negotiable. Corrections happen through new transactions (Credit Notes, Stock Adjustments, Return Transactions), never by overwriting history.

8. **Documents are generated from templates, not hardcoded layouts.** Invoices, packing slips, shipping labels, and reports are rendered through configurable Handlebars templates stored in the database. The merchant can eventually edit document layouts without developer intervention.

9. **Operational rules are configurable.** Low stock alerts, delayed dispatch notifications, approval workflows, and courier exception handling are defined as automation rules in the database, not as if-statements scattered across the codebase.

10. **The system monitors itself.** Merchant OS includes a technical health dashboard that tracks integration status (Razorpay, Twilio, Email), scheduled job health, database size, storage usage, and queue depth. The merchant should never be surprised by a silent failure.

11. **Critical operations are idempotent.** Invoice generation, inventory deduction, payment confirmation, shipment creation, and webhook processing all carry idempotency keys. Retrying a failed request never creates duplicate business actions.

12. **Everything has a permanent identity.** Every business entity — Customer, Order, Product, Inventory Transaction, Batch, Complaint, Review, Invoice, Shipment — has a unique, permanent identifier. Nothing important relies on names or positions.

---

## Core Engineering Constitution & Design Principles

To scale cleanly to a ₹100 crore business and beyond over the next decade, all codebase changes must adhere strictly to these design patterns:

### 1. Domain-Driven Design (DDD)
The application is structured into strict bounded contexts: *Authentication, Users & Roles, Customers, Orders, Products, Inventory, Procurement, Fulfilment, Shipping, Payments, Support, Reviews, Analytics, Administration*.
*   Each domain owns its business logic and data schema.
*   Cross-domain queries use read-only services; cross-domain mutations utilize domain events.

### 2. Event-Driven Architecture (EDA)
Business events are the primary coordinator of downstream side effects.
*   Every business transaction emits a domain event (e.g., `OrderPlaced`, `InvoiceGenerated`, `InventoryReserved`, `ShipmentCreated`).
*   Subscribers handle notifications, analytics updates, invoice storage, and dashboard notifications asynchronously.

### 3. Service-Oriented Business Logic
Controllers and UI components remain extremely thin. All business rules live inside transaction-safe Domain Services (`orderService.js`, `inventoryService.js`, etc.). There is zero business logic duplication.

### 4. Single Source of Truth
Every state vector (e.g. inventory quantity, order status, user permissions) has exactly one owning table and module. Derived fields are computed on demand rather than stored redundantly.

### 5. Immutable Business History & Accounting Ledger
No operational transaction is ever updated in place. Correcting error states requires compensating transactions:
*   Inventory adjustments create new `STOCK_ADJUSTMENT` ledger entries.
*   Invoicing corrections create `CREDIT_NOTE` documents.
*   Shipment exceptions trigger returns or damage entries.

### 6. Inventory as a Ledger
Inventory is managed like double-entry bookkeeping:
*   Ledger writes record changes (`change_qty`, current and reserved balances).
*   Derived summary shows: `Current Stock`, `Reserved Stock`, `Available Stock` (Current − Reserved), `Incoming Stock`, `Damaged Stock`, `Blocked Stock`, `Reorder Level`.
*   Only `Available Stock` is sellable.

### 7. API-First & Thin UI
All services expose clean HTTP/JSON endpoints. The frontend is a client SPA. Database access is strictly forbidden from the UI. This isolates the domain logic so the frontend can be entirely replaced without risking business rules.

### 8. Idempotent Operations
All state mutations (especially payment verify, invoice generation, inventory consumption) accept an `idempotency_key` which is verified against `idempotency_keys`. Retries will return cached responses without repeating side-effects.

### 9. Everything has Identity & Temporal Tracking
All entities utilize persistent unique IDs (numeric PKs or UUIDs). Natural keys or names are never used for joins. Every table records `created_at`, `updated_at`, `created_by`, `updated_by`, and where applicable `archived_at` and `deleted_at`.

### 10. System, Business & Inventory Dashboards
*   **Inventory Dashboard**: Real-time stock levels, inventory value, aging metrics, and velocity indicators. Updates automatically post-invoice.
*   **Business Health Dashboard**: Evaluates overall operational stats (Dispatch SLA, returns rate, SKU anomalies, reorder warnings) to provide actionable insights.
*   **System Health Dashboard**: Technical uptime checks on databases, backup job status, payment gates, SMS providers, and queues.

---

## User Review Required

> [!IMPORTANT]
> **Decisions requiring approval:**
>
> 1. **SQLite with PostgreSQL-ready schema**: WAL mode, foreign keys enforced. The schema avoids SQLite-only features (except `GENERATED ALWAYS AS ... STORED` which has a direct PG equivalent). Supports 10–1,000 orders/day. Migration to PostgreSQL warranted above ~5,000/day.
>
> 2. **In-process event bus for v1.0**: Domain events are dispatched through a synchronous in-process EventEmitter (Node.js native). Events are persisted to `domain_events` table for replay/debugging. The abstraction boundary is designed so that swapping to Redis Pub/Sub or a message queue requires changing only the transport layer in `eventBus.js`, not any subscriber.
>
> 3. **Workflow definitions as JSON**: Each workflow (order, complaint, return, approval) is stored as a JSON object in `workflow_definitions` with `states`, `transitions`, and `allowed_roles`. The workflow engine validates transitions at runtime. This means you can add "QC Check" between "Packed" and "Invoiced" by inserting a row — no code change needed.
>
> 4. **Multi-warehouse schema from day one**: The `warehouses` table exists as a parent entity. `inventory_summary`, `inventory_batches`, and `orders` carry a `warehouse_id`. For v1.0, a single default warehouse ("Singhana Main Hub") is seeded. The schema never needs to change when a second warehouse is added.
>
> 5. **Customer frontend remains static HTML**: Existing pages (`index.html`, `product.html`, `checkout.html`) are upgraded to fetch from CMS APIs. Merchant OS lives at `/os/` as a separate SPA.

---

## Open Questions

> [!NOTE]
> 1. **Packing slip format**: Standard A4 sheet or 4×6" thermal label?
> 2. **Daily closing report recipient**: Single merchant email or configurable per-user?
> 3. **Twilio credentials**: Live or mock mode for v1.0?

---

## 1. Bounded Contexts & Domain Ownership

Every table and every business rule has exactly one owning domain. No service reaches into another domain's tables.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            BOUNDED CONTEXTS                                    │
│                                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │   AUTH   │  │ PRODUCTS │  │INVENTORY │  │  ORDERS  │  │FULFILMENT│          │
│  │          │  │          │  │          │  │          │  │          │          │
│  │ users    │  │ products │  │ warehouses│ │ orders   │  │ (operates│          │
│  │ roles    │  │ variants │  │ bins     │  │ items    │  │  on order│          │
│  │ perms    │  │ categories│ │ summary  │  │ timeline │  │  data via│          │
│  │ sessions │  │ media    │  │ batches  │  │ returns  │  │  events) │          │
│  └────┬─────┘  └────┬─────┘  │ ledger   │  │ documents│  └────┬─────┘          │
│       │             │        │ audits   │  └────┬─────┘       │               │
│       │             │        └────┬─────┘       │             │               │
│  ┌────┴─────┐  ┌────┴─────┐  ┌───┴──────┐  ┌───┴──────┐  ┌───┴──────┐        │
│  │CUSTOMERS │  │   CMS    │  │ PAYMENTS │  │ SUPPORT  │  │MARKETING │        │
│  │          │  │          │  │          │  │          │  │          │        │
│  │ customers│  │ homepage │  │ reconcil.│  │complaints│  │ coupons  │        │
│  │ addresses│  │ faqs     │  │ tax_rules│  │ reviews  │  │ usages   │        │
│  │ wishlists│  │ seo      │  │ ship_rule│  │          │  │ ab_carts │        │
│  │ referrals│  │ redirects│  │          │  │          │  │ search   │        │
│  │ comms    │  │ templates│  │          │  │          │  │ stock_ntf│        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│                                                                                 │
│  ┌──────────┐  ┌──────────┐                                                    │
│  │ANALYTICS │  │  SYSTEM  │   Cross-domain communication:                      │
│  │ (OLAP)   │  │          │   • Domain Events (eventBus)                       │
│  │          │  │ events   │   • Service Interfaces (read-only queries)         │
│  │ daily    │  │ audit    │   • NEVER direct table writes across domains       │
│  │ velocity │  │ health   │                                                    │
│  │ cohorts  │  │ jobs     │                                                    │
│  │ regions  │  │ flags    │                                                    │
│  │ closing  │  │ workflows│                                                    │
│  │ timeline │  │ automations│                                                  │
│  │ calendar │  │ approvals│                                                    │
│  │ kb       │  │ archive  │                                                    │
│  └──────────┘  └──────────┘                                                    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Cross-domain rules**:
- The Order Service needs inventory availability → it calls `inventoryService.checkAvailability(variantId, warehouseId)` (read-only). It never queries `inventory_summary` directly.
- When an invoice is generated, the Order Service emits `InvoiceGenerated`. The Inventory Service subscribes and runs `consumeOnInvoice()`. The Order Service never calls inventory write methods directly.
- The Analytics Service subscribes to all domain events and updates OLAP tables. No other service writes to analytics tables.
- The Notification Service subscribes to events and dispatches SMS/Email/WhatsApp. No other service sends notifications directly.

---

## 2. Data Architecture

### 1.1 Event-Driven Flow

```
  BUSINESS ACTION (e.g. Order Invoiced)
           │
           ▼
  ┌─────────────────┐
  │  Controller      │  ← Thin HTTP handler
  │  (validates,     │
  │   calls service) │
  └────────┬─────────┘
           │
           ▼
  ┌─────────────────┐
  │  Service         │  ← Business logic
  │  (mutates DB,    │
  │   emits event)   │
  └────────┬─────────┘
           │
     eventBus.emit('InvoiceGenerated', { orderId, items, ... })
           │
           ├──────────────────┬────────────────────┬──────────────────┐
           ▼                  ▼                    ▼                  ▼
  ┌──────────────┐  ┌──────────────┐    ┌──────────────┐  ┌──────────────┐
  │ Inventory    │  │ Notification │    │ Analytics    │  │ Automation   │
  │ Service      │  │ Service      │    │ Service      │  │ Engine       │
  │              │  │              │    │              │  │              │
  │ Consume      │  │ Send SMS     │    │ Update OLAP  │  │ Evaluate     │
  │ stock from   │  │ to customer  │    │ daily_metrics│  │ rules        │
  │ ledger       │  │              │    │              │  │              │
  └──────────────┘  └──────────────┘    └──────────────┘  └──────────────┘
```

Every event is also persisted to the `domain_events` table. This gives us:
- **Debugging**: "Why didn't the customer get an SMS?" → query `domain_events` for `OrderDispatched` → check if notification handler processed it.
- **Replay**: If analytics data is corrupted, replay events from `domain_events` to rebuild OLAP tables.
- **Future extensibility**: Adding a new listener (e.g., WhatsApp Business API) requires only registering a new subscriber. Zero changes to existing code.

### 1.2 Domain Events

| Event | Emitted by | Subscribers |
|---|---|---|
| `OrderPlaced` | orderService | inventory (reserve), analytics, notification (confirmation), automation |
| `OrderApproved` | orderService | packing queue update, notification (internal) |
| `OrderPacked` | orderService | fulfilment queue, notification (internal) |
| `InvoiceGenerated` | orderService | inventory (consume + batch link), document vault, notification (customer) |
| `OrderDispatched` | orderService | notification (customer SMS/WhatsApp), analytics |
| `OrderDelivered` | orderService | notification, analytics, customer LTV update, review eligibility |
| `OrderCancelled` | orderService | inventory (release reservation), analytics, notification |
| `BatchReceived` | inventoryService | inventory summary update, analytics, automation (low stock re-check) |
| `StockLow` | automationEngine | notification (merchant alert), dashboard alert |
| `StockDepleted` | automationEngine | notification, stock_notifications (back-in-stock queue) |
| `ComplaintRaised` | complaintService | notification (internal + customer), analytics |
| `ComplaintResolved` | complaintService | notification (customer), analytics |
| `ReviewSubmitted` | reviewService | notification (internal), analytics |
| `PaymentReceived` | paymentService | order status update, analytics, reconciliation |
| `PaymentFailed` | paymentService | notification (customer), dashboard alert |
| `RefundProcessed` | returnService | notification, analytics, inventory (return stock) |
| `CustomerRegistered` | authService | analytics, referral check, notification |

### 1.3 Workflow Engine

Workflows are defined in `workflow_definitions` as JSON. The engine validates every state transition at runtime.

```json
{
  "workflow_key": "order_lifecycle",
  "name": "Order Lifecycle",
  "states": [
    { "key": "RECEIVED", "label": "Order Received", "type": "initial" },
    { "key": "APPROVED", "label": "Approved" },
    { "key": "PACKED", "label": "Packed" },
    { "key": "INVOICED", "label": "Invoice Generated" },
    { "key": "DISPATCHED", "label": "Dispatched" },
    { "key": "OUT_FOR_DELIVERY", "label": "Out for Delivery" },
    { "key": "DELIVERED", "label": "Delivered" },
    { "key": "CLOSED", "label": "Closed", "type": "terminal" },
    { "key": "CANCELLED", "label": "Cancelled", "type": "terminal" }
  ],
  "transitions": [
    { "from": "RECEIVED", "to": "APPROVED", "roles": ["super_admin", "merchant", "ops_manager"], "event": "OrderApproved" },
    { "from": "APPROVED", "to": "PACKED", "roles": ["super_admin", "merchant", "ops_manager", "packing_staff"], "event": "OrderPacked" },
    { "from": "PACKED", "to": "INVOICED", "roles": ["super_admin", "merchant", "ops_manager"], "event": "InvoiceGenerated", "auto_actions": ["consume_inventory", "generate_invoice_pdf"] },
    { "from": "INVOICED", "to": "DISPATCHED", "roles": ["super_admin", "merchant", "ops_manager", "dispatch_exec"], "event": "OrderDispatched" },
    { "from": "DISPATCHED", "to": "OUT_FOR_DELIVERY", "roles": ["super_admin", "merchant", "ops_manager"], "event": "OrderOutForDelivery" },
    { "from": "OUT_FOR_DELIVERY", "to": "DELIVERED", "roles": ["super_admin", "merchant", "ops_manager"], "event": "OrderDelivered" },
    { "from": "DELIVERED", "to": "CLOSED", "roles": ["super_admin", "merchant"], "event": "OrderClosed" },
    { "from": "RECEIVED", "to": "CANCELLED", "roles": ["super_admin", "merchant"], "event": "OrderCancelled", "auto_actions": ["release_reservation"] }
  ]
}
```

Adding a "Quality Check" step between Packed and Invoiced requires only inserting a new state and two transitions into this JSON — no code change.

### 1.4 OLTP / OLAP Separation

```
  WRITES (Real-time via Event Subscribers)
       │
  ┌────┼────────────────────────┐
  │    │                        │
  ▼    ▼                        ▼
 OLTP Tables              OLAP Tables (pre-aggregated)
 ─────────────            ──────────────────────────
 orders                   analytics_daily_metrics
 order_items              analytics_sku_velocity
 inventory_ledger         analytics_customer_cohorts
 inventory_batches        analytics_region_performance
 customers                daily_closing_reports
 complaints               merchant_timeline
 reviews
 coupons
       │
       │  (Event: OrderPlaced)
       │  → analyticsService.onOrderPlaced()
       │  → UPDATE analytics_daily_metrics SET orders_count = orders_count + 1
       │
  Dashboard reads ONLY from OLAP tables → sub-5ms response
```

### 1.5 Perpetual Inventory Lifecycle

```
PROCUREMENT               ORDER PLACED              ORDER INVOICED
─────────────              ────────────              ──────────────
Event: BatchReceived       Event: OrderPlaced        Event: InvoiceGenerated
Batch received       →     Reserve stock       →     Consume stock
current_stock +N           reserved_stock +N         current_stock -N
                                                     reserved_stock -N
Ledger: PURCHASE_RECEIPT   Ledger: RESERVATION       Ledger: INVOICE_CONSUMPTION
Batch: qty_remaining set                             Batch: qty_remaining -N
                                                     order_items.batch_id linked

       │                   ORDER CANCELLED
       │                   ──────────────
       │                   Event: OrderCancelled
       │                   Release reservation
       │                   reserved_stock -N
       │                   Ledger: RESERVATION_RELEASE
       ▼
  ┌────────────────────────────────────────────┐
  │  inventory_summary (DERIVED MATERIALIZED)  │
  │                                            │
  │  available_stock = current - reserved      │
  │  Only available_stock is sellable          │
  │  available < reorder_level → StockLow      │
  │  available = 0 → StockDepleted             │
  └────────────────────────────────────────────┘
```

---

## 3. Database Schema (50+ Tables, 12 Domains)

> [!NOTE]
> **Temporal auditability convention**: Every mutable entity carries `created_at`, `updated_at`, `created_by` (user ID), and `updated_by` (user ID). Archivable entities additionally carry `is_archived`, `archived_at`. Soft-deletable entities carry `deleted_at`. These columns are shown on the tables below but assumed present on every table even if abbreviated for readability.
>
> **Idempotency convention**: Critical write operations (invoice generation, inventory deduction, payment confirmation, shipment creation, webhook processing) generate or accept an `idempotency_key`. The `idempotency_keys` table prevents duplicate business actions on retry.

### Domain 1: Access Control, Feature Flags & System Config

```sql
CREATE TABLE roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE permissions (
    id TEXT PRIMARY KEY,
    module TEXT NOT NULL,
    action TEXT NOT NULL,
    description TEXT
);

CREATE TABLE role_permissions (
    role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    phone TEXT UNIQUE,
    role_id TEXT NOT NULL REFERENCES roles(id),
    is_active BOOLEAN DEFAULT 1,
    two_factor_enabled BOOLEAN DEFAULT 0,
    two_factor_secret TEXT,
    last_login_at DATETIME,
    created_by INTEGER,                       -- TEMPORAL AUDIT
    updated_by INTEGER,
    deleted_at DATETIME,                      -- SOFT DELETE
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE backup_admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    secret_key_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE feature_flags (
    id TEXT PRIMARY KEY,                      -- 'module_gift_orders', 'module_referrals', 'module_ai_assistant'
    name TEXT NOT NULL,
    module TEXT,                               -- Which module this controls
    is_enabled BOOLEAN DEFAULT 1,
    description TEXT,
    updated_by INTEGER REFERENCES users(id),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Domain 2: Event Bus, Audit Trail & System Health

```sql
CREATE TABLE domain_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,                  -- 'OrderPlaced', 'InvoiceGenerated', 'BatchReceived', etc.
    aggregate_type TEXT NOT NULL,              -- 'order', 'inventory', 'customer', 'complaint'
    aggregate_id TEXT NOT NULL,                -- The entity ID
    payload TEXT NOT NULL,                     -- JSON: full event data
    emitted_by_user_id INTEGER,
    processed BOOLEAN DEFAULT 0,              -- For replay capability
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_email TEXT,
    user_role TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    old_values TEXT,                           -- JSON snapshot before
    new_values TEXT,                           -- JSON snapshot after
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE system_health_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_name TEXT NOT NULL,                -- 'razorpay', 'twilio_sms', 'twilio_whatsapp', 'email_smtp', 'database', 'disk_storage'
    status TEXT NOT NULL,                      -- 'HEALTHY', 'DEGRADED', 'DOWN'
    response_time_ms INTEGER,
    last_error TEXT,
    checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE scheduled_jobs (
    id TEXT PRIMARY KEY,                       -- 'daily_closing_report', 'analytics_rebuild', 'archive_old_data'
    name TEXT NOT NULL,
    cron_expression TEXT NOT NULL,             -- '59 23 * * *'
    last_run_at DATETIME,
    last_status TEXT DEFAULT 'PENDING',        -- 'SUCCESS', 'FAILED', 'RUNNING'
    last_error TEXT,
    is_enabled BOOLEAN DEFAULT 1
);

CREATE TABLE idempotency_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idempotency_key TEXT UNIQUE NOT NULL,      -- UUID or composite key
    operation TEXT NOT NULL,                   -- 'INVOICE_GENERATE', 'PAYMENT_CONFIRM', 'INVENTORY_CONSUME', 'SHIPMENT_CREATE', 'WEBHOOK_PROCESS'
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    response_status INTEGER,                  -- HTTP status code of original response
    response_body TEXT,                        -- Cached response for replay
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME                        -- Auto-cleanup after expiry
);
```

### Domain 3: Workflow Engine & Automation Rules

```sql
CREATE TABLE workflow_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_key TEXT UNIQUE NOT NULL,         -- 'order_lifecycle', 'complaint_lifecycle', 'return_lifecycle', 'approval_workflow'
    name TEXT NOT NULL,
    definition_json TEXT NOT NULL,             -- JSON: states array, transitions array with roles and auto_actions
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE approval_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details TEXT NOT NULL,                     -- JSON: what changed, old/new values
    requested_by INTEGER NOT NULL REFERENCES users(id),
    status TEXT DEFAULT 'PENDING',
    decided_by INTEGER REFERENCES users(id),
    decided_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE automation_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,                        -- 'Low Stock Alert', 'Dispatch Delay Warning', 'VIP Order Priority'
    trigger_event TEXT NOT NULL,               -- Domain event: 'OrderPlaced', 'StockLow', 'InvoiceGenerated'
    condition_json TEXT NOT NULL,              -- JSON: { "field": "available_stock", "operator": "<", "value": "reorder_level" }
    action_type TEXT NOT NULL,                 -- 'SEND_NOTIFICATION', 'CREATE_TASK', 'UPDATE_STATUS', 'TRIGGER_APPROVAL'
    action_config TEXT NOT NULL,               -- JSON: { "channel": "INTERNAL", "template": "low_stock_alert", "recipients": ["merchant", "ops_manager"] }
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Domain 4: Product CMS & Content Management

```sql
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    is_archived BOOLEAN DEFAULT 0,
    archived_at DATETIME,
    deleted_at DATETIME,                      -- SOFT DELETE
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    barcode TEXT UNIQUE,
    category_id INTEGER REFERENCES categories(id),
    merchant_notes TEXT,
    description TEXT,
    base_price INTEGER NOT NULL,              -- Paise (₹ × 100)
    discount_price INTEGER,
    tax_rate REAL DEFAULT 0.0,
    hsn_code TEXT,
    images TEXT,                              -- JSON array of media_library IDs
    videos TEXT,
    seo_title TEXT,
    seo_description TEXT,
    status TEXT DEFAULT 'draft',              -- 'draft', 'active', 'archived'
    is_archived BOOLEAN DEFAULT 0,
    archived_at DATETIME,
    deleted_at DATETIME,                      -- SOFT DELETE
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku TEXT UNIQUE NOT NULL,
    barcode TEXT UNIQUE,
    variant_name TEXT NOT NULL,
    size_label TEXT NOT NULL,
    packaging_type TEXT,
    price INTEGER NOT NULL,
    discount_price INTEGER,
    weight_grams INTEGER,
    reorder_level INTEGER DEFAULT 10,
    is_archived BOOLEAN DEFAULT 0,
    archived_at DATETIME,
    deleted_at DATETIME,                      -- SOFT DELETE
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE homepage_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_key TEXT UNIQUE NOT NULL,
    title TEXT,
    content_json TEXT NOT NULL,
    is_visible BOOLEAN DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE faqs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    sort_order INTEGER DEFAULT 0,
    is_visible BOOLEAN DEFAULT 1,
    deleted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE seo_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_path TEXT UNIQUE NOT NULL,
    meta_title TEXT,
    meta_description TEXT,
    og_image_url TEXT,
    canonical_url TEXT,
    robots TEXT DEFAULT 'index, follow',
    schema_json TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE url_redirects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_path TEXT UNIQUE NOT NULL,
    target_path TEXT NOT NULL,
    status_code INTEGER DEFAULT 301,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE media_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    checksum TEXT UNIQUE NOT NULL,             -- SHA-256 deduplication
    alt_text TEXT,
    tags TEXT,
    uploaded_by INTEGER REFERENCES users(id),
    deleted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE document_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_key TEXT UNIQUE NOT NULL,         -- 'invoice', 'packing_slip', 'shipping_label', 'credit_note', 'closing_report', 'purchase_order', 'qc_report'
    name TEXT NOT NULL,
    template_html TEXT NOT NULL,               -- Handlebars template
    template_css TEXT,                         -- Scoped styles
    paper_size TEXT DEFAULT 'A4',              -- 'A4', '4x6', 'THERMAL'
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Domain 5: Warehouses & Perpetual Inventory

```sql
CREATE TABLE warehouses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,                 -- 'WH-SINGHANA-MAIN'
    name TEXT NOT NULL,                        -- 'Singhana Main Hub'
    address TEXT,
    city TEXT,
    state TEXT,
    pincode TEXT,
    is_default BOOLEAN DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    is_archived BOOLEAN DEFAULT 0,
    archived_at DATETIME,
    deleted_at DATETIME,                      -- SOFT DELETE
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE warehouse_bins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    location_code TEXT UNIQUE NOT NULL,        -- 'WH1-A04-B02'
    shelf TEXT,
    rack TEXT,
    bin TEXT,
    is_active BOOLEAN DEFAULT 1,
    is_archived BOOLEAN DEFAULT 0,
    archived_at DATETIME,
    deleted_at DATETIME,                      -- SOFT DELETE
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inventory_summary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    current_stock INTEGER DEFAULT 0,
    reserved_stock INTEGER DEFAULT 0,
    available_stock INTEGER GENERATED ALWAYS AS (current_stock - reserved_stock) STORED,
    incoming_stock INTEGER DEFAULT 0,
    damaged_stock INTEGER DEFAULT 0,
    blocked_stock INTEGER DEFAULT 0,
    reorder_level INTEGER DEFAULT 10,
    bin_location_id INTEGER REFERENCES warehouse_bins(id),
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(variant_id, warehouse_id)
);

CREATE TABLE inventory_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_number TEXT UNIQUE NOT NULL,
    variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    supplier_name TEXT NOT NULL,
    procurement_date DATE NOT NULL,
    unit_purchase_cost INTEGER NOT NULL,
    quantity_received INTEGER NOT NULL,
    quantity_remaining INTEGER NOT NULL,
    merchant_quality_notes TEXT,
    inspection_status TEXT DEFAULT 'PENDING',  -- 'PENDING', 'PASSED', 'HOLD', 'REJECTED'
    expiry_date DATE,
    is_archived BOOLEAN DEFAULT 0,
    archived_at DATETIME,
    deleted_at DATETIME,                      -- SOFT DELETE
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inventory_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    batch_id INTEGER REFERENCES inventory_batches(id),
    transaction_type TEXT NOT NULL,
    -- 'PURCHASE_RECEIPT', 'RESERVATION', 'RESERVATION_RELEASE',
    -- 'INVOICE_CONSUMPTION', 'CUSTOMER_RETURN', 'RETURN_TO_SUPPLIER',
    -- 'DAMAGE', 'QUALITY_REJECTION', 'SAMPLE_CONSUMPTION',
    -- 'STOCK_ADJUSTMENT', 'INTERNAL_TRANSFER'
    change_qty INTEGER NOT NULL,
    balance_current_before INTEGER NOT NULL,
    balance_current_after INTEGER NOT NULL,
    balance_reserved_before INTEGER NOT NULL,
    balance_reserved_after INTEGER NOT NULL,
    reference_type TEXT,
    reference_id TEXT,
    remarks TEXT,
    user_id INTEGER REFERENCES users(id),     -- Acts as created_by
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inventory_audits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    audit_number TEXT UNIQUE NOT NULL,
    variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    physical_count INTEGER NOT NULL,
    system_quantity INTEGER NOT NULL,
    variance INTEGER NOT NULL,
    audit_remarks TEXT NOT NULL,
    adjusted_by INTEGER NOT NULL REFERENCES users(id), -- Acts as created_by
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Domain 6: CRM, Addresses, Referrals & Wishlists

```sql
CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    phone TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_verified BOOLEAN DEFAULT 0,
    referral_code TEXT UNIQUE NOT NULL,
    referred_by_customer_id INTEGER REFERENCES customers(id),
    total_orders INTEGER DEFAULT 0,
    lifetime_value INTEGER DEFAULT 0,
    favourite_sku TEXT,
    average_basket INTEGER DEFAULT 0,
    segment TEXT DEFAULT 'NEW',
    tags TEXT,
    internal_notes TEXT,
    first_purchase_at DATETIME,
    last_purchase_at DATETIME,
    is_archived BOOLEAN DEFAULT 0,
    archived_at DATETIME,
    deleted_at DATETIME,                      -- SOFT DELETE
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customer_addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    label TEXT NOT NULL,                       -- 'Home', 'Office', 'Parents'
    recipient_name TEXT NOT NULL,
    recipient_phone TEXT NOT NULL,
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    pincode TEXT NOT NULL,
    is_default BOOLEAN DEFAULT 0,
    is_archived BOOLEAN DEFAULT 0,
    archived_at DATETIME,
    deleted_at DATETIME,                      -- SOFT DELETE
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE wishlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(customer_id, product_id)
);

CREATE TABLE referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_customer_id INTEGER NOT NULL REFERENCES customers(id),
    referee_customer_id INTEGER NOT NULL REFERENCES customers(id),
    referee_order_id INTEGER,
    reward_type TEXT DEFAULT 'COUPON',
    reward_value INTEGER DEFAULT 200,
    reward_status TEXT DEFAULT 'PENDING',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customer_communications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    channel TEXT NOT NULL,
    direction TEXT DEFAULT 'OUTBOUND',
    event_type TEXT NOT NULL,
    summary TEXT NOT NULL,
    reference_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stock_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    status TEXT DEFAULT 'WAITING',
    notified_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Domain 7: Orders, Gifts, Returns & Documents

```sql
CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),  -- MULTI-WAREHOUSE READY
    shipping_address_json TEXT NOT NULL,
    billing_address_json TEXT NOT NULL,
    order_notes TEXT,
    is_gift BOOLEAN DEFAULT 0,
    gift_message TEXT,
    gift_packaging BOOLEAN DEFAULT 0,
    hide_invoice_in_box BOOLEAN DEFAULT 0,
    coupon_id INTEGER REFERENCES coupons(id),
    subtotal_amount INTEGER NOT NULL,
    discount_amount INTEGER DEFAULT 0,
    shipping_charge INTEGER DEFAULT 0,
    tax_amount INTEGER DEFAULT 0,
    total_amount INTEGER NOT NULL,
    payment_status TEXT DEFAULT 'PENDING',
    payment_method TEXT DEFAULT 'online',
    payment_id TEXT,
    razorpay_order_id TEXT,
    order_status TEXT DEFAULT 'RECEIVED',
    dispatch_courier TEXT,
    dispatch_tracking TEXT,
    dispatch_date DATETIME,
    delivery_date DATETIME,
    packed_by INTEGER REFERENCES users(id),
    packed_at DATETIME,
    internal_notes TEXT,
    is_archived BOOLEAN DEFAULT 0,
    archived_at DATETIME,
    deleted_at DATETIME,                      -- SOFT DELETE
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    product_name TEXT NOT NULL,
    variant_name TEXT NOT NULL,
    sku TEXT NOT NULL,
    unit_price INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    total_price INTEGER NOT NULL,
    batch_id INTEGER REFERENCES inventory_batches(id),
    is_archived BOOLEAN DEFAULT 0,
    archived_at DATETIME,
    deleted_at DATETIME,                      -- SOFT DELETE
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_timeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    message TEXT NOT NULL,
    created_by_user_id INTEGER,
    created_by_name TEXT DEFAULT 'System',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_number TEXT UNIQUE NOT NULL,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    sku TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    reason TEXT NOT NULL,
    description TEXT,
    media_urls TEXT,
    courier TEXT,
    tracking_number TEXT,
    status TEXT DEFAULT 'REQUESTED',
    refund_amount INTEGER,
    refund_method TEXT,
    inspected_by INTEGER REFERENCES users(id),
    inspection_notes TEXT,
    is_archived BOOLEAN DEFAULT 0,
    archived_at DATETIME,
    deleted_at DATETIME,                      -- SOFT DELETE
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE document_vault (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL DEFAULT 'order', -- 'order', 'return', 'purchase_order', 'audit'
    entity_id INTEGER NOT NULL,
    document_type TEXT NOT NULL,
    template_key TEXT REFERENCES document_templates(template_key),
    file_path TEXT NOT NULL,
    file_size INTEGER,
    generated_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Domain 8: Marketing, Coupons & Cart Recovery

```sql
CREATE TABLE coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    discount_type TEXT NOT NULL,
    discount_value INTEGER NOT NULL,
    min_order_value INTEGER DEFAULT 0,
    max_discount_amount INTEGER,
    is_first_order_only BOOLEAN DEFAULT 0,
    region_restriction TEXT,
    sku_restriction TEXT,
    customer_restriction_id INTEGER,
    usage_limit_total INTEGER,
    usage_limit_per_customer INTEGER DEFAULT 1,
    used_count INTEGER DEFAULT 0,
    starts_at DATETIME,
    expires_at DATETIME,
    is_active BOOLEAN DEFAULT 1,
    is_archived BOOLEAN DEFAULT 0,
    archived_at DATETIME,
    deleted_at DATETIME,                      -- SOFT DELETE
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE coupon_usages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coupon_id INTEGER NOT NULL REFERENCES coupons(id),
    order_id INTEGER NOT NULL REFERENCES orders(id),
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    discount_applied INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE abandoned_carts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER REFERENCES customers(id),
    customer_phone TEXT,
    customer_email TEXT,
    cart_json TEXT NOT NULL,
    total_amount INTEGER NOT NULL,
    recovery_status TEXT DEFAULT 'ABANDONED',
    reminder_count INTEGER DEFAULT 0,
    last_reminded_at DATETIME,
    recovered_order_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE search_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    results_count INTEGER DEFAULT 0,
    customer_id INTEGER REFERENCES customers(id),
    session_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Domain 9: Shipping, Tax & Financial Rules

```sql
CREATE TABLE shipping_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    rule_type TEXT NOT NULL,
    min_order_amount INTEGER DEFAULT 0,
    max_order_amount INTEGER,
    region_codes TEXT,
    charge_amount INTEGER DEFAULT 0,
    allowed_payment_methods TEXT,
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tax_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hsn_code TEXT NOT NULL,
    description TEXT,
    gst_rate REAL NOT NULL,
    cgst_rate REAL NOT NULL,
    sgst_rate REAL NOT NULL,
    igst_rate REAL NOT NULL,
    effective_from DATE DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT 1
);

CREATE TABLE payment_reconciliations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reconciliation_date DATE NOT NULL,
    gateway_amount INTEGER NOT NULL,
    os_amount INTEGER NOT NULL,
    bank_amount INTEGER,
    gateway_os_variance INTEGER DEFAULT 0,
    os_bank_variance INTEGER DEFAULT 0,
    status TEXT DEFAULT 'PENDING',
    notes TEXT,
    reconciled_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Domain 10: Complaints, Reviews & Notifications

```sql
CREATE TABLE complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_number TEXT UNIQUE NOT NULL,
    order_id INTEGER REFERENCES orders(id),
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    category TEXT NOT NULL,
    priority TEXT DEFAULT 'NORMAL',
    status TEXT DEFAULT 'OPEN',
    assigned_to INTEGER REFERENCES users(id),
    description TEXT NOT NULL,
    media_urls TEXT,
    resolution_notes TEXT,
    internal_notes TEXT,
    resolved_at DATETIME,
    is_archived BOOLEAN DEFAULT 0,
    archived_at DATETIME,
    deleted_at DATETIME,                      -- SOFT DELETE
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    headline TEXT,
    review_text TEXT NOT NULL,
    media_urls TEXT,
    is_verified_purchase BOOLEAN DEFAULT 1,
    status TEXT DEFAULT 'PENDING',             -- 'PENDING', 'APPROVED', 'HIDDEN', 'ARCHIVED', 'SPAM'
    is_archived BOOLEAN DEFAULT 0,
    archived_at DATETIME,
    deleted_at DATETIME,                      -- SOFT DELETE
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    channel TEXT NOT NULL,
    recipient_type TEXT DEFAULT 'USER',
    recipient_id INTEGER,
    recipient_contact TEXT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING',
    sent_at DATETIME,
    read_at DATETIME,
    is_archived BOOLEAN DEFAULT 0,
    archived_at DATETIME,
    deleted_at DATETIME,                      -- SOFT DELETE
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Domain 11: Analytics (OLAP) & Merchant Intelligence

```sql
CREATE TABLE analytics_daily_metrics (
    metric_date DATE PRIMARY KEY,
    orders_count INTEGER DEFAULT 0,
    orders_cancelled INTEGER DEFAULT 0,
    gross_revenue INTEGER DEFAULT 0,
    discount_given INTEGER DEFAULT 0,
    shipping_collected INTEGER DEFAULT 0,
    tax_collected INTEGER DEFAULT 0,
    net_revenue INTEGER DEFAULT 0,
    aov INTEGER DEFAULT 0,
    new_customers INTEGER DEFAULT 0,
    repeat_customers INTEGER DEFAULT 0,
    fill_rate REAL DEFAULT 100.0,
    avg_dispatch_hours REAL DEFAULT 0.0,
    avg_delivery_days REAL DEFAULT 0.0,
    complaints_opened INTEGER DEFAULT 0,
    returns_requested INTEGER DEFAULT 0,
    complaint_rate REAL DEFAULT 0.0,
    return_rate REAL DEFAULT 0.0,
    health_score INTEGER DEFAULT 100,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE analytics_sku_velocity (
    variant_id INTEGER PRIMARY KEY,
    sku TEXT NOT NULL,
    product_name TEXT NOT NULL,
    sales_7d INTEGER DEFAULT 0,
    sales_30d INTEGER DEFAULT 0,
    revenue_30d INTEGER DEFAULT 0,
    daily_velocity REAL DEFAULT 0.0,
    current_stock INTEGER DEFAULT 0,
    days_of_stock_remaining REAL DEFAULT 999.0,
    procurement_needed_7d INTEGER DEFAULT 0,
    procurement_needed_15d INTEGER DEFAULT 0,
    procurement_needed_30d INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE analytics_customer_cohorts (
    cohort_month TEXT NOT NULL,
    segment TEXT NOT NULL,
    customer_count INTEGER DEFAULT 0,
    total_revenue INTEGER DEFAULT 0,
    avg_ltv INTEGER DEFAULT 0,
    PRIMARY KEY (cohort_month, segment)
);

CREATE TABLE analytics_region_performance (
    state TEXT NOT NULL,
    city TEXT,
    period TEXT NOT NULL,
    orders_count INTEGER DEFAULT 0,
    revenue INTEGER DEFAULT 0,
    returns_count INTEGER DEFAULT 0,
    avg_delivery_days REAL DEFAULT 0.0,
    PRIMARY KEY (state, period)
);

CREATE TABLE daily_closing_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_date DATE UNIQUE NOT NULL,
    total_orders INTEGER NOT NULL,
    total_revenue INTEGER NOT NULL,
    online_revenue INTEGER NOT NULL,
    cod_revenue INTEGER NOT NULL,
    dispatched_count INTEGER NOT NULL,
    pending_dispatch INTEGER NOT NULL,
    delivered_count INTEGER NOT NULL,
    complaints_count INTEGER NOT NULL,
    returns_count INTEGER NOT NULL,
    low_stock_skus INTEGER NOT NULL,
    health_score INTEGER NOT NULL,
    pdf_path TEXT,
    emailed_to TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE merchant_timeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_date DATE NOT NULL,
    summary TEXT NOT NULL,
    details_json TEXT NOT NULL,
    health_score INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE merchant_calendar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    event_type TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE knowledge_base (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    content_markdown TEXT NOT NULL,
    author_id INTEGER REFERENCES users(id),    -- Acts as created_by
    is_published BOOLEAN DEFAULT 1,
    is_archived BOOLEAN DEFAULT 0,
    archived_at DATETIME,
    deleted_at DATETIME,                      -- SOFT DELETE
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ai_query_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    query_text TEXT NOT NULL,
    generated_sql TEXT,
    response_text TEXT NOT NULL,
    execution_time_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Domain 12: Archive Configuration

```sql
CREATE TABLE archive_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT UNIQUE NOT NULL,          -- 'orders', 'audit_logs', 'domain_events', 'search_logs'
    archive_after_days INTEGER NOT NULL,       -- e.g. 365 for orders, 90 for search_logs
    description TEXT,
    is_active BOOLEAN DEFAULT 1,
    last_run_at DATETIME
);
```

---

## 3. RBAC Permission Model

### Permission Keys

| Module | Permissions |
|---|---|
| `dashboard` | `read` |
| `orders` | `read`, `write`, `dispatch`, `cancel`, `export`, `bulk_action` |
| `packing` | `read`, `pack`, `print_slip` |
| `fulfilment` | `read`, `dispatch`, `update_tracking` |
| `products` | `read`, `write`, `archive` |
| `inventory` | `read`, `receive`, `audit`, `adjust` |
| `customers` | `read`, `write`, `export`, `segment` |
| `complaints` | `read`, `write`, `assign`, `resolve` |
| `reviews` | `read`, `moderate`, `reply` |
| `analytics` | `read`, `export` |
| `reports` | `read`, `generate`, `export` |
| `users` | `read`, `write`, `roles` |
| `audit` | `read` |
| `notifications` | `read`, `configure` |
| `coupons` | `read`, `write` |
| `settings` | `read`, `write` |
| `system` | `health`, `jobs`, `archive` |
| `workflows` | `read`, `configure` |
| `automations` | `read`, `write` |
| `templates` | `read`, `write` |

### Role Assignments

| Role | Access | Restrictions |
|---|---|---|
| **Super Admin** | Everything. System config, RBAC, workflows, automations, templates, system health. | — |
| **Merchant** | Dashboard, Orders, Products, Inventory, Customers, Complaints, Reviews, Analytics, Reports, Coupons, Calendar, Knowledge Base. | User management, system config, workflow editing |
| **Operations Manager** | Dashboard, Orders, Fulfilment, Packing, Inventory (read + receive), Complaints (read). | Products write, Analytics export, User management |
| **Dispatch Executive** | Fulfilment queue (assigned orders only), Dispatch + tracking, Print slips. | Everything else |
| **Packing Staff** | Packing queue, Mark packed, Print slips. | Everything else |
| **Customer Support** | Customers (read), Orders (read), Complaints (full), Reviews (moderate + reply). | Products, Inventory, Financial data |
| **Accountant** | Dashboard (financial), Orders (read), Analytics (revenue), Reports (financial), Reconciliation. | Products write, Inventory write |
| **Marketing** | Dashboard (growth), Customers (read + segment), Analytics, Reviews (read), Coupons, Products (read). | Orders write, Inventory, Complaints |

---

## 4. Folder Architecture

```
House of Singhana/
│
├── index.html / product.html / checkout.html / login.html    # Customer frontend
├── index.css / main.js                                        # Customer shared
├── assets/                                                    # Product imagery
│
├── merchant-os/                            # ──── MERCHANT OS SPA ────
│   ├── index.html                          # SPA shell
│   ├── css/
│   │   ├── os-tokens.css                   # Design tokens
│   │   ├── os-layout.css                   # Sidebar, topbar, grid
│   │   ├── os-components.css               # Tables, cards, badges, modals
│   │   ├── os-forms.css                    # Inputs, toggles, file uploads
│   │   └── os-print.css                    # @media print
│   ├── js/
│   │   ├── app.js                          # Boot: auth → permissions → router → command palette
│   │   ├── router.js                       # Hash router with permission guards
│   │   ├── state.js                        # Reactive state store
│   │   ├── api.js                          # Fetch wrapper with auth headers
│   │   ├── rbac.js                         # Permission engine & menu renderer
│   │   ├── command-palette.js              # Ctrl+K
│   │   ├── shortcuts.js                    # Keyboard shortcuts
│   │   ├── utils.js                        # Formatters, debounce, QR, CSV
│   │   └── modules/
│   │       ├── dashboard.js                # KPIs, Health Score, Alerts, Charts
│   │       ├── orders.js                   # OMS
│   │       ├── packing.js                  # Packing queue
│   │       ├── fulfilment.js               # Dispatch & SLA
│   │       ├── products.js                 # Product CMS
│   │       ├── inventory.js                # Perpetual ledger, batches, audits
│   │       ├── customers.js                # CRM
│   │       ├── complaints.js               # Tickets
│   │       ├── reviews.js                  # Moderation
│   │       ├── analytics.js                # Charts & trends
│   │       ├── reports.js                  # Exports
│   │       ├── coupons.js                  # Coupon management
│   │       ├── users.js                    # RBAC user management
│   │       ├── audit.js                    # Audit trail
│   │       ├── notifications.js            # Notification centre
│   │       ├── settings.js                 # Rules, flags, CMS, SEO, FAQs, templates
│   │       ├── reconciliation.js           # Payment reconciliation
│   │       ├── returns.js                  # Returns dashboard
│   │       ├── calendar.js                 # Merchant calendar
│   │       ├── system-health.js            # System health monitor
│   │       └── knowledge-base.js           # SOPs
│
├── server/
│   ├── package.json / .env / .env.example
│   ├── server.js                           # Express app: middleware chain, route mounting
│   ├── db.js                               # SQLite: WAL, FK, schema init, migration runner
│   ├── seed.js                             # Roles, permissions, super admin, default warehouse, workflows, automations, templates
│   │
│   ├── core/                               # ──── CROSS-CUTTING INFRASTRUCTURE ────
│   │   ├── eventBus.js                     # Domain event emitter + persistence to domain_events
│   │   ├── workflowEngine.js               # State machine: validate transitions, enforce roles, trigger auto_actions
│   │   ├── automationEngine.js             # Rule evaluator: on event → check conditions → execute actions
│   │   ├── templateEngine.js               # Handlebars renderer: load template from DB → render with data → return HTML/PDF
│   │   └── archiveManager.js               # Scheduled: soft-archive old records based on archive_rules
│   │
│   ├── middleware/
│   │   ├── auth.js                         # JWT verification
│   │   ├── rbac.js                         # requirePermission() factory
│   │   ├── audit.js                        # Automatic audit_logs on mutations
│   │   ├── featureFlag.js                  # requireFeature() factory
│   │   ├── softDelete.js                   # Adds WHERE deleted_at IS NULL to queries
│   │   └── rateLimit.js                    # Rate limiting
│   │
│   ├── services/                           # ──── BUSINESS LOGIC (stateless, testable) ────
│   │   ├── inventoryService.js             # Perpetual ledger: reserve, consume, receive, adjust, audit
│   │   ├── orderService.js                 # Order lifecycle via workflowEngine, emits domain events
│   │   ├── analyticsService.js             # OLAP sync: subscribes to events, updates aggregation tables
│   │   ├── couponService.js                # Validation, application, usage tracking
│   │   ├── shippingService.js              # Rule evaluation engine
│   │   ├── taxService.js                   # GST: CGST/SGST vs IGST
│   │   ├── segmentationService.js          # Customer segment computation
│   │   ├── healthScoreService.js           # 0–100 score calculator
│   │   ├── closingReportService.js         # Nightly PDF via templateEngine
│   │   ├── notificationService.js          # SMS/WhatsApp/Email (subscribes to events)
│   │   └── systemMonitorService.js         # Health checks: Razorpay, Twilio, DB, disk, jobs
│   │
│   ├── controllers/                        # ──── ROUTE HANDLERS (thin) ────
│   │   ├── authController.js
│   │   ├── storeController.js
│   │   ├── cartController.js
│   │   ├── orderController.js
│   │   ├── osAuthController.js
│   │   ├── osDashboardController.js
│   │   ├── osOrderController.js
│   │   ├── osPackingController.js
│   │   ├── osFulfilmentController.js
│   │   ├── osProductController.js
│   │   ├── osInventoryController.js
│   │   ├── osCustomerController.js
│   │   ├── osComplaintController.js
│   │   ├── osReviewController.js
│   │   ├── osAnalyticsController.js
│   │   ├── osReportController.js
│   │   ├── osCouponController.js
│   │   ├── osUserController.js
│   │   ├── osAuditController.js
│   │   ├── osSettingsController.js          # Includes workflow config, automation rules, templates
│   │   ├── osReconciliationController.js
│   │   ├── osReturnController.js
│   │   ├── osCalendarController.js
│   │   ├── osSystemController.js            # System health, scheduled jobs, archive management
│   │   └── osKnowledgeBaseController.js
│   │
│   └── utils/
│       ├── pdfGenerator.js                 # Uses templateEngine for all document types
│       ├── qrGenerator.js
│       ├── csvExporter.js
│       └── numberGenerator.js
│
├── uploads/
│   ├── products/ / reviews/ / complaints/ / documents/
│
├── Dockerfile / deploy.sh / ecosystem.config.js / nginx.conf
```

---

## 5. API Routes

Same as previous version with the following additions:

```
── System Health & Admin ──
GET  /api/os/system/health                  All integration health checks (Razorpay, Twilio, SMTP, DB, disk)
GET  /api/os/system/jobs                    Scheduled job statuses
POST /api/os/system/jobs/:id/run            Manually trigger a scheduled job
GET  /api/os/system/storage                 DB size, upload storage, document vault size
POST /api/os/system/archive/run             Manually trigger archive for an entity type

── Workflow Configuration ──
GET  /api/os/workflows                      List workflow definitions
GET  /api/os/workflows/:key                 Get workflow with states & transitions
PUT  /api/os/workflows/:key                 Update workflow definition (add/remove states, transitions)

── Automation Rules ──
GET  /api/os/automations                    List automation rules
POST /api/os/automations                    Create rule
PUT  /api/os/automations/:id                Update rule
PUT  /api/os/automations/:id/toggle         Enable/disable rule

── Document Templates ──
GET  /api/os/templates                      List document templates
GET  /api/os/templates/:key                 Get template HTML + CSS
PUT  /api/os/templates/:key                 Update template
GET  /api/os/templates/:key/preview         Preview template with sample data

── Domain Events (Debug/Replay) ──
GET  /api/os/events                         Query domain events (filter: type, aggregate, date)
POST /api/os/events/replay/:id              Replay a specific event through all subscribers
```

All other routes from the previous version remain unchanged.

---

## 6. Business Health Score Algorithm

```
Health Score = (Fill Rate × 0.25) + (Dispatch SLA × 0.25) + (Complaint Score × 0.20)
             + (Return Score × 0.15) + (Revenue Velocity × 0.15)

Where:
  Fill Rate Score       = (fulfilled_without_stockout / total_orders) × 100
  Dispatch SLA Score    = (dispatched_within_24h / total_dispatched) × 100
  Complaint Score       = max(0, 100 - (complaint_rate × 1000))
  Return Score          = max(0, 100 - (return_rate × 500))
  Revenue Velocity      = min(100, (today_revenue / 30d_avg_daily) × 100)

Interpretation:
  90–100: Excellent
  75–89:  Good
  50–74:  Warning
  <50:    Critical
```

---

## 7. UI Design System

| Token | Value | Usage |
|---|---|---|
| `--os-bg` | `#09090b` | Page background |
| `--os-surface` | `#18181b` | Cards, sidebar |
| `--os-surface-hover` | `#27272a` | Hover states |
| `--os-border` | `#3f3f46` | Borders |
| `--os-text` | `#fafafa` | Primary text |
| `--os-text-muted` | `#a1a1aa` | Secondary text |
| `--os-text-dim` | `#71717a` | Captions |
| `--os-accent` | `#f59e0b` | Primary action (Saffron) |
| `--os-success` | `#10b981` | PAID, DELIVERED |
| `--os-warning` | `#f59e0b` | PENDING, Low stock |
| `--os-danger` | `#ef4444` | FAILED, Critical |
| `--os-info` | `#3b82f6` | Links, COD |
| `--os-font-sans` | `'Inter', system-ui` | UI text |
| `--os-font-mono` | `'JetBrains Mono'` | Numbers, SKUs |

**Keyboard shortcuts**: `Ctrl+K` (Command Palette), `/` (Search), `N` (New), `P` (Print), `D` (Dispatch), `Esc` (Close).

---

## Proposed Changes

### Phase 1: Foundation — DB, Events, Auth, RBAC, Workflows

#### [NEW] [db.js](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/server/db.js)
Schema init (50+ tables), WAL mode, FK enforcement, migration runner.

#### [NEW] [seed.js](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/server/seed.js)
Roles, permissions, super admin, default warehouse, workflow definitions (order/complaint/return lifecycles), default automation rules, default document templates, default feature flags, default shipping/tax rules, archive rules.

#### [NEW] [core/eventBus.js](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/server/core/eventBus.js)
In-process EventEmitter wrapper. Persists every event to `domain_events`. Registers subscribers on boot.

#### [NEW] [core/workflowEngine.js](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/server/core/workflowEngine.js)
Generic state machine: `transition(workflowKey, entityId, currentState, targetState, userId)`. Validates against `workflow_definitions`, checks role permissions for the transition, executes `auto_actions`, emits domain event.

#### [NEW] [core/automationEngine.js](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/server/core/automationEngine.js)
Subscribes to all domain events. Evaluates `automation_rules` conditions. Executes configured actions (notifications, task creation, status updates).

#### [NEW] [core/templateEngine.js](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/server/core/templateEngine.js)
Loads Handlebars templates from `document_templates`. Renders HTML with data context. Outputs HTML or PDF.

#### [NEW] [core/archiveManager.js](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/server/core/archiveManager.js)
Reads `archive_rules`. Sets `is_archived = 1, archived_at = NOW()` on records older than threshold. Runs as scheduled job.

#### [NEW] middleware: [auth.js](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/server/middleware/auth.js), [rbac.js](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/server/middleware/rbac.js), [audit.js](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/server/middleware/audit.js), [featureFlag.js](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/server/middleware/featureFlag.js), [softDelete.js](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/server/middleware/softDelete.js)
JWT, RBAC, audit logging, feature gating, soft-delete query filtering.

#### [MODIFY] [server.js](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/server/server.js)
Refactor to modular route mounting. Boot event bus. Register event subscribers. Initialize scheduled jobs.

---

### Phase 2: Product CMS, Media Library & Perpetual Inventory

#### [NEW] [controllers/osProductController.js](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/server/controllers/osProductController.js)
Product CRUD with variants, barcodes, media linking. Soft delete on archive. Approval workflow for price changes.

#### [NEW] [services/inventoryService.js](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/server/services/inventoryService.js)
Perpetual ledger engine: `reserveStock()`, `consumeOnInvoice()`, `receiveBatch()`, `adjustAudit()`, `releaseReservation()`. All operations scoped to `warehouse_id`. Emits `BatchReceived`, `StockLow`, `StockDepleted`.

#### [NEW] [controllers/storeController.js](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/server/controllers/storeController.js)
Public APIs: products, homepage CMS, FAQs, SEO. Filters `deleted_at IS NULL` and `status = 'active'`.

#### [MODIFY] [index.html](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/index.html) + [product.html](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/product.html)
Remove hardcoded products. Fetch from CMS APIs.

---

### Phase 3: OMS, Fulfilment, Shipping/Tax Rules & Documents

#### [NEW] [services/orderService.js](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/server/services/orderService.js)
Order lifecycle via `workflowEngine.transition()`. Emits domain events. On `InvoiceGenerated`: calls `inventoryService.consumeOnInvoice()` + `templateEngine.render('invoice')` + stores in `document_vault`.

#### [NEW] Controllers: osOrderController, osPackingController, osFulfilmentController
OMS list/detail/bulk, packing queue, dispatch with courier + tracking.

#### [NEW] [utils/pdfGenerator.js](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/server/utils/pdfGenerator.js)
Delegates to `templateEngine` for all document types. Packing slips include QR code from `qrGenerator.js`.

#### [NEW] Services: shippingService, taxService, couponService
Rule evaluation engines. All configurable from DB.

#### [MODIFY] [checkout.html](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/checkout.html)
Multi-address selector, order notes, gift options, coupon input, dynamic shipping/tax calculation.

---

### Phase 4: CRM, Complaints, Reviews & Growth

#### [NEW] Controllers: osCustomerController, osComplaintController, osReviewController, osCouponController
CRM profiles, complaint tickets, review moderation (no delete), coupon management.

#### [NEW] [services/segmentationService.js](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/server/services/segmentationService.js)
Auto-segment: NEW → REPEAT → VIP → INACTIVE. Subscribes to `OrderDelivered` events.

#### [NEW] Services: notificationService
Subscribes to domain events. Sends SMS/WhatsApp/Email based on event type and automation rules.

---

### Phase 5: OLAP Analytics, Reports & Merchant Intelligence

#### [NEW] [services/analyticsService.js](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/server/services/analyticsService.js)
OLAP sync: subscribes to domain events, updates `analytics_daily_metrics`, `analytics_sku_velocity`, `analytics_customer_cohorts`, `analytics_region_performance`.

#### [NEW] [services/healthScoreService.js](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/server/services/healthScoreService.js) + [services/closingReportService.js](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/server/services/closingReportService.js)
Health Score calculator. Nightly closing report via `templateEngine`.

#### [NEW] [services/systemMonitorService.js](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/server/services/systemMonitorService.js)
Periodic health checks: Razorpay API ping, Twilio status, SMTP connection, DB PRAGMA integrity_check, disk usage. Writes to `system_health_checks`.

#### [NEW] Controllers: osDashboardController, osAnalyticsController, osReportController, osSystemController
Dashboard reads OLAP only. System health reads `system_health_checks` and `scheduled_jobs`.

---

### Phase 6: Merchant OS Frontend SPA

#### [NEW] [merchant-os/](file:///c:/Users/deepa/Downloads/House%20of%20Singhana/merchant-os/)
Complete SPA: dark mode design system, permission-gated sidebar, 20+ modules, Command Palette, keyboard shortcuts, system health panel.

---

## Verification Plan

### Automated Tests
1. **Event-driven decoupling**: Emit `InvoiceGenerated` → verify inventory consumed, analytics updated, notification queued, document generated — all independently.
2. **Workflow engine**: Attempt `RECEIVED → DISPATCHED` (skipping steps) → expect rejection. Attempt transition with `packing_staff` role on a merchant-only transition → expect `403`.
3. **Soft delete**: Delete a product → verify `deleted_at` set → verify product no longer appears in store API → verify product still visible in OS audit view.
4. **Multi-warehouse schema**: Create second warehouse → receive batch into it → verify `inventory_summary` has separate rows per warehouse for same variant.
5. **RBAC + Feature Flags**: Disable `module_gift_orders` flag → verify gift-related fields rejected at order creation API.
6. **Perpetual ledger integrity**: Full cycle: receive batch → place order (reservation) → invoice (consumption + batch link) → verify all ledger entries and balances.
7. **Automation engine**: Create rule "notify merchant on StockLow" → receive batch that leaves stock below reorder → verify notification created.
8. **Template engine**: Update invoice template HTML → generate invoice → verify new layout renders correctly.
9. **Idempotency checks**: Post order creation twice with the same `idempotency_key` → verify the second request is rejected or returns the identical cached response without creating a duplicate order.
10. **Bounded Context validation**: Ensure code directories strictly avoid cross-domain direct writes (e.g. Orders controller writing directly to inventory summary without using inventoryService) via validation checks or code review.

### Manual Verification
1. **30-second dispatch**: Dispatch executive processes order in under 30 seconds.
2. **60-second health check**: Merchant sees Health Score, KPIs, and alerts within 60 seconds of login.
3. **System health panel**: Navigate to System Health → see green/yellow/red status for each integration.
4. **Packing slip QR**: Print → scan → opens order in Merchant OS.
5. **Command Palette**: `Ctrl+K` → type order number → navigates to order.
