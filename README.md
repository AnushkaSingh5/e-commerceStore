
# KreatorStore - Multi-Tenant E-Commerce SaaS Platform

KreatorStore is a multi-tenant e-commerce SaaS platform that enables merchants to register, configure custom storefronts, and manage product catalogs. The codebase provides distinct workflows for sellers, customers, and platform administrators, built on a unified relational database architecture.

---

## Table of Contents

1. **Project Overview**
2. **Technology Stack**
3. **Project Structure**
4. **Application Routes**
5. **Authentication & Authorization**
6. **Seller / Creator System**
7. **Customer System**
8. **Admin System**
9. **Database**
10. **Database Migrations**
11. **File / Code Responsibility Map**
12. **Email System**
13. **Domain & Deployment**
14. **Environment Variables**
15. **Local Development Setup**
16. **Database Setup / Handover**
17. **Supabase Storage Security**
18. **Production Deployment**
19. **Testing & Verification**
20. **Known Limitations**
21. **Troubleshooting**
22. **Handover Notes**
23. **Security**

---

## 1. Project Overview

- **Merchant Operations**: Sellers sign up and use an onboarding wizard to establish their store profiles, submit KYC documents, and manage categories and products.
- **Customer Stores**: Storefronts are dynamically resolved via slug-based paths (e.g., `/store/[slug]` or `/demo-store/[slug]`). Customers can browse products, manage shopping cart selections, checkout via secure payment gateways, and track order histories.
- **Platform Operations**: Administrators verify creator KYC profiles, review uploaded identity files, process pending wallet payout requests, audit stores, and moderate reviews.
- **Architecture**: The application is structured as a client-side web app built on Next.js, communicating directly with Supabase for data queries, realtime events, storage asset management, and authentication loops.

---

## 2. Technology Stack

- **Next.js Version**: `16.2.4` (using App Router and Turbopack compiler)
- **React Version**: `19.2.4`
- **Programming Language**: Pure JavaScript (no TypeScript)
- **Database**: PostgreSQL hosted on Supabase, using RLS policies, PostgreSQL trigger functions, views, and custom RPC definitions.
- **Authentication**: Supabase Auth (managing email/password registers, JWT sessions, and Customer OTP configurations).
- **Storage**: Supabase Storage Buckets (`store-logos`, `store-banners`, `verification-documents`, `product-images`, `category-images`).
- **Payment Gateways**:
  - **Cashfree PG (Active)**: Primary active payment provider. Implemented using Cashfree JS SDK (loaded dynamically from CDN script) and backend routes (`app/api/payment/cashfree/...`).
  - **Razorpay (Alternative)**: Alternative payment adapter code exists in the repository (`services/payment/RazorpayProvider.js`) but is not active in the current environment configuration. The setup developer does not need to configure Razorpay.
- **Shipping Integrations**:
  - **Delhivery (Active)**: Primary active shipping provider. Configured in `services/shipping/delhiveryProvider.js` using API tokens.
  - **Shiprocket (Alternative)**: Alternative shipping adapter code exists in the repository (`services/shipping/shiprocketProvider.js`) but is not active in the current environment configuration. The setup developer does not need to configure Shiprocket.
- **UI/Visualization**:
  - **Recharts (****`^3.8.1`****)**: Used for analytics charting inside dashboards.
  - **React Top Loading Bar (****`^3.0.2`****)**: Used for page transition visual indicators.

---

## 3. Project Structure

The repository structure is organized as follows:

- **`app/`**: Next.js pages, API routes, and layout structures.
- **`components/`**: Modular UI components.
  - **`components/Admin/`**: Core dashboard layout modules for the platform administrator.
  - **`components/Dashboard/`**: Layout modules for the merchant panel (navigation, sidebar).
  - **`components/landing/`**: UI sections for the marketing homepage (pricing cards, testimonials, FAQ structure).
  - **`components/UI/`**: Shared input controls, action buttons, custom select overlays, and data tables.
- **`context/`**: React contexts providing global states:
  - **`context/AuthContext.js`**: Core Supabase auth session loader and profile data fetcher. Includes stale session self-healing.
  - **`context/CustomerAuthContext.js`**: Auth state for customers logging into storefronts.
  - **`context/AdminAuthContext.js`**: Admin verification checks (calls `verify_admin_credentials` RPC or queries `admin_users` table).
  - **`context/DashboardContext.js`**: Merchant dashboard states (metrics, recent activities caches).
  - **`context/StoreContext.js`**: Customer cart entries, checkbox selections, and wishlist states.
- **`data/`**: Configuration structures and layout assets.
- **`database/`**: Database structures:
  - **`database/schema.sql`**: Full schema snapshot (tables, triggers, policies, RPCs).
  - **`database/migrations/`**: Historical SQL migration snippets.
- **`email-templates/`**: Reference HTML structures for Supabase transactional email customization.
- **`lib/`**: Unified helper initializers:
  - **`lib/supabase.js`**: Supabase JS client instantiation.
  - **`lib/defaultStoreData.js`**: Setup assets for default stores.
- **`public/`**: Static public files (logos, SVGs, background banners).
- **`services/`**: API adapters:
  - **`services/payment/`**: Gateway modules (Cashfree, Razorpay, COD checkout providers).
  - **`services/shipping/`**: Shipment manifest managers (Delhivery, Shiprocket).

### Root Configuration Files

- **`package.json`**: Dependency versions list.
- **`package-lock.json`**: Package resolution lock file.
- **`next.config.mjs`**: Next.js config (images hostname settings, custom HTTP headers).
- **`jsconfig.json`**: Path aliases configurations (`@/*` mapping to root folders).
- **`eslint.config.mjs`**: Code styling linters.
- **`.env.example`**: Variable structure template.
- **`.gitignore`**: Files and directories excluded from version control.
- **`README.md`**: Project documentation guide.

---

## 4. Application Routes

### Public Marketing Routes

- **`/`**: Platform marketing homepage.
- **`/login`**** / ****`/signup`**: Merchant registration and login.
- **`/reset-password`**: Password recovery page.

### Merchant Onboarding & Dashboard Routes

- **`/onboarding`**: Step-by-step merchant registration setup wizard.
- **`/dashboard`**: Main operations summary (charts, recent sales metrics).
- **`/dashboard/products`**: Catalog list and inventory add/edit forms.
- **`/dashboard/categories`**: Category collections setup.
- **`/dashboard/orders`**: Merchant-specific sales tracking and fulfillment status controls.
- **`/dashboard/profile`**: KYC upload, bank detail forms, and profile verification logs.
- **`/dashboard/wallet`**: Available balances, transaction history, and payout withdrawal logs.
- **`/dashboard/settings`**: Store domain, logo, and active shipping options configuration.

### Customer Storefront & Account Routes

- **`/store/[slug]`**: Dynamic store product listing grid.
- **`/store/[slug]/product/[idOrSlug]`**: Individual product details page, stock alerts, and reviews.
- **`/store/[slug]/cart`**: Customer cart (checkbox item selectors, quantity controls).
- **`/store/[slug]/checkout`**: Delivery details inputs and payment gateway page.
- **`/store/[slug]/wishlist`**: Saved items index.
- **`/store/[slug]/login`**** / ****`/store/[slug]/signup`**: Customer authentication for a specific storefront.
- **`/customer/orders`**: Logged-in customer order history index.
- **`/customer/profile`**: Customer contact information.

### Platform Administrator Routes

- **`/admin`**: High-level platform metrics overview.
- **`/admin/creators`**: Seller KYC document review and manual verification overrides.
- **`/admin/stores`**: Global directory of active storefronts.
- **`/admin/payouts`**: Audit log of merchant payout requests.

### Backend API Routes

- **`/api/payment/cashfree/create-session`**: Prepares payment payloads for Cashfree checkout.
- **`/api/payment/cashfree/verify`**: Verifies transaction integrity with Cashfree.
- **`/api/payment/cashfree/webhook`**: Recipient of Cashfree payment events.
- **`/api/shipping/sync`**: Re-syncs tracker payloads from Delhivery/Shiprocket.

---

## 5. Authentication & Authorization

- **Seller Auth**: Authenticates against Supabase Auth using email/password. Checks the `profiles` table to verify `role = 'creator'`. Access to tables is governed by RLS policies checking `auth.uid() = user_id`.
- **Customer Auth**: Managed independently by `CustomerAuthContext` using password or email OTP logic, storing customer details in the `public.customers` table.
- **Admin Auth**: Managed by `AdminAuthContext`. Authenticates by first invoking the database RPC `verify_admin_credentials` (security definer checking hashed values). If the RPC does not exist, it falls back to querying the `admin_users` table directly.
- **Session Cleansing**: If a user is deleted from the database but the browser retains a valid session JWT cookie, the `AuthContext` detects that the profile query returned empty, automatically invokes `supabaseClient.auth.signOut()`, and resets all states.

---

## 6. Seller / Creator System

The seller flow is defined as follows:

- **Registration**: Sign up → land on the `/onboarding` wizard.
- **Onboarding Wizard**: Divided into 6 logical steps:
  1. Welcome.
  2. Store setup (store name, slug, description, and banner & logo image uploads handled by `services/storeService.js`).
  3. Profile & KYC step (business location inputs, ID Proof upload, and Address Proof upload handled by `services/profileService.js`).
  4. Product category creation.
  5. Initial product upload.
  6. Final launching page.
- **Inventory Control**: Sellers update prices, stock levels, and categorize items.
- **Wallets & Payouts**: Completed orders credit the seller's wallet record. Payout requests are initiated on the `/dashboard/wallet` page, adding entries to the `payout_requests` table.

---

## 7. Customer System

- **Browsing**: Resolved dynamically via the store slug page. Product pages query categories and related reviews via `services/reviewService.js`.
- **Cart Page**: Selection checkboxes filter which items are active, dynamically recalculating taxes, subtotals, and shipping costs.
- **Checkout**: Submits shipping addresses and initializes payment modules. Supports Cashfree and Cash on Delivery.
- **Order Tracking**: Order data is written to the `orders` and `order_items` tables. Updates from shipping providers sync tracking updates.

---

## 8. Admin System

The operations console is located under `app/admin/` and provides:

- **Verification Hub**: Located in `app/admin/(dashboard)/creators/page.js`. Displays metrics cards for pending, active, and rejected creators. Admins can click on a seller to inspect their government ID and address proofs, and trigger manual verification status updates.
- **Payout Moderation**: Located in `app/admin/(dashboard)/payouts/page.js`. Admins can inspect merchant bank details, view transaction logs, and mark payout requests as approved or rejected.
- **Stores Management**: Located in `app/admin/(dashboard)/stores/page.js`. Displays system-wide storefront statistics.

---

## 9. Database

KreatorStore utilizes a Supabase PostgreSQL database. Key tables include:

- **`profiles_base`**: Base account details.
- **`sellers`**: Custom seller details (KYC logs, verification statuses).
- **`profiles`** (View): A database view joining `profiles_base` and `sellers`.
- **`stores`**: Configurations for merchant storefronts.
- **`products`**: Product listings, stock counts, and prices.
- **`categories`**: Collections of products within a store.
- **`orders`**** / ****`order_items`**: Order details and items.
- **`creator_documents`**: Storage reference paths for merchant IDs and address proofs.
- **`creator_earnings`**: Wallet balance ledgers.
- **`payout_requests`**: Logs of merchant withdrawal requests.
- **`admin_users`**: Database records for platform administrators.

### Security Definers & Triggers

- **RLS Policies**: Restrict access so creators can only access rows containing their `user_id`.
- **Database Functions**:
  - `verify_admin_credentials`: Secured function verifying admin passwords.
  - `handle_new_user`: Automatically creates corresponding profile records when a user signs up.

---

## 10. Database Migrations

- **Schema Reference**: The `database/schema.sql` is the single consolidated, master base schema reference for database structure.
- **Historical Snippets**: The `database/migrations/` directory contains manual, incremental migration scripts generated historically.
- **No Automated Runner**: The project does not utilize an automated migration tool (like Knex, Prisma, or TypeORM). Database schema modifications are executed manually via the Supabase SQL editor.
- **Execution Safety**: Do **NOT** blindly execute all migration scripts sequentially or alphabetically against the database. For existing databases, re-applying these historical migrations will conflict with existing tables. When initializing a fresh database, restore using `database/schema.sql` and only apply additional migration patches after verifying their specific purpose and dependency history.

---

## 11. File / Code Responsibility Map

| Feature | Main Files/Folders | Responsibility |
|---|---|---|
| **Authentication Contexts** | `context/AuthContext.js`<br>`context/CustomerAuthContext.js`<br>`context/AdminAuthContext.js` | Manage session loading, cookie storage, and auto-logout state resets. |
| **Merchant Forms** | `app/(auth)/login/page.js`<br>`app/(auth)/signup/page.js` | Handle creator logins and password resets. |
| **Setup Wizard** | `app/onboarding/page.js` | Implements the 6-step onboarding wizard. |
| **Storefront Logic** | `app/store/[slug]/StoreClient.js` | Directs the dynamic storefront customer catalogs and category filters. |
| **Cart Management** | `app/store/[slug]/cart/page.js`<br>`context/StoreContext.js` | Manages cart storage, checkbox selectors, and price recalculations. |
| **Checkout & Verification** | `app/store/[slug]/checkout/page.js`<br>`services/checkoutService.js` | Validates customer cart entries and redirects to payment providers. |
| **Payment Gateways** | `services/payment/` | Handles integrations for Cashfree, Razorpay, and Cash on Delivery. |
| **Shipping Carriers** | `services/shipping/` | Connects with Delhivery and Shiprocket APIs. |
| **Wallet Payouts** | `services/walletService.js`<br>`services/payoutService.js` | Handles seller wallet updates and admin payout approvals. |
| **Supabase Client** | `lib/supabase.js` | Instantiates the client SDK using environment keys. |

---

## 12. Email System

- **Supabase Auth Emails**: The platform delegates transactional authentication emails (verification, password resets, magic links, etc.) directly to Supabase Auth.
- **Templates**: The custom HTML structures for these transactional templates are stored inside `email-templates/`.
- **SMTP Provider (Resend)**: Supabase is configured to route transactional emails via **Resend** using Custom SMTP parameters.
- **Verified Domain**: The verified sending domain is configured and verified directly inside the Resend portal.
- **Dashboard Configuration**: All SMTP host configurations, verified port numbers, and authentication passwords/credentials are configured directly within the Supabase Auth SMTP configuration panel and must not be stored in environment variables or committed to the repository. The Next.js application does not use a direct Resend SDK or API endpoint.

---

## 13. Domain & Deployment

- **Client Hosting**: Managed on Vercel.
- **Database & Auth**: Hosted on Supabase.
- **Store slugs**: Dynamic storefront routes are served from `/store/[slug]`. This is distinct from custom-domain-per-store routing.
- **Handover Configuration Separation**:
  - **Repository**: Source code, database references, template HTMLs, configurations (`package.json`, `.env.example`, etc.).
  - **Vercel Settings**: Handles client-side environment variables and base site domains.
  - **Supabase Dashboard**: Manages table triggers, database security RLS policies, bucket setups, and SMTP mailer parameters.
  - **Resend Console**: Configures DNS domain verification records for mail dispatches.

---

## 14. Environment Variables

Define the following environment variables in `.env.local` for local development. This table matches `.env.example` exactly.

### Public Configurations

- **`NEXT_PUBLIC_SUPABASE_URL`**: Supabase project endpoint connection URL.
- **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**: Supabase anonymous client API key.
- **`NEXT_PUBLIC_ACTIVE_PAYMENT_PROVIDER`**: Active provider selector (currently set to `Cashfree`).
- **`NEXT_PUBLIC_BASE_URL`**: Target host production origin base URL (currently set to `https://kreatorstore.in`).
- **`NEXT_PUBLIC_ACTIVE_SHIPPING_PROVIDER`**: Active shipping provider selector (currently set to `Delhivery`).

### Secret/Server Configurations

- **`CASHFREE_CLIENT_ID`**: Cashfree API client authentication ID.
- **`CASHFREE_CLIENT_SECRET`**: Cashfree API client authentication secret key.
- **`CASHFREE_ENV`**: Cashfree API mode (currently set to `TEST` for sandbox/testing).
- **`DELHIVERY_API_TOKEN`**: Delhivery API credential token.
- **`DELHIVERY_ENV`**: Delhivery mode (currently set to `production`).

---

## 15. Local Development Setup

Follow the command blocks below to set up and run the application locally or compile production bundles.

### Clone the Repository

```bash
git clone <repository_url>
cd Internship
npm install
```

### Start the Development Server

```bash
npm run dev
```

The development server will start on the configured local Next.js development port.

### Build and Run the Production Version

```bash
npm run build
npm run start
```

### Environment Configuration

Before starting the application:

1. Copy `.env.example` to `.env.local`.
2. Add the required actual credentials and configuration values.
3. Never commit `.env.local` to version control.

---

## 16. Database Setup / Handover

To replicate the database schema on a new Supabase project:

1. Copy the contents of `database/schema.sql` and run it in the Supabase SQL editor to bootstrap all baseline tables, views, and functions.
2. The files inside `database/migrations/` serve as historical manuals. Do not execute them blindly against an active production database. Only apply additional patches manually if specific triggers require update logs.
3. Configure the storage buckets inside the Supabase Storage dashboard according to the security guidelines below.

---

## 17. Supabase Storage Security

Buckets must be configured in Supabase Storage with the following access scopes:

- **Publicly Accessible Buckets** (`store-logos`, `store-banners`, `product-images`, `category-images`):
  - **Read Access**: Open/Public select policies to allow storefront customers to load banners and product images dynamically.
  - **Write Access**: Restricted to authenticated sellers matching their user ID (`auth.uid() = user_id` on the object prefix).
- **Restricted/Authenticated Bucket** (`verification-documents`):
  - **Contains**: Government ID Proofs and Address Proofs.
  - **Security Scope**: Must **NOT** be open to the public. Read and write privileges must be restricted to authenticated owners (matching `auth.uid() = creator_id` based on folder prefix) and platform administrators.

---

## 18. Production Deployment

1. Connect your Git repository to Vercel.
2. Bind the environment variables from `.env.example` in the Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_ACTIVE_PAYMENT_PROVIDER`
   - `NEXT_PUBLIC_BASE_URL`
   - `CASHFREE_CLIENT_ID`
   - `CASHFREE_CLIENT_SECRET`
   - `CASHFREE_ENV`
   - `DELHIVERY_API_TOKEN`
   - `DELHIVERY_ENV`
   - `NEXT_PUBLIC_ACTIVE_SHIPPING_PROVIDER`
3. The production base URL is: `https://kreatorstore.in`

---

## 19. Testing & Verification

Verify your configuration using the following workflows:

- **Onboarding & Document Upload**: Sign up as a creator → complete onboarding steps → upload KYC documents and verify the form input states do not reset.
- **Customer Store Checkout**: Go to `/store/[slug]` → add products to cart → verify checkout calculations change on item check/uncheck states → complete order via gateway sandbox.
- **Admin Audits**: Log in as admin → go to `/admin/creators` → verify document inspection and merchant approval controls.

---

## 20. Known Limitations

- **Next.js Compilation**: Next.js production builds compile successfully without errors.
- **Linter Warnings**: Pre-existing code configurations in React contexts (`AdminContext.js`, `StoreContext.js`, `AuthContext.js`) trigger ESLint warnings regarding synchronous `setState` updates inside effects. These are non-blocking for production builds but should be refactored if modifying context logic.

---

## 21. Troubleshooting

### Timeout Screens

- **Symptom**: Main page shows "Seller Authorization Timeout".
- **Solution**: Verify database availability, check network blocks, and ensure `NEXT_PUBLIC_SUPABASE_URL` is set correctly.

### Dynamic Logo/Banners 404

- **Symptom**: Logo is missing after onboarding upload.
- **Solution**: Ensure public storage buckets are public-readable.

---

## 22. Handover Notes

### Included in Repository

- Next.js App Router source code.
- SQL database configurations (`database/schema.sql`, `database/migrations/`).
- Email templates (`email-templates/`).
- Core configuration files:
  - `package.json`
  - `package-lock.json`
  - `next.config.mjs`
  - `jsconfig.json`
  - `eslint.config.mjs`
  - `.env.example`
  - `.gitignore`

### Not Included

- `node_modules/` and `.next/` directories.
- Local secrets (e.g. `.env.local`).
- Supabase Storage settings, custom domain configurations, and payment app IDs.

---

## 23. Security

- **Secret Management**: Never commit `.env.local` to Git.
- **Key Scopes**: Always store credentials (like `CASHFREE_CLIENT_SECRET` or `DELHIVERY_API_TOKEN`) as secret variables on your hosting platform, never exposing them in client-side bundles. Use `NEXT_PUBLIC_` prefixes only for public variables.