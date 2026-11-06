# Project Documentation: Lightweight IT Asset Lifecycle Tracker ("Spreadsheet Escape")

> **Version:** 1.0.0  
> **Target Audience:** IT Managers, Systems Engineers, DevOps, and Finance Leaders managing fleets of 50–300 employees.  
> **Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Prisma ORM v6, PostgreSQL 16 (with SQLite WAL Fallback), Tailwind CSS, shadcn/ui.

---

## Table of Contents

1. [Executive Summary & Purpose](#1-executive-summary--purpose)
2. [Why Spreadsheets Fail (The Business Problem)](#2-why-spreadsheets-fail-the-business-problem)
3. [System Architecture & Core Technology](#3-system-architecture--core-technology)
4. [The 5-Stage Lifecycle State Machine](#4-the-5-stage-lifecycle-state-machine)
5. [The "Money Leaks" Detection Engine](#5-the-money-leaks-detection-engine)
6. [Zero-Re-Entry CSV Spreadsheet Importer](#6-zero-re-entry-csv-spreadsheet-importer)
7. [Finance & Depreciation Engine](#7-finance--depreciation-engine)
8. [User Interface & Mission Control HUD](#8-user-interface--mission-control-hud)
9. [Database Schema & Data Model](#9-database-schema--data-model)
10. [REST API Reference](#10-rest-api-reference)
11. [Installation, Setup & Deployment](#11-installation-setup--deployment)
12. [Business Value & Concrete ROI Analysis](#12-business-value--concrete-roi-analysis)

---

## 1. Executive Summary & Purpose

**Spreadsheet Escape** is a high-speed, deliberately lightweight, zero-bloat **IT Asset Lifecycle Tracker** engineered specifically for growing mid-sized organizations (50–300 employees). 

At this operational scale, companies routinely experience a common operational bottleneck:
- **Spreadsheets (`IT_Inventory_MASTER_v14_FINAL.xlsx`)** have devolved into fragile, contradictory silos with stale data, untracked laptop reassignments, and hidden duplicate purchases.
- **Enterprise ITAM/ITSM platforms (ServiceNow, Ivanti, Flexera)** are dramatically over-engineered, requiring \$50,000+ annual software contracts, 3–6 months of consulting integration, and dedicated system administrators.

**Spreadsheet Escape provides the ideal sweet spot:**
1. **Instant time-to-value:** Operates out of the box with zero complex configuration.
2. **Deterministic 5-Stage Lifecycle:** Enforces clean transitions from Procurement through Deployment, Maintenance, Optimization, to Decommissioning.
3. **Automated Money Leak Identification:** Instantly flags idle closet stock, duplicate purchase orders, unlocated ghost assets, and warranties expiring within 60 days.
4. **Seamless Spreadsheet Migration:** Features an intelligent CSV ingestion engine that auto-corrects messy naming, resolves contradictions, and imports hundreds of assets in a single atomic transaction.
5. **Audit-Ready Financials:** Built-in straight-line depreciation engine, department chargeback metrics, and NIST 800-88 data sanitization compliance logs.

---

## 2. Why Spreadsheets Fail (The Business Problem)

Most 50–300 person businesses track high-value hardware (laptops, monitors, networking gear, enterprise docks) using shared Excel or Google Sheets. As employee turnover occurs and hardware is serviced, spreadsheets inevitably corrupt operations through 5 fatal patterns:

| Failure Mode | Spreadsheet Reality | Spreadsheet Escape Solution |
| :--- | :--- | :--- |
| **Silent Capex Leaks** | IT orders new \$2,500 laptops for incoming hires because nobody knows 3 identical units are sitting in a storage closet. | **Redundant Purchase Guard:** Automatically detects idle units of the requested model and warns the buyer in real time before placing POs. |
| **Ghost Assets** | Rows list employees who resigned 6 months ago, or status says "In Closet" while assigned to a custodian. | **Ghost Asset Calculator:** Quantifies the exact capital trapped in contradictory, unlocated, or incomplete records. |
| **Missed Warranty RMAs** | Broken equipment sits on a shelf until the 3-year warranty lapses; IT then pays \$600–\$1,200 out of pocket for repairs. | **Warranty Horizon Alerts:** Proactively surfaces devices whose warranties expire within 60 days so RMAs are filed while free. |
| **Compliance & Security Gaps** | Disposed laptops are marked "Thrown away" without proof that customer and corporate data was securely wiped. | **NIST 800-88 Certification Record:** Mandates data wipe certificate IDs and buyback recovery values prior to retirement. |
| **Finance Disconnect** | Finance relies on arbitrary bulk depreciation and cannot accurately charge back IT costs by department. | **Automated Depreciation Ledger:** Real-time 36-month straight-line book values and per-department chargeback breakdowns. |

---

## 3. System Architecture & Core Technology

Spreadsheet Escape is built with a modern, high-performance architecture emphasizing sub-second page loads, strict relational integrity, and seamless offline capability.

```mermaid
graph TD
    subgraph Client ["Client Browser (Next.js 15 App Router / React 19)"]
        UI["LifecycleTrackerApp (HUD, Kanban, Table, Finance)"]
        Drawers["AssetDetailDrawer & TransitionModal"]
        Importer["CsvImportModal (Heuristic Parser)"]
    end

    subgraph API ["Next.js Server API Routes (/api/assets)"]
        RouteHandler["REST Route Handlers (GET, POST, PATCH, DELETE)"]
        Engine["Lifecycle Machine & Money Leaks Analytics Engine"]
    end

    subgraph Repo ["Unified Repository Layer (src/lib/db.ts)"]
        Router{"PostgreSQL Operational?"}
        PrismaRepo["Prisma ORM v6 (@prisma/adapter-pg + pg.Pool)"]
        SqliteRepo["Node.js Native DatabaseSync (SQLite WAL)"]
    end

    subgraph Storage ["Persistent Storage Engines"]
        PG[("PostgreSQL 16 Database")]
        SQLite[("lifecycle-tracker.db (Local File)")]
    end

    UI --> RouteHandler
    Drawers --> RouteHandler
    Importer --> RouteHandler
    RouteHandler --> Engine
    Engine --> Repo
    Router -- "Yes (DATABASE_URL)" --> PrismaRepo --> PG
    Router -- "No / Offline Fallback" --> SqliteRepo --> SQLite
```

### Key Technical Highlights:
- **Framework:** Next.js 15 App Router with React 19 client components and TypeScript strict mode.
- **Design System:** Custom UI constructed on top of `shadcn/ui`, `lucide-react` iconography, and Tailwind CSS with full dark/light theme persistence.
- **Dual-Engine Persistence with Automatic Failover:**
  - **Production PostgreSQL 16:** Utilizes Prisma ORM v6 with `@prisma/adapter-pg` plugged into a tuned `pg.Pool` connection pool. Supports high concurrency, composite indexes, and JSONB audit logging.
  - **Zero-Config Local SQLite Fallback:** When running offline or during local development without a database container, `src/lib/db.ts` automatically falls back to Node.js's built-in `node:sqlite` (`DatabaseSync`) configured with Write-Ahead Logging (`PRAGMA journal_mode = WAL;`).
  - **Transparent Reconnection:** The application monitors database health with a 30-second cooldown period, preventing application crashes if PostgreSQL experiences transient network interruptions.
- **ACID Transaction Guarantee:** All stage advancements, custody reassignments, and CSV batch migrations execute within transactional boundaries (`prisma.$transaction` or SQLite `BEGIN IMMEDIATE`).

---

## 4. The 5-Stage Lifecycle State Machine

At the core of the system is a deterministic finite-state machine defined in [`src/lib/lifecycle-machine.ts`](file:///d:/Program/Network_Project/Lightweight%20IT%20Asset%20Lifecycle%20Tracker/src/lib/lifecycle-machine.ts). Assets can only transition along approved operational pathways.

```mermaid
stateDiagram-v2
    [*] --> Procurement: PO Created / Received

    state Procurement {
        Ordered --> InStock_Unused
        InStock_Unused --> Staging_Imaging
    }

    Procurement --> Deployment: Assign Custodian
    Procurement --> Optimization: Hold in IT Pool
    Procurement --> Decommission: DOA / Write-off

    state Deployment {
        Active_Assigned --> Shared_ConferenceRoom
        Active_Assigned --> Loaner_Active
    }

    Deployment --> Maintenance: Hardware Issue / RMA
    Deployment --> Optimization: Employee Offboarding
    Deployment --> Decommission: Reached EOL

    state Maintenance {
        UnderRepair_RMA --> AwaitingVendorParts
        AwaitingVendorParts --> Diagnostics_Bench
    }

    Maintenance --> Deployment: Repaired & Re-deployed
    Maintenance --> Optimization: Repaired to Reserve
    Maintenance --> Decommission: Unrepairable

    state Optimization {
        Idle_ReadyToReallocate --> Offboarded_InCloset
        Offboarded_InCloset --> Offboarded_AwaitingReturn
        Offboarded_AwaitingReturn --> Underutilized
    }

    Optimization --> Deployment: Reallocate to New Hire
    Optimization --> Maintenance: Needs Servicing
    Optimization --> Decommission: End of Life / Salvage

    state Decommission {
        Retired_DataWiped --> Sold_Buyback
        Sold_Buyback --> EWaste_Recycled
        EWaste_Recycled --> WrittenOff_LostStolen
    }

    Decommission --> Optimization: Reactivate (Exception Only)
```

### Detailed Breakdown of the 5 Stages:

#### Stage 1: Procurement
- **Purpose:** Tracks purchase orders, arrival status, vendor warranty contracts, and initial costs before hardware is deployed.
- **Sub-Statuses:** `Ordered`, `In Stock - Unused`, `Staging / Imaging`.
- **Enforced Fields:** PO Number, Purchase Date, Purchase Cost, Warranty Expiry Date, Target EOL Date, Vendor.
- **Automated Check:** Duplicate Purchase Guard checks whether identical hardware models already sit idle before procurement confirmation.

#### Stage 2: Deployment
- **Purpose:** Verifies employee custody, departmental chargeback, and exact location.
- **Sub-Statuses:** `Active - Assigned`, `Shared / Conference Room`, `Loaner Active`.
- **Enforced Fields:** Custodian Name, Assigned Email, Department (Engineering, Sales, Marketing, etc.), Physical Location, Condition, Deployment Date.
- **Audit Verification:** When deployed, previous spreadsheet anomalies and ghost asset flags are automatically resolved and marked verified.

#### Stage 3: Maintenance
- **Purpose:** Tracks hardware repairs, vendor RMA numbers, and out-of-pocket repair costs vs. active warranty coverage.
- **Sub-Statuses:** `Under Repair - RMA`, `Awaiting Vendor Parts`, `Diagnostics / IT Bench`.
- **Key Capabilities:**
  - Automated detection of whether repairs are covered under warranty.
  - Loaner unit linking (`loanerAssetTag`), allowing IT to deploy temporary laptops without losing track of primary assets.
  - Cumulative repair spend ledger to determine if an asset has exceeded its economic replacement value.

#### Stage 4: Optimization
- **Purpose:** Reclaims laptops from offboarded employees and manages the idle reserve pool for rapid reallocation.
- **Sub-Statuses:** `Idle - Ready to Reallocate`, `Offboarded - In IT Closet`, `Offboarded - Awaiting Return`, `Underutilized - Candidate for Reclaim`.
- **Key Capabilities:**
  - Tracks `idleSinceDate` to highlight assets accumulating depreciation without creating business value.
  - 1-Click Reallocation button to directly deploy idle hardware to incoming hires, preventing unnecessary procurement spend.

#### Stage 5: Decommission
- **Purpose:** Ensures responsible data destruction, environmental compliance, and financial asset retirement.
- **Sub-Statuses:** `Retired - Data Wiped`, `Sold / Buyback Recovered`, `E-Waste Recycled`, `Written Off - Lost/Stolen`.
- **Compliance & Recovery:**
  - Captures mandatory **NIST 800-88 Data Sanitization Certificate** references.
  - Tracks **Salvage Recovery Value** (buyback credits or resale cash) which credits back against overall IT capex.

---

## 5. The "Money Leaks" Detection Engine

Rather than functioning as a passive database, Spreadsheet Escape actively analyzes every asset in real time using the `enrichAssetsAndAnalyzeLeaks()` rule engine.

```mermaid
flowchart LR
    FleetData["Fleet Assets & Records"] --> Engine["enrichAssetsAndAnalyzeLeaks()"]
    
    Engine --> Leak1["1. Redundant Purchase Alert<br/>(Idle stock vs New POs)"]
    Engine --> Leak2["2. Ghost Asset Calculator<br/>(Contradictions & Lost Gear)"]
    Engine --> Leak3["3. Warranty Horizon<br/>(Expiring in 60d / Free RMA)"]
    Engine --> Leak4["4. EOL Capex Forecast<br/>(Approaching 90d Refresh)"]

    Leak1 --> HUD["Executive HUD & Instant Filters"]
    Leak2 --> HUD
    Leak3 --> HUD
    Leak4 --> HUD
```

### The 4 Money Leak Pillars:

### 1. Redundant & Idle Stock Guard
- **The Problem:** Department managers submit requests for new laptops while identical, perfectly good hardware sits in an IT storage cabinet or is held in offboarding limbo.
- **How It Works:** Normalizes model names (e.g. `Apple MacBook Pro 14" (M3 Pro)` $\rightarrow$ `macbook pro 14 m3 pro`) and clusters assets. If an asset is `Ordered` while an identical unit is `In Stock - Unused` or `Idle - Ready to Reallocate`, the system triggers an alert:
  > *"Redundant order: Buying 1 new while you already own 2 of this model unused ($3,998 sitting idle)."*
- **Action:** Provides a 1-click option to cancel or hold the PO and reallocate existing hardware.

### 2. Unlocated / Ghost Asset Calculator (Business Case Validator)
- **The Problem:** In spreadsheets, rows accumulate contradictory data: status says "In Closet" but lists a former employee who left 8 months ago, or serial numbers are completely missing.
- **How It Works:** Evaluates assets for verification flags (`contradictory`, `unlocated`, `missing_data`). It tallies the exact dollar value of all unconfirmed assets.
- **Business Impact:** Answers the CFO's core audit question: *"What is the total purchase value of assets you cannot physically account for today?"*

### 3. Warranty Horizon & RMA Protection
- **The Problem:** Enterprise laptops typically have a 1-year or 3-year warranty. IT teams often neglect minor defects until month 37, forcing the company to pay out-of-pocket for screen or logic board repairs.
- **How It Works:** Calculates `daysToWarrantyExpiry`. Any active hardware within $\le 60\text{ days}$ of expiration is flagged with an amber warning: *"Expiring Soon — submit RMAs for battery, keyboard, or screen defects before coverage lapses."*

### 4. End-of-Life (EOL) 90-Day Capex Horizon
- **The Problem:** Annual budget cycles get disrupted by surprise refresh waves when 30 laptops suddenly hit end-of-life simultaneously.
- **How It Works:** Tracks target EOL dates against a 90-day threshold. Forecasts exact upcoming hardware replacement capital expenditures required for Finance planning.

---

## 6. Zero-Re-Entry CSV Spreadsheet Importer

Migrating off a legacy spreadsheet is typically the highest hurdle for IT managers. Spreadsheet Escape solves this with [`src/lib/csv-importer.ts`](file:///d:/Program/Network_Project/Lightweight%20IT%20Asset%20Lifecycle%20Tracker/src/lib/csv-importer.ts).

### Intelligent Ingestion Features:
1. **Fuzzy Header Matching:** Recognizes messy spreadsheet column names automatically:
   - Asset Tag: `asset tag`, `tag`, `asset id`, `id`
   - Model: `model`, `item`, `device`, `product`, `name`
   - Custodian: `who`, `assigned`, `owner`, `user`, `employee`, `custodian`
   - Cost: `cost`, `price`, `value`, `amount` (cleans `$`, `,`, and whitespace)
2. **Category & Stage Inference:**
   - Detects `Monitor`, `Laptop`, `Phone / Tablet`, `Server / Network`, and `Dock / Peripheral` from free-text descriptions.
   - Infers the lifecycle stage: phrases like *"In closet Derek Hale (Left Co)"* automatically map to `optimization` (`Offboarded - Awaiting Return`) while flagging a contradiction anomaly.
3. **Pre-Import Anomaly Highlighting:** Before saving, the UI displays a side-by-side verification table indicating missing serial numbers, redundant purchase alerts, and contradictory custodian records.
4. **Single Atomic Transaction:** Once confirmed, all parsed rows and initial audit log events are inserted via an ACID transaction (`bulkCreateAssets`), preventing partial or corrupt imports.

---

## 7. Finance & Depreciation Engine

Spreadsheet Escape bridges the gap between IT operations and Corporate Accounting through [`src/components/FinanceReportView.tsx`](file:///d:/Program/Network_Project/Lightweight%20IT%20Asset%20Lifecycle%20Tracker/src/components/FinanceReportView.tsx).

### 1. Straight-Line Depreciation Methodology
The system calculates real-time net book value using a standard corporate **36-month straight-line depreciation schedule** with an active residual floor:

$$\text{AgeMonths} = \text{round}\left(\frac{\text{Today} - \text{PurchaseDate}}{30.44}\right)$$

$$\text{DepreciatedValue} = \text{PurchaseCost} \times \left(1 - \frac{\min(\text{AgeMonths}, 36)}{36}\right)$$

$$\text{ActiveBookValue} = \max(0.10 \times \text{PurchaseCost}, \text{DepreciatedValue})$$

> **Note:** Active units retain a 10% salvage floor while in service. Once an asset transitions to `decommission`, its book value is automatically locked to its actual realized `salvageValue`.

### 2. Departmental Chargeback Matrix
Aggregates Capex, current book value, repair spending, salvage recovery, and ghost asset risk by department (`Engineering`, `Product & Design`, `Sales`, `Marketing`, `Finance & Admin`, `Operations`).

### 3. One-Click Audit Exports
- **Full Asset Lifecycle Register (CSV):** Detailed line-item register containing original cost, depreciated value, age in months, warranty status, and NIST wipe certificates.
- **Department Chargeback Summary (CSV):** Executive summary for monthly or quarterly financial accounting reconciliation.

---

## 8. User Interface & Mission Control HUD

The user interface is designed like a mission-control operations center, eliminating nested menus in favor of clear, dense, functional information displays.

```
+---------------------------------------------------------------------------------------------------+
|  [Boxes] Spreadsheet Escape  [5-Stage Lifecycle]  [Prisma + PG16]         [Procure Asset] [Migrate CSV] [Finance] [Theme] |
+---------------------------------------------------------------------------------------------------+
|  [LEAK 1: Redundant & Idle]  [LEAK 2: Ghost Assets]   [LEAK 3: Warranty Risk]   [LEAK 4: EOL Horizon]     |
|  $11,847 (6 idle units)      $4,648 (3 unconfirmed)   2 expiring / 1 expired    3 units due ($5,847)      |
+---------------------------------------------------------------------------------------------------+
|  [Kanban Board View]  [Table Register View]  [Finance Report View]        [Search: _______________]   |
+---------------------------------------------------------------------------------------------------+
|  Procurement (2)   |  Deployment (12)    |  Maintenance (2)   |  Optimization (4)  |  Decommission (2)    |
|  - AST-1001 (Ord)  |  - AST-1003 (M3)    |  - AST-1014 (RMA)  |  - AST-1004 (Idle) |  - AST-1022 (Wiped)  |
|  - AST-1002 (Stk)  |  - AST-1005 (Dell)  |  - AST-1015 (Diag) |  - AST-1018 (Offb) |  - AST-1023 (Sold)   |
|  [+ New Order]     |  [Deploy Unit]      |  [Log RMA]         |  [Reallocate]      |  [Certify Wipe]      |
+---------------------------------------------------------------------------------------------------+
```

### Core Interface Components:
1. **Executive HUD Radar:** 4 interactive metric cards. Clicking any card (e.g. *Ghost Assets*) instantly filters the entire Kanban board and table view to those specific problematic units.
2. **5-Column Visual Kanban:** Displays real-time counts, stage sub-statuses, employee badges, category icons, and quick-action buttons.
3. **Filterable Table View:** Multi-select filtering across stage, hardware category, and money leak categories with real-time text searching.
4. **Slide-Over Asset Detail Drawer:** Provides complete asset specifications alongside an **immutable audit event history** detailing every prior transition, actor name, timestamp, and cost impact.
5. **Contextual Transition Modal:** Dynamic form validation preventing invalid transitions and requiring stage-specific inputs (e.g. employee email on deployment, RMA number on maintenance, data wipe certificate on decommission).

---

## 9. Database Schema & Data Model

The database is defined in [`prisma/schema.prisma`](file:///d:/Program/Network_Project/Lightweight%20IT%20Asset%20Lifecycle%20Tracker/prisma/schema.prisma) and mapped to optimized PostgreSQL tables.

```mermaid
erDiagram
    ASSET_RECORD ||--o{ LIFECYCLE_EVENT_RECORD : "has audit events"

    ASSET_RECORD {
        string id PK
        string asset_tag UK "Unique Asset Tag"
        string serial_number "Hardware Serial"
        string model_name "Full Model Name"
        string normalized_model_key "Normalized Key for Duplicate Engine"
        string category "Laptop, Monitor, etc."
        string vendor "Direct Vendor / Reseller"
        enum stage "procurement | deployment | maintenance | optimization | decommission"
        string sub_status "Detailed stage sub-status"
        string purchase_date
        decimal purchase_cost "Cost in USD (12, 2)"
        string po_number "PO or Invoice Reference"
        string warranty_expiry_date
        string eol_date "Target Refresh Date"
        string assigned_to "Employee Custodian"
        string assigned_email "Custodian Email"
        string department "Cost Center Chargeback"
        string location "Physical Office / Remote"
        string deployed_date
        string condition "New, Good, Fair"
        string maintenance_issue "Repair Description"
        string rma_number "Vendor RMA Tracking"
        decimal repair_cost_total "Total Repair Spend"
        boolean warranty_covered "Warranty vs Out-of-Pocket"
        string loaner_asset_tag "Temporary Loaner Tag"
        string optimization_reason
        string storage_location "IT Closet / Shelf"
        string idle_since_date
        string recommended_action
        string decommission_date
        string decommission_reason
        string data_wipe_cert "NIST 800-88 Certificate ID"
        decimal salvage_value "Recovered Value ($)"
        enum verification_status "verified | unverified | missing_data | contradictory | unlocated"
        string anomaly_note "Spreadsheet Inconsistency Detail"
        timestamptz created_at
        timestamptz updated_at
    }

    LIFECYCLE_EVENT_RECORD {
        string id PK
        string asset_id FK
        enum from_stage "Previous Stage"
        enum to_stage "Target Stage"
        string action_title "Human-readable action"
        string actor "Jordan Miller (IT Manager)"
        decimal cost_impact "Delta Cost Impact ($)"
        string notes "Detailed Transition Notes"
        jsonb metadata_json "Arbitrary Transition Metadata"
        timestamptz created_at "Audit Timestamp"
    }
```

### High-Performance Database Indexes:
- `idx_assets_stage_substatus`: Fast filtering across Kanban board columns.
- `idx_assets_normalized_model_key`: Sub-millisecond duplicate purchase detection.
- `idx_assets_active_warranty`: Rapid indexing of upcoming warranty expirations.
- `idx_assets_active_eol`: Rapid aggregation of approaching 90-day EOL capex.
- `idx_assets_unconfirmed_ghost`: Fast retrieval of unverified assets and risk value calculation.
- `idx_assets_department_stage`: Instant compilation of finance chargeback tables.
- `idx_lifecycle_events_asset_created`: Chronological audit log rendering inside asset drawers.

---

## 10. REST API Reference

The server exposes clean, RESTful JSON endpoints under `/api/assets`.

### 1. `GET /api/assets`
Returns all enriched assets, executive money leak summaries, recent lifecycle audit events, and database engine status.

**Sample Response Structure:**
```json
{
  "assets": [
    {
      "id": "ast-1001",
      "assetTag": "AST-1001",
      "modelName": "MacBook Pro 14\" (M3 Pro)",
      "stage": "procurement",
      "subStatus": "Ordered",
      "purchaseCost": 1999.00,
      "bookValue": 1999,
      "warrantyFlag": "healthy",
      "eolFlag": "healthy",
      "isRedundantPurchaseFlag": true,
      "redundancyMessage": "Redundant order: You already own 2 of MacBook Pro 14\" (M3 Pro), unused (AST-1002, AST-1004)",
      "isGhostOrUnconfirmed": false
    }
  ],
  "summary": {
    "totalUnusedCapitalValue": 11847.00,
    "avoidablePendingOrderValue": 3998.00,
    "unconfirmedAssetsValue": 4648.00,
    "warrantyExpiringSoonCount": 2,
    "approachingEolCount": 3,
    "upcomingEolReplacementCapex": 5847.00,
    "totalFleetPurchaseValue": 48215.00,
    "totalCurrentBookValue": 31450.00
  },
  "dbEngine": {
    "engine": "postgresql",
    "orm": "Prisma ORM v6 (@prisma/adapter-pg + pg.Pool)",
    "label": "Prisma ORM + PostgreSQL 16 Pool",
    "acidTransactions": true
  }
}
```

### 2. `POST /api/assets`
Creates a new asset or performs batch actions.

- **Create Asset:** Submit asset properties (`modelName`, `category`, `purchaseCost`, `stage`, etc.).
- **Batch CSV Migration (`action: "import_csv"`):** Submit `{ "action": "import_csv", "csvText": "..." }` to parse, enrich, and insert rows atomically.
- **Reset Demo Data (`action: "reset_demo"`):** Resets the database to the realistic 185-employee sample fleet.

### 3. `PATCH /api/assets/:id`
Updates an existing asset or advances its lifecycle stage.

- **Lifecycle Stage Transition:**
  ```json
  {
    "targetStage": "deployment",
    "assignedTo": "Sarah Jenkins",
    "assignedEmail": "sjenkins@vanguard.io",
    "department": "Engineering",
    "location": "Remote - Denver",
    "notes": "Reallocated unused stock laptop for new Senior Backend Engineer."
  }
  ```
- **Custody Verification / Anomaly Resolution (`action: "verify"`):**
  ```json
  {
    "action": "verify",
    "assignedTo": "Marcus Vance",
    "location": "HQ Desk 4A",
    "serialNumber": "PF-991204X",
    "resolutionNote": "Physically verified device on Marcus's desk. Serial number updated."
  }
  ```

### 4. `DELETE /api/assets/:id`
Permanently removes an asset record and cascades deletion to associated lifecycle events.

---

## 11. Installation, Setup & Deployment

Spreadsheet Escape is ready to run locally or in production containers.

### Quick Start (Local Development with SQLite Fallback)
No database installation is required for local testing; the built-in SQLite engine runs immediately:

```bash
# 1. Install dependencies
npm install

# 2. Run Next.js development server
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

### Production Deployment (Prisma ORM + PostgreSQL 16)

```bash
# 1. Start PostgreSQL 16 container
docker compose up -d

# 2. Set environment variables (.env.local)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lifecycle_tracker?schema=public"

# 3. Generate Prisma client & push schema
npm run db:generate
npm run db:push

# 4. (Optional) Inspect database using Prisma Studio
npm run db:studio

# 5. Build and launch production server
npm run build
npm run start
```

---

## 12. Business Value & Concrete ROI Analysis

Implementing Spreadsheet Escape generates direct, quantifiable cost savings for organizations with 50–300 employees:

### 1. Immediate Capex Avoidance (Month 1)
- **Scenario:** An engineering manager requests 3 new MacBook Pros (\$2,000 each = \$6,000) for new team members.
- **Spreadsheet Reality:** IT orders the laptops because checking the storage closet spreadsheet indicates "0 stock" (failing to note that 2 laptops from last month's offboarded contractors were returned and never logged).
- **Spreadsheet Escape Reality:** The Duplicate Purchase Guard alerts IT that 2 identical M3 Pro units are sitting in the Optimization stage (`Offboarded - In IT Closet`). IT reallocates those 2 units and orders only 1.
- **Direct Capital Saved:** **\$4,000 on a single purchase request.**

### 2. Warranty RMA Recovery
- **Scenario:** A high-end monitor (\$600) or enterprise laptop (\$1,800) develops a display defect.
- **Spreadsheet Reality:** The device is stashed in an IT bench drawer. By the time someone attends to it, the warranty has expired. IT pays \$450 for a third-party repair or discards the machine.
- **Spreadsheet Escape Reality:** The Warranty Horizon radar surfaces the device 45 days prior to expiration. IT submits a manufacturer RMA ticket under warranty.
- **Direct Expense Avoided:** **\$450–\$1,800 per incident.**

### 3. Offboarding Asset Recovery
- **Scenario:** Remote employees leave the organization.
- **Spreadsheet Reality:** 5–10% of remote laptops are never returned, forgotten due to unmonitored spreadsheet rows. Over 2 years at a 150-person company, 8 laptops disappear (\$16,000 loss).
- **Spreadsheet Escape Reality:** The Optimization pool marks unreturned laptops as `Offboarded - Awaiting Return`, categorizing them as Ghost Asset risks on the executive HUD until tracked and received.
- **Capital Preserved:** **\$10,000–\$20,000 annually.**

### 4. Software Licensing & Operational Simplicity
- **ServiceNow / Ivanti Enterprise ITAM:** \$40,000–\$80,000/year + \$25,000 setup fees.
- **Spreadsheet Escape:** Self-hosted or lightweight deployment, zero per-seat user tax, zero vendor lock-in.

---

## Summary

**Spreadsheet Escape** eliminates the chaos of fragile spreadsheets while rejecting the bloated costs of enterprise ITSM software. By combining a strict **5-Stage Lifecycle State Machine**, an intelligent **Money Leaks Engine**, and **instant CSV migration**, it empowers mid-sized IT teams to achieve full hardware accountability, stop capex waste, and provide audit-ready financial reporting on Day 1.
