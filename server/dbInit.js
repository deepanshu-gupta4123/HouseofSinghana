const db = require('./db');

async function initSchema() {
    console.log('Initializing database schema...');

    // Run table creations sequentially using db.transaction or sequence of exec calls.
    // Domain 1: Access Control & Configuration
    await db.exec(`
        CREATE TABLE IF NOT EXISTS roles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS permissions (
            id TEXT PRIMARY KEY,
            module TEXT NOT NULL,
            action TEXT NOT NULL,
            description TEXT
        );

        CREATE TABLE IF NOT EXISTS role_permissions (
            role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
            PRIMARY KEY (role_id, permission_id)
        );

        CREATE TABLE IF NOT EXISTS users (
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
            created_by INTEGER,
            updated_by INTEGER,
            deleted_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS backup_admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            secret_key_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS feature_flags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            module TEXT,
            is_enabled BOOLEAN DEFAULT 1,
            description TEXT,
            updated_by INTEGER REFERENCES users(id),
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS inquiries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS otps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT NOT NULL,
            otp TEXT NOT NULL,
            expires_at DATETIME NOT NULL
        );
    `);

    // Domain 2: Event Bus, Audit Trail & Health
    await db.exec(`
        CREATE TABLE IF NOT EXISTS domain_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            aggregate_type TEXT NOT NULL,
            aggregate_id TEXT NOT NULL,
            payload TEXT NOT NULL,
            emitted_by_user_id INTEGER,
            processed BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            user_email TEXT,
            user_role TEXT,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            old_values TEXT,
            new_values TEXT,
            ip_address TEXT,
            user_agent TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS system_health_checks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service_name TEXT NOT NULL,
            status TEXT NOT NULL,
            response_time_ms INTEGER,
            last_error TEXT,
            checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS scheduled_jobs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            cron_expression TEXT NOT NULL,
            last_run_at DATETIME,
            last_status TEXT DEFAULT 'PENDING',
            last_error TEXT,
            is_enabled BOOLEAN DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS idempotency_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            idempotency_key TEXT UNIQUE NOT NULL,
            operation TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            response_status INTEGER,
            response_body TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME
        );
    `);

    // Domain 3: Workflows & Automations
    await db.exec(`
        CREATE TABLE IF NOT EXISTS workflow_definitions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workflow_key TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            definition_json TEXT NOT NULL,
            version INTEGER DEFAULT 1,
            is_active BOOLEAN DEFAULT 1,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS approval_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_type TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            details TEXT NOT NULL,
            requested_by INTEGER NOT NULL REFERENCES users(id),
            status TEXT DEFAULT 'PENDING',
            decided_by INTEGER REFERENCES users(id),
            decided_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS automation_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            trigger_event TEXT NOT NULL,
            condition_json TEXT NOT NULL,
            action_type TEXT NOT NULL,
            action_config TEXT NOT NULL,
            priority INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Domain 4: Product CMS & Documents
    await db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            description TEXT,
            sort_order INTEGER DEFAULT 0,
            is_archived BOOLEAN DEFAULT 0,
            archived_at DATETIME,
            deleted_at DATETIME,
            created_by INTEGER,
            updated_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            sku TEXT UNIQUE NOT NULL,
            barcode TEXT UNIQUE,
            category_id INTEGER REFERENCES categories(id),
            merchant_notes TEXT,
            description TEXT,
            base_price INTEGER NOT NULL,
            discount_price INTEGER,
            tax_rate REAL DEFAULT 0.0,
            hsn_code TEXT,
            images TEXT,
            videos TEXT,
            seo_title TEXT,
            seo_description TEXT,
            status TEXT DEFAULT 'draft',
            is_archived BOOLEAN DEFAULT 0,
            archived_at DATETIME,
            deleted_at DATETIME,
            created_by INTEGER,
            updated_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS product_variants (
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
            deleted_at DATETIME,
            created_by INTEGER,
            updated_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS homepage_sections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            section_key TEXT UNIQUE NOT NULL,
            title TEXT,
            content_json TEXT NOT NULL,
            is_visible BOOLEAN DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS faqs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            category TEXT DEFAULT 'General',
            sort_order INTEGER DEFAULT 0,
            is_visible BOOLEAN DEFAULT 1,
            deleted_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS seo_metadata (
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

        CREATE TABLE IF NOT EXISTS url_redirects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_path TEXT UNIQUE NOT NULL,
            target_path TEXT NOT NULL,
            status_code INTEGER DEFAULT 301,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS media_library (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_type TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            checksum TEXT UNIQUE NOT NULL,
            alt_text TEXT,
            tags TEXT,
            uploaded_by INTEGER REFERENCES users(id),
            deleted_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS document_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_key TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            template_html TEXT NOT NULL,
            template_css TEXT,
            paper_size TEXT DEFAULT 'A4',
            version INTEGER DEFAULT 1,
            is_active BOOLEAN DEFAULT 1,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Domain 5: Warehouses & Perpetual Inventory
    await db.exec(`
        CREATE TABLE IF NOT EXISTS warehouses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            address TEXT,
            city TEXT,
            state TEXT,
            pincode TEXT,
            is_default BOOLEAN DEFAULT 0,
            is_active BOOLEAN DEFAULT 1,
            is_archived BOOLEAN DEFAULT 0,
            archived_at DATETIME,
            deleted_at DATETIME,
            created_by INTEGER,
            updated_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS warehouse_bins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
            location_code TEXT UNIQUE NOT NULL,
            shelf TEXT,
            rack TEXT,
            bin TEXT,
            is_active BOOLEAN DEFAULT 1,
            is_archived BOOLEAN DEFAULT 0,
            archived_at DATETIME,
            deleted_at DATETIME,
            created_by INTEGER,
            updated_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS inventory_summary (
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

        CREATE TABLE IF NOT EXISTS inventory_batches (
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
            inspection_status TEXT DEFAULT 'PENDING',
            expiry_date DATE,
            is_archived BOOLEAN DEFAULT 0,
            archived_at DATETIME,
            deleted_at DATETIME,
            created_by INTEGER,
            updated_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS inventory_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            variant_id INTEGER NOT NULL REFERENCES product_variants(id),
            warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
            batch_id INTEGER REFERENCES inventory_batches(id),
            transaction_type TEXT NOT NULL,
            change_qty INTEGER NOT NULL,
            balance_current_before INTEGER NOT NULL,
            balance_current_after INTEGER NOT NULL,
            balance_reserved_before INTEGER NOT NULL,
            balance_reserved_after INTEGER NOT NULL,
            reference_type TEXT,
            reference_id TEXT,
            remarks TEXT,
            user_id INTEGER REFERENCES users(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS inventory_audits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            audit_number TEXT UNIQUE NOT NULL,
            variant_id INTEGER NOT NULL REFERENCES product_variants(id),
            warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
            physical_count INTEGER NOT NULL,
            system_quantity INTEGER NOT NULL,
            variance INTEGER NOT NULL,
            audit_remarks TEXT NOT NULL,
            adjusted_by INTEGER NOT NULL REFERENCES users(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Domain 6: CRM & Customers
    await db.exec(`
        CREATE TABLE IF NOT EXISTS customers (
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
            deleted_at DATETIME,
            created_by INTEGER,
            updated_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS customer_addresses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            label TEXT NOT NULL,
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
            deleted_at DATETIME,
            created_by INTEGER,
            updated_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS wishlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            product_id INTEGER NOT NULL REFERENCES products(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(customer_id, product_id)
        );

        CREATE TABLE IF NOT EXISTS referrals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            referrer_customer_id INTEGER NOT NULL REFERENCES customers(id),
            referee_customer_id INTEGER NOT NULL REFERENCES customers(id),
            referee_order_id INTEGER,
            reward_type TEXT DEFAULT 'COUPON',
            reward_value INTEGER DEFAULT 200,
            reward_status TEXT DEFAULT 'PENDING',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS customer_communications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL REFERENCES customers(id),
            channel TEXT NOT NULL,
            direction TEXT DEFAULT 'OUTBOUND',
            event_type TEXT NOT NULL,
            summary TEXT NOT NULL,
            reference_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS stock_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            variant_id INTEGER NOT NULL REFERENCES product_variants(id),
            customer_email TEXT NOT NULL,
            customer_phone TEXT,
            status TEXT DEFAULT 'WAITING',
            notified_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Domain 7: Orders & Documents
    await db.exec(`
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_number TEXT UNIQUE NOT NULL,
            customer_id INTEGER NOT NULL REFERENCES customers(id),
            warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
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
            deleted_at DATETIME,
            created_by INTEGER,
            updated_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS order_items (
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
            deleted_at DATETIME,
            created_by INTEGER,
            updated_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS order_timeline (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            status TEXT NOT NULL,
            message TEXT NOT NULL,
            created_by_user_id INTEGER,
            created_by_name TEXT DEFAULT 'System',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS returns (
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
            deleted_at DATETIME,
            created_by INTEGER,
            updated_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS document_vault (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL DEFAULT 'order',
            entity_id INTEGER NOT NULL,
            document_type TEXT NOT NULL,
            template_key TEXT REFERENCES document_templates(template_key),
            file_path TEXT NOT NULL,
            file_size INTEGER,
            generated_by INTEGER REFERENCES users(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Domain 8: Coupons & Marketing
    await db.exec(`
        CREATE TABLE IF NOT EXISTS coupons (
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
            deleted_at DATETIME,
            created_by INTEGER,
            updated_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS coupon_usages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            coupon_id INTEGER NOT NULL REFERENCES coupons(id),
            order_id INTEGER NOT NULL REFERENCES orders(id),
            customer_id INTEGER NOT NULL REFERENCES customers(id),
            discount_applied INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS abandoned_carts (
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

        CREATE TABLE IF NOT EXISTS search_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query TEXT NOT NULL,
            results_count INTEGER DEFAULT 0,
            customer_id INTEGER REFERENCES customers(id),
            session_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Domain 9: Shipping, Tax & Financials
    await db.exec(`
        CREATE TABLE IF NOT EXISTS shipping_rules (
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

        CREATE TABLE IF NOT EXISTS tax_rules (
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

        CREATE TABLE IF NOT EXISTS payment_reconciliations (
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
    `);

    // Domain 10: Complaints, Reviews & Notifications
    await db.exec(`
        CREATE TABLE IF NOT EXISTS complaints (
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
            sla_expires_at DATETIME,
            is_archived BOOLEAN DEFAULT 0,
            archived_at DATETIME,
            deleted_at DATETIME,
            created_by INTEGER,
            updated_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL REFERENCES orders(id),
            customer_id INTEGER NOT NULL REFERENCES customers(id),
            product_id INTEGER NOT NULL REFERENCES products(id),
            rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
            headline TEXT,
            review_text TEXT NOT NULL,
            media_urls TEXT,
            is_verified_purchase BOOLEAN DEFAULT 1,
            status TEXT DEFAULT 'PENDING',
            merchant_response TEXT,
            responded_at DATETIME,
            is_archived BOOLEAN DEFAULT 0,
            archived_at DATETIME,
            deleted_at DATETIME,
            created_by INTEGER,
            updated_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS notifications (
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
            deleted_at DATETIME,
            created_by INTEGER,
            updated_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Domain 11: Analytics & Intelligence
    await db.exec(`
        CREATE TABLE IF NOT EXISTS analytics_daily_metrics (
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

        CREATE TABLE IF NOT EXISTS analytics_sku_velocity (
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

        CREATE TABLE IF NOT EXISTS analytics_customer_cohorts (
            cohort_month TEXT NOT NULL,
            segment TEXT NOT NULL,
            customer_count INTEGER DEFAULT 0,
            total_revenue INTEGER DEFAULT 0,
            avg_ltv INTEGER DEFAULT 0,
            PRIMARY KEY (cohort_month, segment)
        );

        CREATE TABLE IF NOT EXISTS analytics_region_performance (
            state TEXT NOT NULL,
            city TEXT,
            period TEXT NOT NULL,
            orders_count INTEGER DEFAULT 0,
            revenue INTEGER DEFAULT 0,
            returns_count INTEGER DEFAULT 0,
            avg_delivery_days REAL DEFAULT 0.0,
            PRIMARY KEY (state, period)
        );

        CREATE TABLE IF NOT EXISTS daily_closing_reports (
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

        CREATE TABLE IF NOT EXISTS merchant_timeline (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_date DATE NOT NULL,
            summary TEXT NOT NULL,
            details_json TEXT NOT NULL,
            health_score INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS merchant_calendar (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            event_type TEXT NOT NULL,
            start_date DATE NOT NULL,
            end_date DATE,
            notes TEXT,
            created_by INTEGER REFERENCES users(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS knowledge_base (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            content_markdown TEXT NOT NULL,
            author_id INTEGER REFERENCES users(id),
            is_published BOOLEAN DEFAULT 1,
            is_archived BOOLEAN DEFAULT 0,
            archived_at DATETIME,
            deleted_at DATETIME,
            created_by INTEGER,
            updated_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ai_query_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            query_text TEXT NOT NULL,
            generated_sql TEXT,
            response_text TEXT NOT NULL,
            execution_time_ms INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Domain 12: Archival
    await db.exec(`
        CREATE TABLE IF NOT EXISTS archive_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT UNIQUE NOT NULL,
            archive_after_days INTEGER NOT NULL,
            description TEXT,
            is_active BOOLEAN DEFAULT 1,
            last_run_at DATETIME
        );
    `);

    console.log('Database schema successfully initialized.');
}

module.exports = {
    initSchema
};
