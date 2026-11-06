-- ============================================================================
-- Spreadsheet Escape — Production PostgreSQL 16+ Schema & Index Optimization
-- Target: 50–300+ Employee IT Asset Lifecycle Tracker
-- ============================================================================

BEGIN;

-- 1. Core Assets Table with NUMERIC(12,2) financial precision & stage constraints
CREATE TABLE IF NOT EXISTS assets (
  id                    TEXT PRIMARY KEY,
  asset_tag             TEXT NOT NULL UNIQUE,
  serial_number         TEXT NOT NULL DEFAULT '',
  model_name            TEXT NOT NULL,
  normalized_model_key  TEXT NOT NULL,
  category              TEXT NOT NULL,
  vendor                TEXT NOT NULL DEFAULT '',
  stage                 TEXT NOT NULL CHECK (stage IN ('procurement', 'deployment', 'maintenance', 'optimization', 'decommission')),
  sub_status            TEXT NOT NULL DEFAULT '',

  -- Stage 1: Procurement
  purchase_date         TEXT NOT NULL DEFAULT '',
  purchase_cost         NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  po_number             TEXT NOT NULL DEFAULT '',
  warranty_expiry_date  TEXT NOT NULL DEFAULT '',
  eol_date              TEXT NOT NULL DEFAULT '',

  -- Stage 2: Deployment
  assigned_to           TEXT NOT NULL DEFAULT '',
  assigned_email        TEXT NOT NULL DEFAULT '',
  department            TEXT NOT NULL DEFAULT '',
  location              TEXT NOT NULL DEFAULT '',
  deployed_date         TEXT NOT NULL DEFAULT '',
  condition             TEXT NOT NULL DEFAULT 'Good',

  -- Stage 3: Maintenance
  maintenance_issue     TEXT NOT NULL DEFAULT '',
  rma_number            TEXT NOT NULL DEFAULT '',
  repair_cost_total     NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  warranty_covered      BOOLEAN NOT NULL DEFAULT TRUE,
  loaner_asset_tag      TEXT NOT NULL DEFAULT '',

  -- Stage 4: Optimization
  optimization_reason   TEXT NOT NULL DEFAULT '',
  storage_location      TEXT NOT NULL DEFAULT '',
  idle_since_date       TEXT NOT NULL DEFAULT '',
  recommended_action    TEXT NOT NULL DEFAULT '',

  -- Stage 5: Decommission
  decommission_date     TEXT NOT NULL DEFAULT '',
  decommission_reason   TEXT NOT NULL DEFAULT '',
  data_wipe_cert        TEXT NOT NULL DEFAULT '',
  salvage_value         NUMERIC(12, 2) NOT NULL DEFAULT 0.00,

  -- Spreadsheet Escape / Custody Verification
  verification_status   TEXT NOT NULL DEFAULT 'verified' CHECK (verification_status IN ('verified', 'unverified', 'missing_data', 'contradictory', 'unlocated')),
  anomaly_note          TEXT NOT NULL DEFAULT '',
  last_verified_date    TEXT NOT NULL DEFAULT '',
  imported_from_csv     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Immutable Lifecycle Audit Trail Table with native JSONB metadata
CREATE TABLE IF NOT EXISTS lifecycle_events (
  id            TEXT PRIMARY KEY,
  asset_id      TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  from_stage    TEXT,
  to_stage      TEXT NOT NULL,
  action_title  TEXT NOT NULL,
  actor         TEXT NOT NULL,
  cost_impact   NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  notes         TEXT NOT NULL DEFAULT '',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. Production Indexes for 5-Stage Lifecycle & Money Leaks Engine
-- ============================================================================

-- Fast Kanban column & stage filtering
CREATE INDEX IF NOT EXISTS idx_assets_stage_substatus
  ON assets (stage, sub_status);

-- Fast Redundant Purchase / Duplicate Model lookup ("You already own 2 unused")
CREATE INDEX IF NOT EXISTS idx_assets_normalized_model_key
  ON assets (normalized_model_key, stage);

-- Partial index for active fleet Warranty Expiry alerts
CREATE INDEX IF NOT EXISTS idx_assets_active_warranty
  ON assets (warranty_expiry_date)
  WHERE stage != 'decommission' AND warranty_expiry_date != '';

-- Partial index for active fleet End-of-Life (EOL) alerts
CREATE INDEX IF NOT EXISTS idx_assets_active_eol
  ON assets (eol_date)
  WHERE stage != 'decommission' AND eol_date != '';

-- Partial index for Unlocated / Ghost Asset Business Case Calculator
CREATE INDEX IF NOT EXISTS idx_assets_unconfirmed_ghost
  ON assets (verification_status, purchase_cost)
  WHERE stage != 'decommission' AND verification_status != 'verified';

-- Department Chargeback & Finance Report aggregation index
CREATE INDEX IF NOT EXISTS idx_assets_department_stage
  ON assets (department, stage);

-- Fast per-asset chronological audit log retrieval
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_asset_created
  ON lifecycle_events (asset_id, created_at DESC);

-- GIN index on JSONB audit metadata for compliance queries
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_metadata_gin
  ON lifecycle_events USING GIN (metadata_json);

-- ============================================================================
-- 4. Automatic updated_at Timestamp Trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION update_assets_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assets_updated_at ON assets;
CREATE TRIGGER trg_assets_updated_at
BEFORE UPDATE ON assets
FOR EACH ROW
EXECUTE FUNCTION update_assets_updated_at_column();

COMMIT;
