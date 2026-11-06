# TCT Asset Tracker — Lightweight IT Asset Lifecycle Tracker

Deliberately lightweight, zero-bloat **5-Stage IT Asset Lifecycle Tracker** built for IT managers at **50–300 employee companies** who have outgrown fragile spreadsheets (`IT_Inventory_MASTER_v14_FINAL.xlsx`) but do not need ServiceNow or Ivanti.

---

## Core Capabilities

1. **The 5-Stage Lifecycle State Machine (`src/lib/lifecycle-machine.ts`)**
   - **1. Procurement**: Track POs, unit cost, warranty expiry, target EOL, and catch duplicate purchases *before* buying.
   - **2. Deployment**: Confirm employee custody, department chargeback, and physical/remote location.
   - **3. Maintenance**: Log RMA tickets, auto-check warranty coverage vs. out-of-pocket repair spend, and assign idle loaners.
   - **4. Optimization**: Surface reclaimed offboarded laptops and idle closet hardware ready for reallocation.
   - **5. Decommission**: Record NIST 800-88 data wipe certificate references and salvage/buyback recovery for Finance.

2. **Live "Money Leaks" Engine**
   - **Duplicate / Redundant Purchase Guard**: Flags *"You already own X of this model, unused"* both on the dashboard and inside the Procurement modal in real time, with 1-click reallocation of idle stock.
   - **Unlocated / Ghost Asset Value Calculator (Business Case Validator)**: Answers *"What is the total purchase value of assets you cannot currently locate or confirm the status of?"* by flagging contradictory, unlocated, or incomplete spreadsheet records.
   - **Warranty Expiry & EOL Horizon Alerts**: Highlights warranties expiring within 60 days (submit RMAs before warranty ends!) and approaching/past EOL (90-day capex forecast).

3. **Zero-Re-Entry CSV Spreadsheet Importer (`src/lib/csv-importer.ts`)**
   - Auto-maps messy spreadsheet columns, normalizes inconsistent hardware model names, and imports all rows in a single ACID transaction.

4. **Finance Lifecycle Report & Capex Forecaster (`src/components/FinanceReportView.tsx`)**
   - Computes 36-month straight-line depreciation book value and per-department chargebacks.
   - **Hardware Refresh & Capex Forecaster**: Simulates upcoming 90-day, 180-day, or 365-day replacement spend across Laptops, Monitors, and Servers with 12% buyback salvage credit and 1-click plan export.

5. **Physical Audit & Barcode/QR Rapid Scanner (`src/components/PhysicalAuditScannerModal.tsx`)**
   - Press **`B`** or click **Audit Scanner** to instantly look up any asset via USB laser scanner, mobile QR, or typed tag.
   - 1-click physical custody verification with live session audit tally and automatic anomaly resolution.

6. **Printable Barcode & QR Asset Tag Labels (`src/lib/qr-generator.ts`, `src/components/AssetLabelPrintModal.tsx`)**
   - Zero-dependency pure-TypeScript vector QR code matrix (ISO/IEC 18004) and Code 39 1D barcode generator.
   - Print thermal labels (2" × 1" or sheet format) or download SVG labels directly from any asset drawer or batch selection.

7. **Multi-Asset Bulk Actions & Table Sorting (`src/components/LifecycleTrackerApp.tsx`)**
   - Checkbox multi-select with select-all for filtered rows.
   - Docked floating bulk toolbar: Batch Verify Custody, Batch Stage Transition, Batch Print Labels, Batch CSV Export, and Bulk Delete.
   - Clickable sortable table headers for Tag, Model, Stage, Custodian, Cost, Book Value, and Warranty horizon.
   - Interactive Quick Filter chips: Needs Custody Audit, Idle Closet Stock, Expiring Warranty, Past EOL, and Maintenance.

8. **Full Asset Specification Editor (`src/components/EditAssetModal.tsx`)**
   - Edit any hardware specification, S/N, vendor, PO number, purchase cost, warranty/EOL dates, or custodian without needing a stage transition.

9. **Global Fleet Activity Log & Immutable Audit Trail (`src/components/FleetActivityLogModal.tsx`)**
   - Press **`L`** or click **Activity Log** to view chronological fleet events, filter by stage or actor, and export to CSV for SOC2 / ISO 27001 compliance.

10. **Full Fleet Backup & Power-User Shortcuts**
    - 1-click full 35-column fleet CSV export and complete relational JSON database backup.
    - Keyboard navigation: `/` (Search), `N` (Procure), `B` (Audit Scanner), `L` (Activity Log), `F` (Toggle Finance), `?` (Shortcuts cheat sheet), `Esc` (Close modals).

---

## Full-Stack Next.js Architecture: Neon PostgreSQL (Production) + SQLite (Local)

This application is built as an **all-in-one full-stack Next.js 15+ application** using Bun / Node.js, featuring a dual-database architecture:

1. **Production (PostgreSQL on Neon)**:
   - When deployed to production (e.g. Vercel, Neon, Railway), set `DATABASE_URL` to your pooled Neon connection string.
   - Automatically utilizes `@prisma/adapter-neon` with `@neondatabase/serverless` for serverless WebSocket connection pooling, zero connection leaks, and sub-10ms query times.
   - Strongly typed `AssetRecord` (`@@map("assets")`) and `LifecycleEventRecord` (`@@map("lifecycle_events")`) Prisma schema with PostgreSQL enums, `@db.Decimal(12, 2)` financial columns, `@db.Timestamptz(6)` timestamps, and `@db.JsonB` metadata.
   - Automatically executes production composite indexes and self-seeds on first launch if empty.

2. **Local Development (SQLite — Zero Configuration)**:
   - When `DATABASE_URL` is omitted, the application runs 100% locally on SQLite WAL (`lifecycle-tracker.db`).
   - Requires zero Docker setup, zero cloud accounts, and zero local database installations.
   - 100% feature parity: all 5 lifecycle stages, money leaks engine, CSV spreadsheet importer, 36-month depreciation, barcode label generator, physical audit scanner, and immutable audit logs work out of the box.
   - Dedicated SQLite Prisma schema (`prisma/schema.sqlite.prisma`) allows running Prisma Studio locally (`bun run db:sqlite:studio`).

---

### Quick Start with Bun or NPM

```bash
# Install dependencies
bun install
# or: npm install

# Run local development server (uses SQLite with zero setup)
bun dev
# or: npm run dev
# Visit http://localhost:3000
```

### Production Deployment with Neon PostgreSQL

```bash
# 1. Set your Neon database connection string in .env or your host environment
DATABASE_URL="postgresql://neondb_owner:YOUR_PASSWORD@ep-xyz-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"

# 2. Build & generate Prisma client
bun run build
# or: npm run build

# 3. Start the production server
bun run start
# or: npm run start
```

### Database & Prisma Tooling Scripts

| Command | Description |
| :--- | :--- |
| `bun dev` | Starts Next.js development server with hot-reload |
| `bun run build` | Generates Prisma client and compiles optimized production build |
| `bun run db:generate` | Generates production Prisma client (`@prisma/client`) |
| `bun run db:push` | Pushes Prisma schema to PostgreSQL / Neon database |
| `bun run db:studio` | Opens Prisma Studio GUI for PostgreSQL / Neon |
| `bun run db:sqlite:generate` | Generates local SQLite Prisma client (`@prisma/client-sqlite`) |
| `bun run db:sqlite:push` | Pushes SQLite schema to `lifecycle-tracker.db` |
| `bun run db:sqlite:studio` | Opens Prisma Studio GUI for local SQLite |
