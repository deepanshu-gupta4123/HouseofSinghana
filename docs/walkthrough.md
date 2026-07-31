# Walkthrough — Phase 1: Core Database & Infrastructure

We have successfully completed and verified the first phase of the **Merchant OS v1.0** implementation. This phase builds the core, cross-cutting software engineering foundations specified in the architecture blueprint.

## 1. Accomplishments

### 1.1 Database Architecture (`server/db.js` & `server/dbInit.js`)
*   Implemented `server/db.js` wrapping the Node SQLite3 database connection inside clean, transaction-safe Promise API queries (`run`, `get`, `all`, `exec`, `transaction`).
*   Configured SQLite connection options to enforce `foreign_keys=ON` and `journal_mode=WAL` on connection startup to support high read/write concurrency.
*   Implemented `server/dbInit.js` containing full schema generation statements for all 12 domains (50+ tables), integrating the required soft-delete (`deleted_at`), archival (`is_archived`, `archived_at`), and temporal audit fields (`created_by`, `updated_by`, `created_at`, `updated_at`).

### 1.2 DB Seeding Engine (`server/seed.js`)
*   Seeded all 8 operational roles (`super_admin`, `merchant`, `ops_manager`, `dispatch_exec`, `packing_staff`, `customer_support`, `accountant`, `marketing`) and their mapped permission matrices.
*   Generated a default Super Admin user account (`admin@houseofsinghana.com`) with a securely hashed password.
*   Seeded default system feature flags, tax rules, warehouse locations, and document layouts.

### 1.3 Event-Driven Architecture (`server/core/eventBus.js`)
*   Implemented a unified, decoupled event router module wrapping Node's `EventEmitter`.
*   Integrated automatic logging of emitted events to the persistent `domain_events` table for transaction history tracking and eventual replay.

### 1.4 Configurable State Workflows (`server/core/workflowEngine.js`)
*   Built a generic state transition verification engine that checks request states against JSON configurations stored in `workflow_definitions`. Enforces user role permission checks per transition.

### 1.5 Handlebars Rendering & Automation Engine (`server/core/templateEngine.js` & `automationEngine.js`)
*   Created a Handlebars document compiler rendering dynamic invoices, picking slips, and reports from database-stored HTML.
*   Implemented the trigger-condition-action automation engine evaluating rules on domain events.

### 1.6 Core Security & Audit Middlewares (`server/middleware/*`)
*   `auth.js` & `rbac.js`: Formulated JWT checks and permission mapping middleware.
*   `audit.js`: Automated audit trail logging mapping old and new change sets.
*   `softDelete.js`: Query scope utility filtering soft-deleted data.
*   `featureFlag.js`: Feature-gate request interceptor.

---

## 2. Validation & Verification

1.  **DB Initialization & Seeding**:
    *   Executed `node server/seed.js` against a clean database instance. The runner successfully generated the WAL-mode file, created all tables sequentially, and populated the initial system records:
        ```bash
        Initializing database schema...
        Database schema successfully initialized.
        Seeding initial data...
        Initial data seeded successfully.
        ```
2.  **App Server Boot**:
    *   Refactored `server/server.js` to initialize the database connection helper and the automation engine.
    *   Booted the app server (`node server/server.js`), which started successfully on port 3000:
        ```bash
        [AutomationEngine] Initializing rules engine...
        TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not found. Running in MOCK mode for SMS/WhatsApp.
        Server is running on http://localhost:3000
        Environment: development
        ```

---

## 3. Phase 2 Accomplishments

### 2.1 Product & Category Domain Services (`osProductController.js`)
*   Created full admin CRUD endpoints for Categories, Products, and Variants.
*   Enforced standard temporal columns (`created_by`, `updated_by`, `created_at`, `updated_at`) and soft-delete updates (`deleted_at = CURRENT_TIMESTAMP`) on category and product deletions.
*   Implemented **Price Approval logic**: If a non-supervisor (non-`super_admin`/`merchant`) role attempts to modify a product or variant's base price, the controller places a `PRICE_UPDATE` approval record in the `approval_requests` table, deferring the live database price mutation until supervisor approval.

### 2.2 Media Library with Deduplication (`osMediaController.js`)
*   Created the Media Library controller integrated with `multer` to handle binary uploads.
*   Implemented **SHA-256 Checksum validation**: When a file is uploaded, the controller calculates its checksum. If it matches an active database file, the temporary upload is immediately deleted from disk, and the database record refers to the existing file.

### 2.3 Perpetual Inventory Ledger Engine (`inventoryService.js` & `osInventoryController.js`)
*   Developed the central business logic for transactional stock movements:
    *   `reserveStock()`: Reserves quantity for new orders without altering current stock (Current - Reserved = Available).
    *   `releaseReservation()`: Frees reserved stock upon cancellations.
    *   `consumeOnInvoice()`: Enforces **FIFO batch matching** against passed procurement batches, deducting `current_stock` and `reserved_stock`.
    *   `receiveBatch()`: Enters new batch records into `inventory_batches` and updates ledger history.
    *   `adjustAudit()`: Reconciles physical count variances via the ledger (`STOCK_ADJUSTMENT`).
*   Configured threshold alarms to emit `StockLow` and `StockDepleted` events automatically.

### 2.4 Catalog API & Dynamic Bindings (`storeController.js`, `main.js`, `product.html`)
*   Exposed visible-only, active endpoints for catalog products, slugs, homepage config, FAQs, and SEO paths.
*   Refactored customer-facing templates (`index.html`, `product.html`) to dynamically query `/api/store/products` via client AJAX, mapping quantities, variants, and prices directly to the database.

---

## 4. Phase 2 Verification

1.  **Multer File Upload**:
    *   Installed `multer` package dependencies in `package.json`.
    *   Verified checksum deduplication: Uploading the exact same image twice successfully returns the identical asset reference and deletes the duplicate file on disk.
2.  **AJAX Catalog Binding**:
    *   Booted backend and opened `index.html` / `product.html`. Dynamic products query API loaded database records correctly, populated variants selection dynamically, and updated prices per size conversion.
3.  **Audit Logs Integration**:
    *   Verified CRUD operations automatically record audit records mapping `old_values` and `new_values` JSON structures.

---

## 5. Phase 3 Accomplishments

### 3.1 Order Bounded-Context Domain Service (`orderService.js`)
*   Developed core business logic for order checkout creation and state transitions.
*   Wired transaction-safe inventory reservation commits during checkout.
*   Enforced automatic Handlebars invoice HTML document generation on invoiced transitions, archiving file mappings in the `document_vault`.

### 3.2 OMS Operations Controllers
*   Created CRUD and bulk action routing endpoints (`osOrderController.js`) to list and detail transactions.
*   Built packing queue routing (`osPackingController.js`) and dispatch courier assignments (`osFulfilmentController.js`).

### 3.3 Document Printing & Calculations (`pdfGenerator.js`, `taxService.js`, `shippingService.js`, `couponService.js`)
*   Created tax, shipping, and coupon validation engines checking pincodes, first-order exclusions, and HSN-based GST rules.
*   Added `pdfGenerator.js` rendering dynamic templates directly into printable HTML structures within the vault.

### 3.4 Checkout Page Dynamic Integration (`checkout.html`)
*   Refactored checkout views to support:
    *   **Multiple Saved Address Profiles**: Select from Home, Office, Parents, or add new profiles.
    *   **Order notes guidelines input**.
    *   **Gift Selection options**: Include custom messages, premium packaging (+₹50), and hide pricing invoices.
    *   **Live Coupon previews and recalculations**.

---

## 6. Phase 3 Verification

1.  **Saved Address & Checkout Lifecycle**:
    *   Verified customer addresses load dynamically via client AJAX.
    *   Tested checkout flow: Submitting an order creates reservations in the inventory summary, populates the order items list, and emits the `OrderPlaced` domain event.
2.  **Calculations Verification**:
    *   Verified coupon codes check first-order rules, minimum value checks, and compute percentage discounts correctly.
    *   Verified tax amount dynamically calculates 5% inclusive GST.

---

## 7. Phase 4 Accomplishments

### 4.1 Customer CRM profiles & segmentation (`osCustomerController.js`)
*   Created customer aggregation endpoints displaying lifetime total spends and orders volume metrics.
*   Enforced automated event-driven segmentation: subscribing to `OrderPlaced` and `OrderCompleted` recalculates customer status (e.g. `NEW` -> `REPEAT` -> `VIP`) based on order count and spend.

### 4.2 SLA-backed Complaint Ticketing (`osComplaintController.js`)
*   Created customer ticket submission and tracking services.
*   Wired dynamic SLA calculations mapping priorities (HIGH = 24h, MEDIUM = 48h, LOW = 72h) to expiration logs, sorting queues by SLA urgency automatically.

### 4.3 Auditable Reviews CMS (`osReviewController.js`)
*   Enforced standard "no deletion" product review moderation: reviews can be `APPROVED`, `HIDDEN`, or `ARCHIVED` but never hard-deleted.
*   Added official merchant response logs.

### 4.4 Communication Dispatcher Service (`notificationService.js`)
*   Created system pub-sub subscribers mapping `OrderPlaced`, `InvoiceGenerated`, `OrderDispatched`, and `ComplaintRaised` events to email, SMS, and WhatsApp mock outputs.

---

## 8. Phase 4 Verification

1.  **Automated CRM Segmentation**:
    *   Verified placing orders automatically recalculates customer metrics and transitions tags to `REPEAT` or `VIP` dynamically.
2.  **Complaint SLAs & Urgency Sorting**:
    *   Tested complaint log creation. Verified high-priority tickets receive a 24-hour expiration offset and sort to the top of list queues.
3.  **No Deletion Review Moderation**:
    *   Verified setting review status to `HIDDEN` hides it from public storefront display while preserving the audit record in the database.

---

## 9. Phase 5 Accomplishments

### 5.1 Decoupled Analytics Aggregator (`analyticsService.js`)
*   Developed an out-of-band metrics aggregator subscribing to transactional database events.
*   Enforced automatic, real-time recalculations for daily metrics and product SKU velocity metrics, separating OLTP and OLAP workloads.

### 5.2 Automated Reports & Health Score (`closingReportService.js` & `healthScoreService.js`)
*   Implemented a nightly closing report generator compiling daily subtotals, active tickets, and low-stock indicators into structured vault records.
*   Created a system health score calculator assessing low stock items, breached complaint tickets, and pricing approvals queues to compute a system-wide score (0-100).

### 5.3 Technical System Monitor (`systemMonitorService.js`)
*   Added diagnostic hooks executing SQLite integrity tests, checking journal modes, tracking active vault disk capacities, and checking query latency.

### 5.4 Intelligence Dashboards APIs (`osIntelligenceController.js`)
*   Created controller actions routing unified summaries, velocity charts data, and closing reports to dashboard interfaces.

---

## 10. Phase 5 Verification

1.  **Event-Driven Aggregations**:
    *   Verified order placement triggers immediate recalculations in daily sales totals and product velocity rows without slowing primary checkout operations.
2.  **Diagnostics & Health Checks**:
    *   Tested technical diagnostics: confirmed `PRAGMA integrity_check` resolves successfully, WAL mode is active, and database file sizes log correctly.
3.  **Closing Report Outputs**:
    *   Verified report compiler writes beautifully structured HTML files to the document vault.

---

## 11. Phase 6 Accomplishments

### 6.1 Core OS SPA Workspace Setup (`admin.html`)
*   Refactored the old admin dashboard into a stunning, responsive, dark-themed Single Page Application.
*   Constructed a glassmorphic sidebar layout supporting clean tab switching for Overview, Orders (OMS), Inventory, CRM, Support Complaints, and Review Moderation.

### 11.2 Command Palette & Keyboard Hooks
*   Integrated a desktop-grade command palette overlay triggered by pressing `Ctrl + K`.
*   Supports live lookup commands to switch views quickly, trigger manual system diagnostics, or generate daily closing reports.

### 11.3 Admin Controls Integrations
*   Built dialog prompts allowing operators to receive incoming procurement batches, adjust inventory totals post physical counts, assign complaints, moderate reviews, and write merchant response guidelines.

---

## 12. Phase 6 Verification

1.  **Tab Switching & Data Hydration**:
    *   Verified navigating sidebar links dynamically updates titles and hydrates the appropriate SQLite queues via AJAX calls.
2.  **Command Palette Triggering**:
    *   Tested pressing `Ctrl + K`: command menu opens cleanly, filters results by query input, and runs navigation/diagnostic hooks successfully.
3.  **Modals Commit Lifecycles**:
    *   Tested log submission forms: confirmed entering procurement details writes batches to the database and re-hydrates the ledger view immediately.

---

## 13. GTM Marketing Extensions (Loyalty, Wishlists, Waitlists & Recovery)

### 13.1 Referral Reward System (`referralService.js`)
*   Refactored customer sign-up to support referral code entry, attributing references in the `customers` database.
*   Wired auto-action: when a referred customer's order transitions to `DELIVERED`, the system automatically awards the referrer a unique single-use ₹200 discount coupon restricted to their customer profile.

### 13.2 Out-of-Stock "Notify Me" Waitlist (`waitlistService.js`)
*   Created public notification endpoints capturing customer emails for out-of-stock items.
*   Activated auto-action: when a batch receipt event (`BatchReceived`) occurs, checks waiting lists and dispatches mock back-in-stock emails/SMS notifications to customers.

### 13.3 Customer Wishlists
*   Created add, delete, and list wishlist routes (`GET`, `POST`, `DELETE` at `/api/store/wishlist`) allowing customer accounts to save items for future checkouts.

### 13.4 Abandoned Cart Recovery (`cartRecoveryService.js`)
*   Wired customer cart synchronization endpoints.
*   Added a background scanner thread running every 5 minutes that flags carts updated over 30 minutes ago as abandoned, automatically sending recovery reminders.

---

## 14. Verification of GTM Systems

1.  **Referrals & Discount Rewards**:
    *   Verified completing checkout for a referred customer creates the referral record and inserts a flat ₹200 reward coupon associated with the referrer's ID.
2.  **Back-in-Stock Alerts**:
    *   Verified logging batch receipt for out-of-stock variants instantly triggers waitlist alerts and updates interest records to `NOTIFIED`.
3.  **Cart Recovery Scanners**:
    *   Tested cart sync: syncing cart logs entries in `customer_carts`. Placing an order successfully clears the recovery record.

---

## 15. Phase 7: Configuration, Administration & System APIs

### 15.1 Unified Backoffice & Storefront Authentication
*   Developed a smart, unified auth login API `/api/auth/login` that resolves authentication scopes for both backoffice users (`scope: os`) and store customers (`scope: customer`).
*   Wired the client-side login redirection in `login.html` to automatically route administrators to `admin.html` and customers to `index.html`.
*   Aligned backoffice user elevation utility `make-admin.js` to assign standard RBAC roles (`super_admin`) directly.

### 15.2 Domain Schema Alignment & Resilient Checkout
*   Refactored `osReviewController.js` and `analyticsService.js` to exactly match on-disk schema columns (mapping `metric_date`, `orders_count`, `gross_revenue`, `review_text`, and `complaints_opened` correctly).
*   Corrected the `customer_addresses` query parameter naming fields (`label` and `recipient_phone`) and inserted fallback mappings to retain backward compatibility for `checkout.html`.
*   Designed a dynamic `variant_id` resolver inside `orderService.js` supporting both numeric variant IDs and composite storefront keys (e.g. `coriander-100g-Standard Blend`) to parse and calculate multiplier margins.

### 15.3 Diagnostics & Replay Control
*   Added system diagnostics APIs `/api/os/system/health`, `/api/os/system/jobs`, `/api/os/system/storage`, and debug event logging `/api/os/events` with manual replay options.
*   Added structured utilities (`qrGenerator.js`, `csvExporter.js`, `numberGenerator.js`) supporting PDF invoices, picking slips, and report downloads.
