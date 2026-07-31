# Phase 1 Checklist: Core Database & Infrastructure

- `[x]` **1.1 Bounded-Context Database Setup (`server/db.js`)**
    - `[x]` Setup SQLite configuration with WAL mode and foreign key support
    - `[x]` Implement schema migration runner for all 12 domains (50+ tables)
- `[x]` **1.2 Database Seeding Engine (`server/seed.js`)**
    - `[x]` Seed default Roles and Permissions (Super Admin, Merchant, etc.)
    - `[x]` Seed initial Workflow definitions, Automation rules, default Document templates, and Feature flags
    - `[x]` Seed default Warehouse ("Singhana Main Hub") and standard Tax & Shipping rules
    - `[x]` Seed Product Catalog (Chilli, Turmeric, Coriander), Variants, and Inventory Stock
- `[x]` **1.3 Event Bus Infrastructure (`server/core/eventBus.js`)**
    - `[x]` Build persistent event bus wrapper around Node's EventEmitter
    - `[x]` Implement automatic `domain_events` table storage for event logging and replay
- `[x]` **1.4 Configurable Workflow Engine (`server/core/workflowEngine.js`)**
    - `[x]` Build state machine transition logic checking roles and definitions
    - `[x]` Support auto-actions and transition event emission
- `[x]` **1.5 Template & Automation Engine (`server/core/templateEngine.js` & `automationEngine.js`)**
    - `[x]` Implement DB-stored Handlebars document template rendering
    - `[x]` Implement database-driven Trigger-Condition-Action automation engine
- `[x]` **1.6 Archive Manager (`server/core/archiveManager.js`)**
    - `[x]` Read archive_rules from DB, soft-archive records older than threshold
    - `[x]` Support per-entity and bulk archival runs
- `[x]` **1.7 Security & Audit Middleware (`server/middleware/*`)**
    - `[x]` JWT validator (`auth.js`) & RBAC middleware (`rbac.js`)
    - `[x]` Automatic change logging wrapper (`audit.js`)
    - `[x]` Query soft-delete scope injector (`softDelete.js`)
    - `[x]` Feature flag gates (`featureFlag.js`)
- `[x]` **1.8 Server Entry Refactoring (`server/server.js`)**
    - `[x]` Wire routes, boot the event bus, and register lifecycle hooks

# Phase 2 Checklist: Product CMS, Media Library & Perpetual Inventory Ledger

- `[x]` **2.1 Product & Category Domain Services and APIs**
    - `[x]` Build CRUD controllers and services for Categories & Products (`osProductController.js`)
    - `[x]` Implement soft-delete and temporal logging on Category/Product updates
    - `[x]` Integrate approval workflows on price updates (triggers `approval_requests` if price changes)
- `[x]` **2.2 Media Library Service (`osMediaController.js`)**
    - `[x]` Build media file upload handling with SHA-256 checksum deduplication
    - `[x]` Map library assets to products and variants
- `[x]` **2.3 Perpetual Inventory Ledger Engine (`server/services/inventoryService.js`)**
    - `[x]` Implement `reserveStock()`, `releaseReservation()`, and `consumeOnInvoice()`
    - `[x]` Implement batch receipt (`receiveBatch()`) and manual audits (`adjustAudit()`)
    - `[x]` Wire event publication hooks for `BatchReceived`, `StockLow`, and `StockDepleted`
- `[x]` **2.4 Inventory and Procurement Controllers**
    - `[x]` Build endpoints to browse ledger history and batch records (`osInventoryController.js`)
    - `[x]` Implement physical stock audit adjustments
- `[x]` **2.5 Public Store Catalog APIs**
    - `[x]` Expose public endpoints for homepage sections, active products, and FAQs (`storeController.js`)
    - `[x]` Update `index.html` and `product.html` to load catalog details dynamically

# Phase 3 Checklist: OMS, Fulfilment, Shipping/Tax Rules & Documents

- `[x]` **3.1 Order Bounded-Context Domain Service (`server/services/orderService.js`)**
    - `[x]` Build order workflow status transition interface
    - `[x]` Wire auto-actions: reserve stock on placement, consume FIFO batches on invoice
    - `[x]` Support Handlebars document generation and auto-archiving to `document_vault`
- `[x]` **3.2 OMS Operations Controllers**
    - `[x]` Build Order CRUD and bulk action routing endpoints (`osOrderController.js`)
    - `[x]` Build Packing queue list and status update endpoints (`osPackingController.js`)
    - `[x]` Build Fulfilment dispatch courier assignment endpoints (`osFulfilmentController.js`)
- `[x]` **3.3 Document Printing Utility (`server/utils/pdfGenerator.js`)**
    - `[x]` Implement HTML-to-PDF compiler for tax invoices, picking lists, and labels
- `[x]` **3.4 Shipping, Tax & Coupon Calculation Engines**
    - `[x]` Build DB-configurable tax rules computation service (`taxService.js`)
    - `[x]` Build dynamic shipping rules selector (`shippingService.js`)
    - `[x]` Build coupon validation engine with region/expiry guards (`couponService.js`)
- `[x]` **3.5 Checkout Page Dynamic Integration (`checkout.html`)**
    - `[x]` Render multi-address profiles, order notes, and gift packages options
    - `[x]` Calculate dynamic coupons, taxes, and shipping fees via AJAX

# Phase 4 Checklist: CRM, Complaints, Reviews & Growth

- `[x]` **4.1 Customer CRM profiles & segmentation (`osCustomerController.js`)**
    - `[x]` Customer detail profiles and order history aggregation
    - `[x]` Subscribes to order triggers to auto-segment customers (New -> Repeat -> VIP -> Inactive)
- `[x]` **4.2 Segmentation Service (`server/services/segmentationService.js`)**
    - `[x]` Automatic lifecycle segmentation NEW → REPEAT → VIP → INACTIVE
    - `[x]` Event-driven recalculation on OrderDelivered/OrderCancelled
    - `[x]` Bulk recalculation as scheduled job
- `[x]` **4.3 SLA-backed Complaint Ticketing (`osComplaintController.js`)**
    - `[x]` Customer ticket creation and SLA tracking
    - `[x]` Ticketing state transitions (Open -> Assigned -> Resolving -> Closed)
- `[x]` **4.4 Auditable Reviews CMS (`osReviewController.js`)**
    - `[x]` Customer review moderation: Approve, Hide, Archive (No delete ever policy)
    - `[x]` Official merchant response logs
- `[x]` **4.5 Communication Dispatcher Service (`services/notificationService.js`)**
    - `[x]` Automated email/SMS/WhatsApp dispatching mapped to domain triggers
- `[x]` **4.6 GTM Growth Extensions**
    - `[x]` Referral reward system (`referralService.js`)
    - `[x]` Out-of-stock waitlist notifications (`waitlistService.js`)
    - `[x]` Customer wishlists APIs
    - `[x]` Abandoned cart recovery (`cartRecoveryService.js`)

# Phase 5 Checklist: OLAP Analytics, Reports & Merchant Intelligence

- `[x]` **5.1 Decoupled Analytics Aggregator (`services/analyticsService.js`)**
    - `[x]` Listen to event hooks and update `analytics_daily_metrics` and `analytics_sku_velocity`
- `[x]` **5.2 Automated Reports & Health Metrics (`services/closingReportService.js` & `healthScoreService.js`)**
    - `[x]` Nightly closing report PDF creation and email dispatch
    - `[x]` Merchant OS operational Health Score calculator
- `[x]` **5.3 Technical System Monitor (`services/systemMonitorService.js`)**
    - `[x]` API integration ping tests, DB WAL integrity check, disk capacity track
- `[x]` **5.4 Intelligence Dashboards APIs**
    - `[x]` Endpoints for analytic indicators, logs, and calendar schedules

# Phase 6 Checklist: Merchant OS Frontend SPA

- `[x]` **6.1 Core OS SPA Workspace Setup (`admin.html`)**
    - `[x]` Command palette, keyboard hooks, dark theme surface design
- `[x]` **6.2 Module Renders**
    - `[x]` Implement 20+ feature boards (Dashboard, OMS, Inventory, CMS, Health, etc.)

# Phase 7 Checklist: Configuration, Administration & System APIs

- `[x]` **7.1 Coupon Management Controller (`osCouponController.js`)**
    - `[x]` Full CRUD: list, detail, create, update, soft-delete coupons
    - `[x]` Usage history tracking per coupon
- `[x]` **7.2 Audit Trail Controller (`osAuditController.js`)**
    - `[x]` Read-only audit log browsing with entity/user/action filters
    - `[x]` Per-entity audit trail inspection
- `[x]` **7.3 Workflow Configuration APIs**
    - `[x]` List, get, and update workflow definitions (JSON state machines)
- `[x]` **7.4 Automation Rules APIs**
    - `[x]` CRUD for automation rules with enable/disable toggle
- `[x]` **7.5 Document Template APIs**
    - `[x]` List, get, update templates with live preview using sample data
- `[x]` **7.6 Domain Events Debug & Replay**
    - `[x]` Query domain events with type/aggregate filters
    - `[x]` Replay specific events through all subscribers
- `[x]` **7.7 System Health & Admin APIs**
    - `[x]` Integration health checks (Razorpay, Twilio, SMTP, DB, disk)
    - `[x]` Scheduled job management with manual trigger
    - `[x]` Storage statistics (DB size, uploads, document vault)
    - `[x]` Manual archive trigger for entity types
- `[x]` **7.8 Utility Modules**
    - `[x]` QR code generator (`qrGenerator.js`)
    - `[x]` CSV exporter (`csvExporter.js`)
    - `[x]` Number generator (`numberGenerator.js`)

# Phase 8 Checklist: UI/UX Refinement Phase (UI Constitution)

- `[ ]` **8.1 Styling System & Responsive Framework (`index.css`)**
    - `[ ]` Define clean mobile-first viewport styling and scale down desktop styles
    - `[ ]` Build standard typography scale, spacing helpers, focus outlines, and input hover rules
    - `[ ]` Incorporate conditional logic for custom mouse cursor (disabled on mobile touch screens)
- `[ ]` **8.2 Editorial Homepage & Detail Refinements (`index.html` & `product.html`)**
    - `[ ]` Stack editorial columns, tickers, volumes, and product grid on small displays
    - `[ ]` Replace default size and variant select list elements with large touchable tiles (min 48px height)
    - `[ ]` Introduce skeleton loading elements and optimize image sizing to avoid page shift
- `[ ]` **8.3 Mobile-Optimized Checkout Flow (`checkout.html`)**
    - `[ ]` Formulate clean vertically stacked checkout inputs (autofill assistance)
    - `[ ]` Refactor address selection and payment methods as prominent radio-card tiles
    - `[ ]` Place primary purchase actions within natural thumb-reach
- `[ ]` **8.4 Backoffice Operational Workspace (`admin.html`)**
    - `[ ]` Streamline dashboard layout with clean dark Vercel/Linear elements
    - `[ ]` Implement responsive css rules that map large tables to stacked detail cards under 768px viewports
    - `[ ]` Implement sticky header tables for order pipelines, ledger balances, and audit records
    - `[ ]` Surface decision indicators (low stock, open complaints) as prominent action items

