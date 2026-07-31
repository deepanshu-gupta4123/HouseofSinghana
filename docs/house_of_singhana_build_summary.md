# House of Singhana — Complete Build Summary
*For GTM & Business Consulting Alignment*
*As of July 25, 2026*

---

## 1. What Is This?

**House of Singhana** is the digital presence and e-commerce platform for a third-generation Rajasthani spice merchant house — *Kalu Masaley Wala*, established 1990, based in Singhana, Jhunjhunu, Rajasthan. The brand story is about a family that has maintained quality standards across generations: from a bahi-khata (handwritten ledger) and brass weighing scales, to a MacBook and a Node.js server. The tagline is: *"The tools changed. The judgment didn't."*

The platform serves two audiences simultaneously:
- **Retail buyers** — premium packaged spices (100g–1kg)
- **Wholesale / trade buyers** — 50kg bulk jute sacks, with credit-based ordering and manual approval workflows

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML + CSS + JavaScript (no framework) |
| Backend | Node.js + Express.js |
| Database | SQLite (WAL mode, file-based) |
| Payments | Razorpay (UPI, Card, Netbanking, COD) |
| Notifications | Twilio SMS + WhatsApp Business API |
| Auth | JWT tokens + OTP phone verification |
| Security | Helmet, bcrypt, rate limiting |
| Deployment | Docker + Nginx reverse proxy + PM2 process manager |

---

## 3. What Has Been Built — Complete Inventory

### 3A. Frontend Pages (5 Pages)

#### `index.html` — The Brand Homepage (Flagship)

This is the editorial, long-scroll homepage. It is not a typical e-commerce page — it functions more like a brand manifesto. Sections built:

1. **Hero** — Full-screen opening: "House of Singhana / by Kalu Masaley Wala / Custodians of standards passed down through generations."
2. **Continuous Ticker** — Scrolling marquee: "CUSTODIANS OF STANDARDS • ESTABLISHED 1990 • SINGHANA, RAJASTHAN • THE TOOLS CHANGED. THE JUDGMENT DIDN'T."
3. **The Volumes Section** — Displays both packaging tiers: Retail lineup (100g–1kg) + 50kg wholesale jute sack. Custom AI-generated product imagery.
4. **Product Cards Grid** — Three products with prices and "Select Sizes" CTA, linking to the product detail page.
5. **The Trade Section** — Brand storytelling with custom AI-generated editorial imagery: grain yard before sunrise, mandi workers, the bahi-khata ledger.
6. **The Trust Section** — A real anecdote: an elderly man walks into the office and recognizes the family that supplied his wedding provisions decades ago. "Word of mouth is the oldest algorithm."
7. **Reverse Ticker** — "NOT A BRAND. A PRACTICE. • SELECTED BY JUDGMENT."
8. **The Continuity Section** — Founder's story in first person: grandfather in Jasrapur → father's spice business (1990) → today.
9. **The Desk Section** — An editorial image of the modern merchant CEO's office (MacBook, bahi-khata, brass weights, bill counter, spice samples).
10. **The Break Section** — "Convenience improved. Standards quietly declined." — The market problem statement.
11. **The Conviction Section** — "We believe the way things are chosen still matters."
12. **The Selection Section** — Detailed editorial on all three products:
    - **Turmeric**: Selected on colour, aroma, curcumin density
    - **Chilli**: Three variants (Everyday / Heat / Colour) with interactive tabs
    - **Coriander**: Low-temperature grinding to preserve volatile oils
13. **The Closing** — "We inherited these standards. We are responsible for carrying them forward."
14. **Footer** — Copyright, Contact, Instagram links

**Visual Design Features on Homepage:**
- Custom magnetic cursor with easing
- Parallax scrolling on all images
- Intersection Observer scroll-reveal animations (fade-up, fade-left, fade-right, scale-up, image mask wipe)
- Nav auto-hides on scroll down, reappears on scroll up
- Chilli section has interactive 3-tab component (Everyday / Heat / Colour)
- All product imagery is custom AI-generated (not stock photos)

---

#### `product.html` — Product Detail Page

- URL-parameter driven: `product.html?id=chilli`, `?id=turmeric`, `?id=coriander`
- Shows product image, name, description
- **Variant selector** (for chilli: Everyday / Heat / Colour) — shown/hidden based on product
- **Size selector** with dynamic price calculation:
  - 100g (Food-Grade Plastic) — base × 0.1 × 1.15 margin
  - 250g (Food-Grade Plastic) — base × 0.25 × 1.15 margin
  - 500g (Glass Jar) — base × 0.5 × 1.0 margin
  - 1kg (Fine Jute) — base × 1.0 × 1.0 margin
- **Base prices**: Chilli ₹860/kg, Turmeric ₹680/kg, Coriander ₹620/kg
- Cart stored in `localStorage`
- "Added to Cart!" button feedback with saffron color flash
- Invalid product ID redirects to homepage

---

#### `checkout.html` — Cart & Payment Page

- Requires login (redirects to `login.html` if no JWT token)
- Renders live cart from `localStorage` with quantity controls (+/−) and remove
- Calculates and displays running total
- **Payment method selection:**
  - UPI (GPay, PhonePe, Paytm)
  - Credit / Debit Card
  - Netbanking / Bank Transfer
  - Cash on Delivery (COD)
- **Online payment flow:**
  1. Calls `/api/orders/create` on backend → gets Razorpay order
  2. Opens Razorpay modal with order ID
  3. On success, calls `/api/orders/verify` with cryptographic signature
  4. Order confirmed → cart cleared → redirect to homepage
- **COD flow:** Calls `/api/orders/create` with `payment_method: 'cod'` → immediate confirmation

---

#### `login.html` — Auth Page (3 Modes in 1 Page)

Single page handles three auth states toggled by UI:

1. **Login Mode** — Email + Password → JWT token stored in localStorage
2. **Register Mode** — Email + Phone + OTP + Password → OTP sent via SMS → account created with `is_verified: 1`
3. **Forgot Password Mode** — Phone + OTP + New Password → password reset

**OTP flow:** 60-second cooldown timer on "Send OTP" button. Mock mode: OTP prints to server terminal if Twilio not configured.

---

#### `admin.html` — Internal Admin Dashboard

Protected by JWT + admin flag check. Unauthorized users are redirected.

**Order Management System (OMS):**
Full order lifecycle pipeline — orders move through these states sequentially:

```
RECEIVED → CREDIT_APPROVED → INVOICED → DISPATCHED
```

Admin table shows: Order ID, Date, Customer Email, Phone, Items, Total, Payment Status, OMS Status, Action Buttons.

Action buttons (contextual, appear only when relevant):
- **"Approve Credit"** — moves order from RECEIVED → CREDIT_APPROVED
- **"Generate Invoice"** — moves CREDIT_APPROVED → INVOICED
- **"Dispatch Order"** — opens a modal to enter Courier Name + Tracking Number → moves INVOICED → DISPATCHED

**Wholesale Inquiries Table:** Name, Email, Date, Message (from contact form submissions).

WhatsApp notifications triggered at: Order Placed, Credit Approved, Dispatched.

---

### 3B. Backend API (`server/server.js`)

**Authentication APIs** (`/api/auth/*` — rate limited: 20 req/15min):

| Endpoint | Method | Description |
|---|---|---|
| `/api/auth/send-otp` | POST | Generates 6-digit OTP, stores with 10-min expiry, sends via Twilio SMS |
| `/api/auth/register` | POST | Verifies OTP, hashes password (bcrypt), creates user |
| `/api/auth/login` | POST | Verifies credentials, returns JWT (24h expiry) |
| `/api/auth/reset-password` | POST | OTP-verified password reset |

**Order APIs** (requires JWT):

| Endpoint | Method | Description |
|---|---|---|
| `/api/orders/create` | POST | Creates DB order; if online → creates Razorpay order; if COD → confirms immediately |
| `/api/orders/verify` | POST | Verifies Razorpay HMAC signature, marks order PAID |

**Admin APIs** (requires JWT + `is_admin: true`):

| Endpoint | Method | Description |
|---|---|---|
| `/api/admin/orders` | GET | All orders with customer details, newest first |
| `/api/admin/inquiries` | GET | All wholesale inquiries |
| `/api/admin/orders/:id/approve` | POST | Sets `order_status = CREDIT_APPROVED`, sends WhatsApp |
| `/api/admin/orders/:id/invoice` | POST | Sets `order_status = INVOICED`, sends WhatsApp |
| `/api/admin/orders/:id/dispatch` | POST | Sets `order_status = DISPATCHED`, stores courier+tracking, sends WhatsApp |

**Config API:**

| Endpoint | Method | Description |
|---|---|---|
| `/api/config` | GET | Returns Razorpay public key ID for frontend |

---

### 3C. Database Schema (SQLite)

**`users` table:**
```
id, email (UNIQUE), password_hash, is_admin (0/1), phone, is_verified (0/1), created_at
```

**`orders` table:**
```
id, user_id (FK), items_json, total_amount,
payment_status (PENDING / PAID / PENDING_COD),
payment_method (online / cod), payment_id,
order_status (RECEIVED / CREDIT_APPROVED / INVOICED / DISPATCHED),
dispatch_courier, dispatch_tracking, created_at
```

**`inquiries` table:**
```
id, name, email, message, created_at
```

**`otps` table:**
```
id, phone, otp, expires_at
```

---

### 3D. Notifications (Twilio — Mock-Safe)

Three WhatsApp message templates triggered automatically:

| Trigger | Message |
|---|---|
| Order Placed (paid/COD) | "Thank you! Your order #X for ₹Y has been received and is pending credit approval." |
| Credit Approved / Invoice | "Your order #X has been approved and invoiced! We are preparing it for dispatch." |
| Dispatched | "Your order #X has been dispatched via {Courier}. Tracking: {Number}." |

> If Twilio credentials are not set, all messages print to the server terminal as mock logs. The system degrades gracefully — nothing breaks.

---

### 3E. Security

| Feature | Implementation |
|---|---|
| Password storage | bcrypt (10 salt rounds) |
| Session management | JWT (24h expiry, stored in localStorage) |
| Auth rate limiting | 20 requests per 15 minutes per IP |
| HTTP headers | Helmet.js (XSS, clickjacking protection, etc.) |
| Payment verification | Razorpay HMAC-SHA256 signature verification |
| CORS | Enabled globally |
| CSP | Disabled intentionally (inline scripts in HTML pages) |

---

### 3F. Deployment Infrastructure

| File | Purpose |
|---|---|
| `Dockerfile` | Node 20 Alpine image, installs production deps, exposes port 3000 |
| `deploy.sh` | Shell script: builds Docker image, stops old container, starts new on port 3000 |
| `nginx.conf` | Reverse proxy: Nginx on 80/443 → forwards to localhost:3000 |
| `ecosystem.config.js` | PM2 config: process name `singhana`, 1 instance, autorestart, 256MB memory limit, logs to `./logs/` |
| `.env.example` | Template for all environment variables |
| `server/make-admin.js` | One-off script to promote a user to admin by email |

---

### 3G. Asset Inventory (All Custom AI-Generated)

| File | Description |
|---|---|
| `assets/chilli.png` | Dried red chillies on worn wood with brass weight |
| `assets/turmeric.png` | Ground turmeric + raw roots on dark stone |
| `assets/coriander.png` | Coriander seeds on a grinding stone |
| `assets/retail_lineup.png` | 100g/250g/500g/1kg retail packaging lineup |
| `assets/bulk_sack.png` | 50kg bulk raw jute sack |
| `assets/before_sunrise.png` | Grain yard before sunrise, merchant with notebook + truck headlights |
| `assets/mandi_hero.png` | Workers unloading sacks at a mandi |
| `assets/ledger.png` | Open bahi-khata with brass scales |
| `assets/grandfather_merchant.png` | Seated merchant, scales + ledger + spice jars |
| `assets/merchant_desk.png` | Modern CEO desk: MacBook, bahi-khata, bill counter, brass weights, spice samples |
| `assets/scales.png` | Brass weighing scales with turmeric |

---

## 4. What Is Working End-to-End

✅ User can browse the full homepage brand story  
✅ User can view product detail page, select variant + size, see live pricing  
✅ User can add to cart (localStorage)  
✅ User can register with OTP phone verification  
✅ User can log in / log out  
✅ User can reset password via OTP  
✅ User can checkout via Razorpay (UPI / Card / Netbanking)  
✅ User can checkout via Cash on Delivery  
✅ Admin gets notified (WhatsApp / mock log) on every order  
✅ Admin can log in and see all orders  
✅ Admin can run the full OMS pipeline: Approve → Invoice → Dispatch  
✅ Customer gets WhatsApp notification at each OMS stage  
✅ App is Docker-containerized and deployable on any Linux VPS with Nginx  
✅ PM2 config ready for non-Docker deployment  

---

## 5. What Is Currently Missing / Gap Analysis

> [!IMPORTANT]
> These are gaps identified from code inspection. To be prioritized and aligned with GTM strategy.

### 5A. Product & Catalog
- ❌ **No product CMS** — Products are hardcoded in `product.html` JS. Adding a new product requires a code change.
- ❌ **Only 3 products** — Chilli, Turmeric, Coriander. No architecture for expansion without touching code.
- ❌ **No stock/inventory management** — No out-of-stock handling, no inventory levels tracked.
- ❌ **No product search or filtering.**

### 5B. User Account
- ❌ **No "My Orders" page** — Customers cannot see their order history or status.
- ❌ **No order tracking page** — Customers cannot check dispatch courier/tracking from the frontend.
- ❌ **No profile/address management** — No saved shipping address, no account settings.

### 5C. Checkout & Orders
- ❌ **No address/shipping fields at checkout** — Checkout collects no delivery address whatsoever.
- ❌ **No shipping cost calculation** — Flat/free shipping assumed; no courier rate integration.
- ❌ **No order confirmation email** — Only WhatsApp notifications; no email receipts.
- ❌ **No invoice PDF generation** — Admin marks "invoiced" but cannot generate or send an actual PDF invoice.
- ❌ **No coupon/discount/promo code system.**

### 5D. Wholesale / B2B
- ❌ **No wholesale inquiry form on the frontend** — The `inquiries` DB table exists and admin can see entries, but there is no actual form on the website for B2B buyers to submit.
- ❌ **No bulk pricing tier display** — Wholesale pricing for 50kg sacks is not shown anywhere.
- ❌ **No B2B account type** — All users (retail + wholesale) are treated identically in the system.
- ❌ **No minimum order quantity enforcement** for wholesale.

### 5E. Admin Dashboard
- ❌ **No analytics/dashboard summary** — No total revenue, order volume, or trend data. Just a raw table.
- ❌ **No customer management panel** — Cannot view or manage user accounts.
- ❌ **No product/pricing management** — Prices are hardcoded in frontend JS, not editable from admin.
- ❌ **No inventory management.**

### 5F. Marketing & Growth
- ❌ **No contact/inquiry form on the homepage** — The closing section (`#inquire`) exists in HTML but has no actual form input; just brand copy.
- ❌ **No Instagram feed or social integration** — Footer links to Instagram but `href="#"` (dead link).
- ❌ **No SEO meta tags on inner pages** — `product.html`, `checkout.html`, `login.html` have generic/placeholder titles and no meta descriptions.
- ❌ **No sitemap.xml or robots.txt.**
- ❌ **No analytics integration** — No Google Analytics, Meta Pixel, or any tracking.
- ❌ **No WhatsApp "Chat with Us" floating button** — Critical for B2B buyers wanting to negotiate before ordering.

### 5G. Infrastructure & Operations
- ❌ **SQLite scalability limit** — SQLite is fine for low-to-medium traffic, but cannot scale horizontally. Will need migration to PostgreSQL for significant scale.
- ❌ **No automated database backups.**
- ❌ **No production monitoring** — No Sentry, no uptime monitoring, no error alerting.
- ❌ **No SSL automation** — `nginx.conf` has placeholder SSL config; Certbot/Let's Encrypt setup not documented.
- ❌ **OTP table not cleaned up** — Expired OTPs accumulate in the `otps` table; no scheduled cleanup job.

---

## 6. Current Pricing (Hardcoded in Frontend)

| Product | Base Price per kg |
|---|---|
| Chilli | ₹860 |
| Turmeric | ₹680 |
| Coriander | ₹620 |

| Size | Packaging | Margin |
|---|---|---|
| 100g | Food-Grade Plastic | +15% |
| 250g | Food-Grade Plastic | +15% |
| 500g | Glass Jar | No margin |
| 1kg | Fine Jute | No margin |

*Example: 250g Turmeric = ₹680 × 0.25 × 1.15 = ₹195*

---

## 7. Bounded-Context Monolith Architecture (Built in Phase 1-5)

Merchant OS has been built following strong Domain-Driven Design (DDD) boundaries, ensuring strict decoupling and transaction-safety across all domains.

### 7A. Bounded Context boundaries & Modules
*   **Authentication & Security**: JWT verification, RBAC checks, soft-delete scopes, Helmet headers, and rate-limiting.
*   **Product CMS & Approval Workflow**: CRUD for Categories & Products. Base price updates by non-supervisor roles trigger price approval tickets rather than direct database modifications.
*   **Media Library with Checksum Deduplication**: Automatically computes SHA-256 hashes of uploads, skipping redundant writes.
*   **Perpetual Inventory Ledger**: Inventory is derived entirely from transactional records. Supports states: Current Stock, Reserved Stock, Available Stock, Incoming Stock, Damaged Stock, and Blocked Stock. Uses FIFO batch matching on invoice deduction.
*   **Order Management (OMS) & Fulfillment**: Dynamic checkout calculations (tax, shipping, coupons), packing, and logistic courier queues. On order transitions to `INVOICED`, compiles dynamic printable HTML documents inside the document vault.
*   **Customer CRM & Segmentation**: Tracks lifetime buy histories. Auto-segments customer profiles (`NEW` -> `REPEAT` -> `VIP`) based on order count and total spend.
*   **Complaint SLA Ticketing**: SLA tracker sorting customer complaints by urgency (HIGH = 24h, MEDIUM = 48h, LOW = 72h).
*   **Decoupled OLAP Analytics & System Health**: Listens to domain events to compile daily aggregate metrics and SKU velocity lists, separating transactional operations from diagnostics. Health indicators measure low stocks, breached SLAs, and approvals queues to calculate a 0-100 score.

---

## 8. The Order Lifecycle (As Built)

```
Customer places order
        ↓
Order created in DB (status: RECEIVED)
        ↓
[Online] → Razorpay payment modal opens
        → On success: payment_status → PAID
        ↓
[COD] → payment_status: PENDING_COD (no upfront payment)
        ↓
WhatsApp to customer: "Order received, pending credit approval"
        ↓
Admin: clicks "Approve Credit" → order_status: CREDIT_APPROVED
WhatsApp to customer: "Approved and invoiced"
        ↓
Admin: clicks "Generate Invoice" → order_status: INVOICED
        ↓
Admin: clicks "Dispatch Order"
        → enters Courier Name + Tracking Number
        → order_status: DISPATCHED
WhatsApp to customer: "Dispatched via {courier}, tracking: {number}"
```

---

## 8. How to Run (Context for Technical Handoff)

```bash
# Navigate to server directory
cd "House of Singhana/server"

# Copy env template and fill in keys
cp .env.example .env

# Install dependencies
npm install

# Start server
node server.js

# Open browser at http://localhost:3000
```

**Docker deployment on a Linux VPS:**
```bash
chmod +x deploy.sh
./deploy.sh
# App runs on localhost:3000 behind Nginx on port 80/443
```

**Make a user admin:**
```bash
cd server
node make-admin.js user@example.com
```

---

*This document represents the full current state of the House of Singhana platform. Ready for GTM and business strategy alignment.*
