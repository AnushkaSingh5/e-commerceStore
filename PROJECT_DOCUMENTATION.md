# KreatorStore - Multi-Tenant E-Commerce Platform
## Comprehensive Handover & Technical Documentation

This document serves as the complete technical reference for the KreatorStore codebase. It provides platform architecture details, database designs, authentication loops, API integrations, and code maps to enable any developer or manager to navigate, maintain, and scale the application.

---

## 1. Project Overview

**KreatorStore** is a multi-tenant e-commerce Software-as-a-Service (SaaS) platform built to empower creators and merchants to establish online storefronts, upload products, manage inventory, and process transactions. The platform integrates creator onboarding, storefront customization, secure payment gateways, carrier shipping services, and platform administration.

### Main Purpose
To provide a friction-free e-commerce environment where sellers can launch stores without coding, customers can purchase products via localized storefronts, and platform administrators can oversee platform health, KYC compliance, and payouts.

### User Roles
1. **Platform Administrator (Admin)**
   - Accesses the admin console (`/admin/*`) to manage store approvals, verify creator KYC documents, process wallet payout requests, audit store-wide coupons, and monitor platform activity and system health.
2. **Creator / Seller**
   - Accesses the seller panel (`/dashboard/*`) to set up stores, define custom styling (logos, banners, shipping charges), manage product catalogs and categories, create discount coupons, view sales metrics, check earnings, and request payouts.
3. **Customer**
   - Accesses custom storefronts dynamically (via `/store/[slug]`) to browse products, view details, manage their cart, apply discount codes, complete checkout via Cashfree or Cash on Delivery (COD), review purchased items, and track orders inside their personal account panel (`/customer/*`).

### Core Implemented Functionality
- **Dynamic Multi-Tenant Storefront Resolution**: Store details, styling, and inventories are retrieved dynamically from PostgreSQL based on the URL path slug (e.g. `/store/[slug]`).
- **Creator Onboarding Wizard**: A step-by-step registration funnel capturing business profiles, bank details, and identity documents, initializing storefront defaults, and guiding sellers to launch.
- **Cart & Order Management**: Flexible shopping cart with item selection, live inventory validation, multi-store checkout segregation (splitting orders by store ID), and automated payment status updates.
- **Wallet & Payout System**: Automatically routes earnings (minus platform fees) to creator balances upon successful payments, enabling merchants to request bank withdrawals which admins audit.
- **Fulfillment Integrations**: Automated shipment registration and real-time carrier tracking sync.

---

## 2. Technology Stack

The project utilizes a modern client-side serverless application architecture with the following dependencies (as verified in `package.json`):

*   **Next.js (`16.2.4`)**: App Router structure utilizing standard file-based routing and optimized production compiler (Turbopack).
*   **React (`19.2.4`)**: Component architecture, layout templates, state hooks, and contexts.
*   **JavaScript (Pure ES6)**: The application is written entirely in JavaScript (no TypeScript config).
*   **Supabase Client (`@supabase/supabase-js ^2.106.1`)**: Orchestrates communication directly from client-side code to Supabase services for database CRUD, real-time channels, storage bucket uploads, and auth loops.
*   **PostgreSQL**: Hosted database containing Row Level Security (RLS) policies, triggers, custom SQL functions/RPCs, audit tables, and helper views.
*   **Authentication (Supabase Auth)**:
    - Creator & Admin: Email and Password authentication.
    - Customer: Email and Password or OTP (One-Time Password) configurations, linked to storefront actions.
*   **Payment Gateways**:
    - **Cashfree PG (Active)**: Primary payment gateway integrated via the Cashfree JS v3 Web SDK loaded dynamically from the Cashfree CDN (`https://sdk.cashfree.com/js/v3/cashfree.js`) and backend API routes.
    - **Razorpay (Alternative)**: Native API client stubs exist in the service layer, but Cashfree is configured as the active provider.
*   **Shipping Integrations**:
    - **Delhivery (Active)**: Primary carrier interface using the Delhivery REST APIs (staging vs production based on credentials).
    - **Shiprocket (Alternative)**: Integration provider code exists in the codebase but remains inactive.
*   **UI / Data Visualization**:
    - **Recharts (`^3.8.1`)**: Used to display revenue charts, order counts, and growth analytics in the dashboards.
    - **React Top Loading Bar (`^3.0.2`)**: Implements loading bar feedback on top of pages during client-side route changes.

---

## 3. Project Architecture

The architecture is built on a client-first, serverless-backed model:
1.  **Frontend Frame (Next.js)**: Runs in the user's browser, utilizing contexts to cache user details, sessions, carts, and dashboards.
2.  **Database Connection (Supabase SDK)**: Frontend code queries Supabase directly for CRUD data operations and storage uploads, bypassing custom API middleware.
3.  **Backend APIs (Next.js Route Handlers)**: Server-side endpoints (`/api/...`) are used only when secure keys are required, such as creating Cashfree payment sessions, validating webhooks, and interacting with Delhivery shipping routes.
4.  **Database Security**: Database isolation is enforced at the database layer via PostgreSQL Row Level Security (RLS) policies checking the authenticated user ID (`auth.uid()`).

---

## 4. Folder Structure

The repository structure is organized as follows:

*   [`app/`](app/): Contains Next.js pages, App Router layouts, and API Route Handlers.
*   [`components/`](components/): Houses modular React components:
    *   [`components/Admin/`](components/Admin/): Layouts, stats, and feeds specific to the admin console.
    *   [`components/Dashboard/`](components/Dashboard/): Navigation, layouts, and menus for the seller dashboard.
    *   [`components/landing/`](components/landing/): Marketing website layout elements (Hero, Pricing, FAQs).
    *   [`components/UI/`](components/UI/): Reusable atomic components (Button, Input, Modal, Table, Select, Toggle).
*   [`context/`](context/): React contexts managing authentication states and cart storage.
*   [`data/`](data/): Static configurations and offline mock files for local development.
*   [`database/`](database/): Holds the database schema file ([`database/schema.sql`](database/schema.sql)) and incremental migration scripts in [`database/migrations/`](database/migrations/).
*   [`email-templates/`](email-templates/): Reference HTML email designs mapped to Supabase SMTP triggers.
*   [`lib/`](lib/): Configured SDK clients (Supabase client) and default seed data libraries.
*   [`public/`](public/): Static image files, branding assets, and developer icons.
*   [`services/`](services/): Functional API adapters managing payment gateways, shipping providers, and data queries.

### Root Configuration Files
*   [`package.json`](package.json): Lists build scripts and dependencies.
*   [`package-lock.json`](package-lock.json): Package resolution lock file.
*   [`next.config.mjs`](next.config.mjs): Next.js redirects and configurations.
*   [`jsconfig.json`](jsconfig.json): Path alias mapping (e.g. `@/*` to project root).
*   [`eslint.config.mjs`](eslint.config.mjs): Code linting styling rules.
*   [`.env.example`](.env.example): Reference variables template.
*   [`README.md`](README.md): Quick start documentation.
*   [`AGENTS.md`](AGENTS.md): Next.js agent rules definition.
*   [`CLAUDE.md`](CLAUDE.md): Environment identifier.

---

## 5. Application Routes

Below is the complete map of routes implemented in the `app/` directory:

| Route Path | File Path | User Access | Purpose & Core Functionality |
| :--- | :--- | :--- | :--- |
| `/` | [`app/page.js`](app/page.js) | Public | Marketing landing page detailing platform benefits, pricing, and FAQs. |
| `/login` | [`app/login/page.js`](app/login/page.js) | Creator | Account login for merchants. |
| `/signup` | [`app/signup/page.js`](app/signup/page.js) | Creator | Account registration for new merchants. |
| `/reset-password` | [`app/reset-password/page.js`](app/reset-password/page.js) | Creator | Recovery page to request password resets. |
| `/onboarding` | [`app/onboarding/page.js`](app/onboarding/page.js) | Creator | Six-step wizard to initialize store metadata, KYC files, and initial products. |
| `/onboarding/success`| [`app/onboarding/success/page.js`](app/onboarding/success/page.js) | Creator | Onboarding completion success landing page. |
| `/dashboard` | [`app/dashboard/page.js`](app/dashboard/page.js) | Creator (Auth) | Operations overview dashboard with revenue metrics, charts, and activity feeds. |
| `/dashboard/products`| [`app/dashboard/products/page.js`](app/dashboard/products/page.js) | Creator (Auth) | Product listing, search, delete actions. |
| `/dashboard/products/addproduct` | [`app/dashboard/products/addproduct/page.js`](app/dashboard/products/addproduct/page.js) | Creator (Auth) | Create new product catalog entries or update existing ones. |
| `/dashboard/categories` | [`app/dashboard/categories/page.js`](app/dashboard/categories/page.js) | Creator (Auth) | Create, edit, delete, and reorder categories. |
| `/dashboard/orders` | [`app/dashboard/orders/page.js`](app/dashboard/orders/page.js) | Creator (Auth) | View store orders, manage fulfillment status, download invoice PDFs. |
| `/dashboard/wallet` | [`app/dashboard/wallet/page.js`](app/dashboard/wallet/page.js) | Creator (Auth) | View earnings ledger, wallet balances, request bank transfers (payouts). |
| `/dashboard/profile`| [`app/dashboard/profile/page.js`](app/dashboard/profile/page.js) | Creator (Auth) | Complete KYC entries, upload files, update store bank details. |
| `/dashboard/settings`| [`app/dashboard/settings/page.js`](app/dashboard/settings/page.js) | Creator (Auth) | Store configuration (Logo/Banner upload, select templates, delivery fees). |
| `/dashboard/coupons` | [`app/dashboard/coupons/page.js`](app/dashboard/coupons/page.js) | Creator (Auth) | Setup discount coupons, discount types, validity, max usages. |
| `/dashboard/reviews` | [`app/dashboard/reviews/page.js`](app/dashboard/reviews/page.js) | Creator (Auth) | Moderation panel for customer reviews and replying to reviews. |
| `/dashboard/shipping`| [`app/dashboard/shipping/page.js`](app/dashboard/shipping/page.js) | Creator (Auth) | Edit shipping warehouse pickup addresses and verify syncing with Delhivery. |
| `/admin/login` | [`app/admin/login/page.js`](app/admin/login/page.js) | Admin | Platform administrative console login. |
| `/admin` | [`app/admin/(dashboard)/page.js`](app/admin/\(dashboard\)/page.js) | Admin (Auth) | Platform overview showing total stores, global GMV, and system health status. |
| `/admin/creators` | [`app/admin/(dashboard)/creators/page.js`](app/admin/\(dashboard\)/creators/page.js) | Admin (Auth) | Verify/reject creator KYC document submissions and business locations. |
| `/admin/stores` | [`app/admin/(dashboard)/stores/page.js`](app/admin/\(dashboard\)/stores/page.js) | Admin (Auth) | Global storefront list. Enable, disable, or reject stores. |
| `/admin/payouts` | [`app/admin/(dashboard)/payouts/page.js`](app/admin/\(dashboard\)/payouts/page.js) | Admin (Auth) | Review payout withdrawal requests, check bank details, mark status. |
| `/admin/coupons` | [`app/admin/(dashboard)/coupons/page.js`](app/admin/\(dashboard\)/coupons/page.js) | Admin (Auth) | Audit platform-wide discount codes and usage counters. |
| `/admin/reviews` | [`app/admin/(dashboard)/reviews/page.js`](app/admin/\(dashboard\)/reviews/page.js) | Admin (Auth) | Moderate flagged or reported customer reviews. |
| `/admin/reports` | [`app/admin/(dashboard)/reports/page.js`](app/admin/\(dashboard\)/reports/page.js) | Admin (Auth) | Platform-wide financial reports (*Placeholder Page*). |
| `/admin/settings` | [`app/admin/(dashboard)/settings/page.js`](app/admin/\(dashboard\)/settings/page.js) | Admin (Auth) | Platform configuration settings (*Placeholder Page*). |
| `/admin/support` | [`app/admin/(dashboard)/support/page.js`](app/admin/\(dashboard\)/support/page.js) | Admin (Auth) | System support tickets panel (*Placeholder Page*). |
| `/store/[slug]` | [`app/store/[slug]/page.js`](app/store/\[slug\]/page.js) | Public | Customer storefront resolved dynamically by slug path. |
| `/store/[slug]/product/[idOrSlug]` | [`app/store/[slug]/product/[idOrSlug]/page.js`](app/store/\[slug\]/product/\[idOrSlug\]/page.js) | Public | Detailed page for a product, displaying reviews, FAQs, rating stats. |
| `/store/[slug]/cart` | [`app/store/[slug]/cart/page.js`](app/store/\[slug\]/cart/page.js) | Public | Customer cart review showing item quantities, price details, checkout selectors. |
| `/store/[slug]/checkout` | [`app/store/[slug]/checkout/page.js`](app/store/\[slug\]/checkout/page.js) | Public | Billing shipping details collection, shipping fees, payment gateway options. |
| `/store/[slug]/checkout/success` | [`app/store/[slug]/checkout/success/page.js`](app/store/\[slug\]/checkout/success/page.js) | Public | Order purchase confirmation. |
| `/store/[slug]/checkout/failed` | [`app/store/[slug]/checkout/failed/page.js`](app/store/\[slug\]/checkout/failed/page.js) | Public | Payment failure landing page with retry options. |
| `/store/[slug]/login`| [`app/store/[slug]/login/page.js`](app/store/\[slug\]/login/page.js) | Customer | Storefront customer login page (Email/Password or OTP verification). |
| `/store/[slug]/signup`| [`app/store/[slug]/signup/page.js`](app/store/\[slug\]/signup/page.js) | Customer | Storefront customer account registration. |
| `/store/[slug]/wishlist` | [`app/store/[slug]/wishlist/page.js`](app/store/\[slug\]/wishlist/page.js) | Public | List of saved items marked by the user. |
| `/customer/orders`| [`app/customer/orders/page.js`](app/customer/orders/page.js) | Customer (Auth)| Historical order tracking, delivery tracking links, receipt logs. |
| `/customer/profile`| [`app/customer/profile/page.js`](app/customer/profile/page.js) | Customer (Auth)| Customer address list and basic details. |

---

## 6. Authentication

Authentication logic is divided into three separate systems based on user roles:

### A. Creator/Seller Auth
- Uses standard email/password authentication via Supabase Auth.
- Session tokens are stored in browser cookies.
- **Session Self-Healing**: Inside [`context/AuthContext.js`](context/AuthContext.js), if the browser retains a valid authentication token but the corresponding row is missing from the database profiles table, the client will automatically trigger `auth.signOut()` and purge local states to prevent database errors.

### B. Customer Auth
- Managed independently in [`context/CustomerAuthContext.js`](context/CustomerAuthContext.js) using email/password or email OTP (One-Time Password) configurations.
- Customer accounts map directly to the `public.customers` table.
- Prevents sellers or administrators from accessing customer-specific directories.

### C. Admin Auth
- Managed by [`context/AdminAuthContext.js`](context/AdminAuthContext.js).
- Performs credentials matching via the `adminSignIn` function, executing steps exactly as follows:
  1.  **Supabase Client Verification Check**: If the Supabase client is not initialized, it verifies credentials directly against the hardcoded mock administrator account (`admin@kreatorstore.com` / `admin123`).
  2.  **Secure Database RPC Execution**: Invokes the PostgreSQL database RPC function `verify_admin_credentials` with email and password parameters. If a match succeeds and returns the admin profile details, session setup completes.
  3.  **Table Query Fallback Execution**: If the RPC fails or is not found, the function queries the `admin_users` table directly. The system verifies if the database `password_hash` column matches the input password, or checks for development password overrides matching `admin123`.
  4.  **Final Hardcoded Fallback Check**: If database operations do not yield a matching admin record, the function performs a final fallback check matching the input credentials against the official system account: `admin@kreatorstore.com` with password `admin123` to ensure administrative panel access is preserved.

---

## 7. Seller/Creator System

The creator system defines the merchant journey:

1.  **Onboarding Wizard (`/onboarding`)**:
    - **Step 1**: Platform Overview.
    - **Step 2 (Store Setup)**: Inputs store name, slug, description, and uploads logo/banner.
    - **Step 3 (KYC Upload)**: Inputs GSTIN, PAN, and uploads Address/ID verification documents.
    - **Step 4 (Categories Setup)**: Creates initial catalog categories.
    - **Step 5 (Product Setup)**: Seeds initial store products.
    - **Step 6 (Launch)**: Sets `onboarding_completed = true` on the profile and redirects to the merchant dashboard.
2.  **Product Management**: Under `/dashboard/products`, sellers add, update, search, or delete items. The upload flow compresses images locally using HTML Canvas to reduce bandwidth.
3.  **Category Management**: Under `/dashboard/categories`, categories are created and their sort order can be managed.
4.  **Order Processing**: Under `/dashboard/orders`, sellers can track orders, monitor shipping statuses, and download invoice PDFs.
5.  **Wallet Payouts**: Under `/dashboard/wallet`, creators track their balance sheets and submit payouts, adding records to `payout_requests`.

---

## 8. Customer System

The customer storefront experience is resolved dynamically:

1.  **Catalog Browsing**: Loads the store layout based on the URL path slug (via `StoreClient.js`). Displays search boxes, category chips, and product grids.
2.  **Cart Operations**: Items added are saved locally (in `sessionStorage` / `localStorage` keys prefixed with `luxe_` to avoid collisions) for guests, and synced to `cart_items` in the database once the customer logs in.
3.  **Checkout & Purchase**: Validates shipping details, calculates fees based on the merchant's shipping configuration (flat, calculated, or free), verifies stock levels, and redirects to the payment page.
4.  **Personal Panel (`/customer/*`)**: Shoppers can track order deliveries, view payment methods used, and update shipping addresses.

---

## 9. Admin System

The platform operations console manages system-wide directories:

*   **KYC Auditing (`/admin/creators`)**: Displays pending KYC documents. Admins can view government ID and address proofs, and verify or reject merchants.
*   **Store Approvals (`/admin/stores`)**: Lists all stores on the platform. Admins can approve pending applications, disable violating stores, or re-enable stores.
*   **Payout Moderation (`/admin/payouts`)**: Aggregates payout requests. Admins can review creator details, bank details, and mark requests as approved or rejected.
*   **Coupons Auditing (`/admin/coupons`)**: Aggregates all discount codes on the platform, showing usage counters, expiry dates, and creator store owners.
*   **Review Moderation (`/admin/reviews`)**: Lists customer reviews flagged as inappropriate, allowing admins to edit, delete, or moderate reviews.
*   **Administrative Access Details**: Administrative access is provided for authorized company employees. The admin credentials used by the project were provided by the company for official administrative access.
    - **Official Admin Account:** `admin@kreatorstore.com` / `admin123`

---

## 10. Products & Categories

*   **Database Schema**: Stored in `public.products` and `public.categories`.
*   **Attributes**: Products map price, dimensions, stock counts, status (Draft/Published), and description.
*   **Reordering**: Categories use the `sort_order` attribute, which is updated dynamically in the database via drag-and-drop actions.
*   **Image Optimization**: Images are compressed locally inside the merchant browser before uploading to Supabase Storage.

---

## 11. Cart & Checkout

*   **Guest Shopping**: Cart lists are saved to browser storage (`sessionStorage` and `localStorage` keys prefixed with `luxe_` to avoid collisions).
*   **Database Sync**: When customers log in, [`context/StoreContext.js`](context/StoreContext.js) automatically merges local cart items into the `cart_items` table.
*   **Multi-Store Checkout Separation**: In [`services/checkoutService.js`](services/checkoutService.js), if the customer's cart contains items from multiple different stores, the system splits the cart and places separate database orders for each store group.

---

## 12. Orders

*   **Creation Flow**: Orders are created in the database when a checkout is initiated.
*   **Default Status**: Payment-required orders start as `pending_payment` (`awaiting_payment` as fallback), and Cash on Delivery (COD) orders start as `confirmed`.
*   **Payment Status Updates**: Paid orders transition to `confirmed` and trigger shipping creation.
*   **Invoice Generation**: Stubs are provided to generate invoice details dynamically in the frontend order cards.

---

## 13. Payment Integration

KreatorStore integrates **Cashfree PG** as the primary active payment gateway:

*   **SDK Initialization**: Loads the Cashfree v3 Web SDK dynamically from CDN (`https://sdk.cashfree.com/js/v3/cashfree.js`).
*   **Session Creation (`/api/payment/cashfree/create-session`)**:
    - Receives order details and billing coordinates from the client checkout flow.
    - Intercepts requests and validates if the store is approved.
    - Connects to Cashfree using `CASHFREE_CLIENT_ID` and `CASHFREE_CLIENT_SECRET`.
    - Generates a Cashfree session ID and returns it to the client.
    - If credentials are not set, it returns a mock order session (`cf_mock_order_*`) to enable sandbox checkout.
*   **Verification Redirection (`/api/payment/cashfree/verify`)**:
    - Triggered upon successful gateway checkout redirect.
    - Calls `cashfree.PGFetchOrder` to verify order payment status.
    - If status is `PAID`, updates order to `paid` and `confirmed`.
    - Automatically triggers shipping manifest creation.
    - Redirects customer to checkout success page.
*   **Webhook Handling (`/api/payment/cashfree/webhook`)**:
    - Receives payment notifications from Cashfree.
    - Validates signature integrity using HMAC SHA256 of `x-webhook-timestamp` + payload, signed with the client secret.
    - Processes verified events, updates order payment status, and triggers shipping registration.
*   **Razorpay Integration**: Files [`RazorpayProvider.js`](services/payment/RazorpayProvider.js) and routes `/api/payment/create-order` are configured as alternative stubs and remain inactive in the current setup.

---

## 14. Shipping Integration

The application utilizes **Delhivery** as the primary shipping carrier:

*   **Warehouse Registration**: When creators complete store setup or change address settings under `/dashboard/shipping`, the system calls `delhiveryProvider.addPickupLocation()`. This registers the merchant warehouse, returning a unique `pickup_location_id` stored in `store_shipping_settings`.
*   **Shipment Creation**: Upon successful order payment verification, the system calls `shippingService.createShipment()`. This registers the package dimensions, delivery address, and payment coordinates, generating a shipping label and tracking AWB number.
*   **Tracking Sync**: API route `/api/shipping/sync` is triggered by orders pages to fetch real-time package statuses from Delhivery and update the database order.
*   **Mock Fallback**: If `DELHIVERY_API_TOKEN` is not configured, the system operates in mock mode, simulating warehouse registration and returning mock tracking details.
*   **Shiprocket Integration**: Stubs exist in [`shiprocketProvider.js`](services/shipping/shiprocketProvider.js) or [`shiprocketProvider.js`](services/shipping/shiprocketProvider.js) but remain inactive.

---

## 15. Email / Resend Integration

The project incorporates **Resend** for transactional email delivery:

*   **Direct API Integration**: Resend is implemented in the project. The system uses the `RESEND_API_KEY` secret variable to authenticate requests to the Resend API.
*   **Purpose**: Used to send direct automated emails to merchants and customers, including customer order confirmations, merchant payout approval notices, and onboarding wizard verification updates.
*   **Triggering Events**: Dispatched by service routines during workflow status changes (such as order confirmation, shipping confirmation, onboarding completion, or payout request modifications).
*   **SMTP Gateway Interface**: In co-existence with direct API requests, the Supabase Auth server is configured to route authentication templates (registration validation, password recovery, magic link) via Resend using SMTP parameters verified within the Supabase Auth panel.
*   **HTML Templates**: Design templates are stored in `email-templates/` (`email-confirmation.html`, `reset-password.html`, `magic-link.html`).

---

## 16. Supabase Integration

The project relies on Supabase for key backend functions:

1.  **Supabase Client**: Configured in [`lib/supabase.js`](lib/supabase.js) using environment variables. It safely intercepts missing keys to prevent runtime crashes.
2.  **Supabase Storage**: Five buckets manage media assets:
    - `store-logos`: Public access for store logos.
    - `store-banners`: Public access for store banners.
    - `product-images`: Public access for product catalog images.
    - `category-images`: Public access for category thumbnails.
    - `verification-documents`: Restricted access containing government ID and address proofs, accessible only by the creator owner and admins.

---

## 17. Database Structure

The schema is hosted on PostgreSQL inside Supabase:

### Database Tables
*   `profiles_base`: Core mapping of Supabase auth IDs.
*   `sellers`: Profile information, contact info, bank details, and KYC status.
*   `profiles` (View): Join view of `profiles_base` and `sellers`.
*   `stores`: Configurations for merchant storefronts.
*   `products` & `categories`: Product details, categories, and inventory.
*   `orders` & `order_items`: Order records and item snapshots.
*   `customers` & `customer_addresses`: Shopper database logs.
*   `customer_carts` & `cart_items`: Synced shopper carts.
*   `creator_earnings` & `payout_requests`: Creator wallet ledgers.
*   `creator_documents`: Reference URLs of uploaded KYC proofs.
*   `wallet_transactions`: Log of creator wallet transactions.
*   `store_status_audit_logs`: Audit logs for store status alterations.

### Database Triggers & Functions
*   **New User Trigger**: `handle_new_user` creates profile records when a user signs up.
*   **View Triggers**: `tr_profiles_view_insert` and `tr_profiles_view_update` handle writes to the `profiles` view.
*   **Security RPCs**: `verify_admin_credentials` checks admin password hashes securely.

---

## 18. Environment Variables

Define the following environment variables in `.env.local` for local development. This table matches `.env.example` exactly.

### Public variables (Client-Side)
*   **`NEXT_PUBLIC_SUPABASE_URL`**: Supabase project endpoint connection URL.
*   **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**: Supabase anonymous client API key.
*   **`NEXT_PUBLIC_ACTIVE_PAYMENT_PROVIDER`**: Active payment provider flag (set to `Cashfree`).
*   **`NEXT_PUBLIC_ACTIVE_SHIPPING_PROVIDER`**: Active shipping provider flag (set to `Delhivery`).
*   **`NEXT_PUBLIC_BASE_URL`**: Base URL of the web app (e.g. `https://kreatorstore.in` or `http://localhost:3000`).

### Secret variables (Server-Side)
*   **`CASHFREE_CLIENT_ID`**: API Client ID for Cashfree PG.
*   **`CASHFREE_CLIENT_SECRET`**: API Client Secret for Cashfree PG.
*   **`CASHFREE_ENV`**: API environment selector (`TEST` or `PRODUCTION`).
*   **`DELHIVERY_API_TOKEN`**: API Token key for Delhivery shipping.
*   **`DELHIVERY_ENV`**: API environment selector (`sandbox` or `production`).
*   **`RESEND_API_KEY`**: API key used to authenticate requests to the Resend API.

### Security Note
The file `.env.local` contains actual production/service credentials and **MUST NOT** be shared or included in the final repository handover ZIP. It is for private local development. `env.example` contains variable placeholders. Actual credentials should be obtained from the authorized company/project owner.

---

## 19. Local Development Setup

To run KreatorStore locally, follow these steps:

1.  **Clone the Repository**:
    ```bash
    git clone <repository_url>
    cd <project-folder>
    ```
2.  **Install Node.js Dependencies**:
    ```bash
    npm install
    ```
3.  **Configure Environment Variables**:
    - Copy `.env.example` to `.env.local`:
      ```bash
      cp .env.example .env.local
      ```
    - Open `.env.local` and add your Supabase credentials:
      ```env
      NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
      NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
      ```
4.  **Database Bootstrapping (Optional)**:
    - To replicate the schema on a new Supabase project, copy the contents of [`database/schema.sql`](database/schema.sql) and execute it in the Supabase SQL Editor.
5.  **Start the Development Server**:
    ```bash
    npm run dev
    ```
    - Access the application at `http://localhost:3000`.
6.  **Build production version**:
    ```bash
    npm run build
    ```
7.  **Run linting check**:
    ```bash
    npm run lint
    ```

---

## 20. Deployment

### Hosting
*   **Client & Next.js Server**: Hosted on **Vercel**.
*   **Database & Storage**: Hosted on **Supabase**.
*   **Emails**: Routed via **Resend** using Custom SMTP.

### Production Environment Settings
- Production Domain: `https://kreatorstore.in`
- Custom Domain Configuration: Mapped in the Vercel dashboard. Store paths resolve dynamically via `/store/[slug]` paths.
- Database Migrations: Schema modifications are executed via the Supabase SQL editor using `database/schema.sql`.

---

## 21. Common Modification Guide

If you need to update common features, look in the following locations:

*   **Homepage Design**: Modify marketing page sections in [`components/landing/`](components/landing/) or adjust the layout in [`app/page.js`](app/page.js).
*   **Seller Dashboard layout**: Modify sidebar links in [`components/Dashboard/Sidebar.js`](components/Dashboard/Sidebar.js) or top headers in [`components/Dashboard/Navbar.js`](components/Dashboard/Navbar.js).
*   **Product detail layout**: Modify storefront views in [`app/store/[slug]/product/[idOrSlug]/ProductClient.js`](app/store/\[slug\]/product/\[idOrSlug\]/ProductClient.js).
*   **Cart layout**: Modify storefront views in [`app/store/[slug]/cart/page.js`](app/store/\[slug\]/cart/page.js).
*   **Checkout & Payment calculations**: Check [`services/checkoutService.js`](services/checkoutService.js) and update calculations or update payment hooks inside [`app/store/[slug]/checkout/page.js`](app/store/\[slug\]/checkout/page.js).
*   **Database tables, RLS, functions**: Check [`database/schema.sql`](database/schema.sql) and apply changes to your Supabase SQL editor.
*   **Authentication contexts**: Modify user validation checks in [`context/AuthContext.js`](context/AuthContext.js) or [`context/CustomerAuthContext.js`](context/CustomerAuthContext.js).
*   **Shipping carrier API parameters**: Update endpoints or query formatting in [`services/shipping/delhiveryProvider.js`](services/shipping/delhiveryProvider.js).

---

## 22. Troubleshooting

### Timeout Screens
*   **Symptom**: Main page shows "Seller Authorization Timeout".
*   **Solution**: Verify database availability, check network blocks, and ensure `NEXT_PUBLIC_SUPABASE_URL` is set correctly.

### Dynamic Logo/Banners 404
*   **Symptom**: Logo is missing after onboarding upload.
*   **Solution**: Ensure public storage buckets are configured as public-readable in the Supabase dashboard.

---

## 23. Build & Testing

*   **Production Build**: Next.js production compilations build successfully without errors (`next build` output compiles routes and static files).
*   **Linter Status**: Running `npm run lint` identifies pre-existing ESLint warnings in React context files (`AdminContext.js`, `StoreContext.js`, `AuthContext.js`) regarding synchronous `setState` actions inside effects. These are non-blocking warnings and the build finishes successfully.
*   **Tests**: The repository does not contain automated unit or integration test frameworks (like Jest, Cypress, or Playwright). Verification is performed manually.

### Manual Verification Checklist
1.  **Onboarding Funnel**: Register a new creator → verify banner/logo uploads crop correctly → verify seed products are inserted → verify redirection to `/dashboard`.
2.  **Fulfillment & Wallet**: Mark orders as completed in creator panel → verify wallet balance increases → verify payout requests list balance changes.
3.  **Admin Verification**: Log in as admin → review pending creator documents under `/admin/creators` → approve creator → verify store status changes from pending to active.

---

## 24. Quick File Navigation

| Feature | Main Location | Purpose |
| :--- | :--- | :--- |
| **Authentication** | [`context/`](context/) | Authentication and session handling |
| **Seller Dashboard** | [`app/dashboard/`](app/dashboard/) | Seller management |
| **Storefront** | [`app/store/[slug]/`](app/store/\[slug\]/) | Customer-facing store |
| **Payments** | [`services/payment/`](services/payment/) | Payment integration |
| **Shipping** | [`services/shipping/`](services/shipping/) | Delhivery integration |
| **Database** | [`database/schema.sql`](database/schema.sql) | Database schema |
| **Shared UI** | [`components/`](components/) | Reusable UI components |
