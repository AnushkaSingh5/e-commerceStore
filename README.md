# KreatorStore - Multi-Tenant E-Commerce Platform

KreatorStore is a multi-tenant e-commerce SaaS platform that enables merchants to register, configure custom storefronts, and manage product catalogs. The codebase provides distinct workflows for sellers, customers, and platform administrators, built on a unified relational database architecture.

## Main Features
- **Merchant Operations**: Sellers sign up, establish store profiles, submit KYC documents, and manage categories and products.
- **Customer Stores**: Storefronts are dynamically resolved via slug-based paths (e.g., `/store/[slug]` or `/demo-store/[slug]`). Customers can browse products, manage carts, checkout via secure payment gateways, and track orders.
- **Platform Operations**: Administrators verify creator KYC profiles, review uploaded identity files, process pending wallet payout requests, audit stores, and moderate reviews.
- **Unified Relational Database**: Structured on Supabase PostgreSQL with Row Level Security (RLS), triggers, views, and custom RPC definitions.

## Technology Stack
- **Framework**: Next.js 16.2.4 (App Router & Turbopack compiler)
- **UI Library**: React 19.2.4
- **Language**: Pure JavaScript (no TypeScript)
- **Database**: PostgreSQL hosted on Supabase
- **Authentication**: Supabase Auth
- **Payment Gateways**: Cashfree PG (Active), Razorpay (Alternative stub)
- **Shipping Carrier**: Delhivery (Active), Shiprocket (Alternative stub)
- **Email System**: Supabase Auth SMTP server routed through Resend SMTP

## Installation & Setup

1. **Clone the Repository**:
   ```bash
   git clone <repository_url>
   cd <project-folder>
   ```

2. **Install Node.js Requirements**:
   ```bash
   npm install
   ```

3. **Environment Setup**:
   - Copy `.env.example` to `.env.local`:
     ```bash
     cp .env.example .env.local
     ```
   - Configure the required environment variables in `.env.local` using placeholders from `.env.example`.
   - *Security Note:* `.env.local` contains actual production/service credentials and **MUST NOT** be shared or included in the final repository handover ZIP. Actual credentials should be obtained from the authorized company/project owner.

4. **Run Development Server**:
   ```bash
   npm run dev
   ```
   - Open [http://localhost:3000](http://localhost:3000) in your browser.

5. **Build and Run Production Version**:
   ```bash
   npm run build
   npm run start
   ```

## Full Project Documentation

For complete project architecture, folder-by-folder explanation, workflows, database structure, integrations, deployment details, and navigation guide, see:

[PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md)