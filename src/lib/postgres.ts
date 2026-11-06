import { Pool, PoolClient } from "pg";
import {
  Asset,
  LifecycleEvent,
  LifecycleStage,
  StageTransitionPayload,
} from "./types";
import { LIFECYCLE_STAGES, normalizeModelKey } from "./lifecycle-machine";
import { getInitialSeedData } from "./seed-data";

const globalForPg = globalThis as unknown as {
  __lifecyclePgPool?: Pool;
  __lifecyclePgInitialized?: boolean;
};

export function getPostgresConnectionString(): string | null {
  const url =
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    null;
  return url && url.length > 0 ? url : null;
}

export function getPgPool(): Pool {
  const connectionString = getPostgresConnectionString();
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not configured for PostgreSQL connection pool."
    );
  }

  if (!globalForPg.__lifecyclePgPool) {
    const useSsl =
      process.env.PG_SSL === "true" ||
      connectionString.includes("sslmode=require") ||
      connectionString.includes("neon.tech") ||
      connectionString.includes("supabase.co");

    const pool = new Pool({
      connectionString,
      max: Number(process.env.PG_POOL_MAX) || 20,
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS) || 30000,
      connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS) || 5000,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    });

    pool.on("error", (poolErr) => {
      console.warn("[PostgreSQL Pool]", (poolErr as Error)?.message || poolErr);
    });

    globalForPg.__lifecyclePgPool = pool;
  }

  return globalForPg.__lifecyclePgPool;
}

export function resetPgPool(): void {
  if (globalForPg.__lifecyclePgPool) {
    globalForPg.__lifecyclePgPool.end().catch(() => {});
    globalForPg.__lifecyclePgPool = undefined;
  }
  globalForPg.__lifecyclePgInitialized = false;
}

export async function withPgTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

const POSTGRES_DDL = `
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

  purchase_date         TEXT NOT NULL DEFAULT '',
  purchase_cost         NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  po_number             TEXT NOT NULL DEFAULT '',
  warranty_expiry_date  TEXT NOT NULL DEFAULT '',
  eol_date              TEXT NOT NULL DEFAULT '',

  assigned_to           TEXT NOT NULL DEFAULT '',
  assigned_email        TEXT NOT NULL DEFAULT '',
  department            TEXT NOT NULL DEFAULT '',
  location              TEXT NOT NULL DEFAULT '',
  deployed_date         TEXT NOT NULL DEFAULT '',
  condition             TEXT NOT NULL DEFAULT 'Good',

  maintenance_issue     TEXT NOT NULL DEFAULT '',
  rma_number            TEXT NOT NULL DEFAULT '',
  repair_cost_total     NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  warranty_covered      BOOLEAN NOT NULL DEFAULT TRUE,
  loaner_asset_tag      TEXT NOT NULL DEFAULT '',

  optimization_reason   TEXT NOT NULL DEFAULT '',
  storage_location      TEXT NOT NULL DEFAULT '',
  idle_since_date       TEXT NOT NULL DEFAULT '',
  recommended_action    TEXT NOT NULL DEFAULT '',

  decommission_date     TEXT NOT NULL DEFAULT '',
  decommission_reason   TEXT NOT NULL DEFAULT '',
  data_wipe_cert        TEXT NOT NULL DEFAULT '',
  salvage_value         NUMERIC(12, 2) NOT NULL DEFAULT 0.00,

  verification_status   TEXT NOT NULL DEFAULT 'verified',
  anomaly_note          TEXT NOT NULL DEFAULT '',
  last_verified_date    TEXT NOT NULL DEFAULT '',
  imported_from_csv     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE INDEX IF NOT EXISTS idx_assets_stage_substatus
  ON assets (stage, sub_status);

CREATE INDEX IF NOT EXISTS idx_assets_normalized_model_key
  ON assets (normalized_model_key, stage);

CREATE INDEX IF NOT EXISTS idx_assets_active_warranty
  ON assets (warranty_expiry_date)
  WHERE stage != 'decommission' AND warranty_expiry_date != '';

CREATE INDEX IF NOT EXISTS idx_assets_active_eol
  ON assets (eol_date)
  WHERE stage != 'decommission' AND eol_date != '';

CREATE INDEX IF NOT EXISTS idx_assets_unconfirmed_ghost
  ON assets (verification_status, purchase_cost)
  WHERE stage != 'decommission' AND verification_status != 'verified';

CREATE INDEX IF NOT EXISTS idx_assets_department_stage
  ON assets (department, stage);

CREATE INDEX IF NOT EXISTS idx_lifecycle_events_asset_created
  ON lifecycle_events (asset_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lifecycle_events_metadata_gin
  ON lifecycle_events USING GIN (metadata_json);
`;

export async function ensurePostgresInitialized(): Promise<void> {
  if (globalForPg.__lifecyclePgInitialized) return;
  const pool = getPgPool();
  await pool.query(POSTGRES_DDL);

  const countRes = await pool.query<{ cnt: string }>(
    "SELECT COUNT(*)::text as cnt FROM assets"
  );
  const count = parseInt(countRes.rows[0]?.cnt || "0", 10);
  if (count === 0) {
    await seedPostgresDatabase();
  }
  globalForPg.__lifecyclePgInitialized = true;
}

async function upsertAssetPg(client: PoolClient, a: Asset): Promise<void> {
  await client.query(
    `
    INSERT INTO assets (
      id, asset_tag, serial_number, model_name, normalized_model_key, category, vendor,
      stage, sub_status, purchase_date, purchase_cost, po_number, warranty_expiry_date, eol_date,
      assigned_to, assigned_email, department, location, deployed_date, condition,
      maintenance_issue, rma_number, repair_cost_total, warranty_covered, loaner_asset_tag,
      optimization_reason, storage_location, idle_since_date, recommended_action,
      decommission_date, decommission_reason, data_wipe_cert, salvage_value,
      verification_status, anomaly_note, last_verified_date, imported_from_csv, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12, $13, $14,
      $15, $16, $17, $18, $19, $20,
      $21, $22, $23, $24, $25,
      $26, $27, $28, $29,
      $30, $31, $32, $33,
      $34, $35, $36, $37, $38::timestamptz, $39::timestamptz
    )
    ON CONFLICT (id) DO UPDATE SET
      asset_tag = EXCLUDED.asset_tag,
      serial_number = EXCLUDED.serial_number,
      model_name = EXCLUDED.model_name,
      normalized_model_key = EXCLUDED.normalized_model_key,
      category = EXCLUDED.category,
      vendor = EXCLUDED.vendor,
      stage = EXCLUDED.stage,
      sub_status = EXCLUDED.sub_status,
      purchase_date = EXCLUDED.purchase_date,
      purchase_cost = EXCLUDED.purchase_cost,
      po_number = EXCLUDED.po_number,
      warranty_expiry_date = EXCLUDED.warranty_expiry_date,
      eol_date = EXCLUDED.eol_date,
      assigned_to = EXCLUDED.assigned_to,
      assigned_email = EXCLUDED.assigned_email,
      department = EXCLUDED.department,
      location = EXCLUDED.location,
      deployed_date = EXCLUDED.deployed_date,
      condition = EXCLUDED.condition,
      maintenance_issue = EXCLUDED.maintenance_issue,
      rma_number = EXCLUDED.rma_number,
      repair_cost_total = EXCLUDED.repair_cost_total,
      warranty_covered = EXCLUDED.warranty_covered,
      loaner_asset_tag = EXCLUDED.loaner_asset_tag,
      optimization_reason = EXCLUDED.optimization_reason,
      storage_location = EXCLUDED.storage_location,
      idle_since_date = EXCLUDED.idle_since_date,
      recommended_action = EXCLUDED.recommended_action,
      decommission_date = EXCLUDED.decommission_date,
      decommission_reason = EXCLUDED.decommission_reason,
      data_wipe_cert = EXCLUDED.data_wipe_cert,
      salvage_value = EXCLUDED.salvage_value,
      verification_status = EXCLUDED.verification_status,
      anomaly_note = EXCLUDED.anomaly_note,
      last_verified_date = EXCLUDED.last_verified_date,
      imported_from_csv = EXCLUDED.imported_from_csv,
      updated_at = EXCLUDED.updated_at
    `,
    [
      a.id,
      a.assetTag,
      a.serialNumber || "",
      a.modelName,
      a.normalizedModelKey || normalizeModelKey(a.modelName),
      a.category,
      a.vendor || "",
      a.stage,
      a.subStatus || LIFECYCLE_STAGES[a.stage].defaultSubStatus,
      a.purchaseDate || "",
      Number(a.purchaseCost) || 0,
      a.poNumber || "",
      a.warrantyExpiryDate || "",
      a.eolDate || "",
      a.assignedTo || "",
      a.assignedEmail || "",
      a.department || "",
      a.location || "",
      a.deployedDate || "",
      a.condition || "Good",
      a.maintenanceIssue || "",
      a.rmaNumber || "",
      Number(a.repairCostTotal) || 0,
      Boolean(a.warrantyCovered),
      a.loanerAssetTag || "",
      a.optimizationReason || "",
      a.storageLocation || "",
      a.idleSinceDate || "",
      a.recommendedAction || "",
      a.decommissionDate || "",
      a.decommissionReason || "",
      a.dataWipeCert || "",
      Number(a.salvageValue) || 0,
      a.verificationStatus || "verified",
      a.anomalyNote || "",
      a.lastVerifiedDate || new Date().toISOString().slice(0, 10),
      Boolean(a.importedFromCsv),
      a.createdAt || new Date().toISOString(),
      a.updatedAt || new Date().toISOString(),
    ]
  );
}

async function insertEventPg(
  client: PoolClient,
  e: LifecycleEvent
): Promise<void> {
  await client.query(
    `
    INSERT INTO lifecycle_events (
      id, asset_id, from_stage, to_stage, action_title, actor, cost_impact, notes, metadata_json, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::timestamptz)
    ON CONFLICT (id) DO NOTHING
    `,
    [
      e.id,
      e.assetId,
      e.fromStage,
      e.toStage,
      e.actionTitle,
      e.actor,
      Number(e.costImpact) || 0,
      e.notes || "",
      e.metadataJson || "{}",
      e.createdAt || new Date().toISOString(),
    ]
  );
}

function mapPgRowToAsset(row: Record<string, unknown>): Asset {
  return {
    id: String(row.id),
    assetTag: String(row.asset_tag),
    serialNumber: String(row.serial_number || ""),
    modelName: String(row.model_name),
    normalizedModelKey: String(row.normalized_model_key),
    category: row.category as Asset["category"],
    vendor: String(row.vendor || ""),
    stage: row.stage as LifecycleStage,
    subStatus: String(row.sub_status || ""),
    purchaseDate: String(row.purchase_date || ""),
    purchaseCost: parseFloat(String(row.purchase_cost ?? "0")) || 0,
    poNumber: String(row.po_number || ""),
    warrantyExpiryDate: String(row.warranty_expiry_date || ""),
    eolDate: String(row.eol_date || ""),
    assignedTo: String(row.assigned_to || ""),
    assignedEmail: String(row.assigned_email || ""),
    department: String(row.department || ""),
    location: String(row.location || ""),
    deployedDate: String(row.deployed_date || ""),
    condition: String(row.condition || "Good"),
    maintenanceIssue: String(row.maintenance_issue || ""),
    rmaNumber: String(row.rma_number || ""),
    repairCostTotal: parseFloat(String(row.repair_cost_total ?? "0")) || 0,
    warrantyCovered: Boolean(row.warranty_covered),
    loanerAssetTag: String(row.loaner_asset_tag || ""),
    optimizationReason: String(row.optimization_reason || ""),
    storageLocation: String(row.storage_location || ""),
    idleSinceDate: String(row.idle_since_date || ""),
    recommendedAction: String(row.recommended_action || ""),
    decommissionDate: String(row.decommission_date || ""),
    decommissionReason: String(row.decommission_reason || ""),
    dataWipeCert: String(row.data_wipe_cert || ""),
    salvageValue: parseFloat(String(row.salvage_value ?? "0")) || 0,
    verificationStatus: row.verification_status as Asset["verificationStatus"],
    anomalyNote: String(row.anomaly_note || ""),
    lastVerifiedDate: String(row.last_verified_date || ""),
    importedFromCsv: Boolean(row.imported_from_csv),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

export async function seedPostgresDatabase(): Promise<void> {
  const { assets, events } = getInitialSeedData();
  await withPgTransaction(async (client) => {
    await client.query("TRUNCATE TABLE lifecycle_events, assets CASCADE;");
    for (const a of assets) {
      await upsertAssetPg(client, a);
    }
    for (const e of events) {
      await insertEventPg(client, e);
    }
  });
}

export async function listAllAssetsPg(): Promise<Asset[]> {
  await ensurePostgresInitialized();
  const pool = getPgPool();
  const res = await pool.query("SELECT * FROM assets ORDER BY asset_tag ASC");
  return res.rows.map(mapPgRowToAsset);
}

export async function listLifecycleEventsPg(
  assetId?: string
): Promise<LifecycleEvent[]> {
  await ensurePostgresInitialized();
  const pool = getPgPool();
  const res = assetId
    ? await pool.query(
        "SELECT * FROM lifecycle_events WHERE asset_id = $1 ORDER BY created_at DESC",
        [assetId]
      )
    : await pool.query(
        "SELECT * FROM lifecycle_events ORDER BY created_at DESC LIMIT 100"
      );

  return res.rows.map((r) => ({
    id: String(r.id),
    assetId: String(r.asset_id),
    fromStage: r.from_stage ? (String(r.from_stage) as LifecycleStage) : null,
    toStage: String(r.to_stage) as LifecycleStage,
    actionTitle: String(r.action_title),
    actor: String(r.actor),
    costImpact: parseFloat(String(r.cost_impact ?? "0")) || 0,
    notes: String(r.notes || ""),
    metadataJson:
      typeof r.metadata_json === "string"
        ? r.metadata_json
        : JSON.stringify(r.metadata_json || {}),
    createdAt:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at),
  }));
}

export async function createNewAssetPg(
  partial: Partial<Asset> & { modelName: string }
): Promise<Asset> {
  await ensurePostgresInitialized();
  return withPgTransaction(async (client) => {
    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);

    let assetTag = (partial.assetTag || "").trim();
    if (!assetTag) {
      const countRes = await client.query<{ cnt: string }>(
        "SELECT COUNT(*)::text as cnt FROM assets"
      );
      const cnt = parseInt(countRes.rows[0]?.cnt || "0", 10);
      assetTag = `AST-${1001 + cnt + Math.floor(Math.random() * 90 + 10)}`;
    }

    const stage: LifecycleStage = partial.stage || "procurement";
    const newAsset: Asset = {
      id:
        partial.id ||
        `ast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      assetTag,
      serialNumber: partial.serialNumber || "",
      modelName: partial.modelName.trim(),
      normalizedModelKey: normalizeModelKey(partial.modelName),
      category: partial.category || "Laptop",
      vendor: partial.vendor || "Direct Vendor",
      stage,
      subStatus: partial.subStatus || LIFECYCLE_STAGES[stage].defaultSubStatus,
      purchaseDate: partial.purchaseDate || today,
      purchaseCost: Number(partial.purchaseCost) || 0,
      poNumber: partial.poNumber || "",
      warrantyExpiryDate: partial.warrantyExpiryDate || "",
      eolDate: partial.eolDate || "",
      assignedTo: partial.assignedTo || "",
      assignedEmail: partial.assignedEmail || "",
      department: partial.department || "Unassigned (IT Stock)",
      location: partial.location || "HQ - Receiving",
      deployedDate:
        partial.deployedDate || (stage === "deployment" ? today : ""),
      condition: partial.condition || "New",
      maintenanceIssue: partial.maintenanceIssue || "",
      rmaNumber: partial.rmaNumber || "",
      repairCostTotal: Number(partial.repairCostTotal) || 0,
      warrantyCovered:
        partial.warrantyCovered !== undefined ? partial.warrantyCovered : true,
      loanerAssetTag: partial.loanerAssetTag || "",
      optimizationReason: partial.optimizationReason || "",
      storageLocation: partial.storageLocation || "",
      idleSinceDate:
        partial.idleSinceDate || (stage === "optimization" ? today : ""),
      recommendedAction: partial.recommendedAction || "",
      decommissionDate:
        partial.decommissionDate || (stage === "decommission" ? today : ""),
      decommissionReason: partial.decommissionReason || "",
      dataWipeCert: partial.dataWipeCert || "",
      salvageValue: Number(partial.salvageValue) || 0,
      verificationStatus: partial.verificationStatus || "verified",
      anomalyNote: partial.anomalyNote || "",
      lastVerifiedDate: partial.lastVerifiedDate || today,
      importedFromCsv: Boolean(partial.importedFromCsv),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await upsertAssetPg(client, newAsset);

    await insertEventPg(client, {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      assetId: newAsset.id,
      fromStage: null,
      toStage: stage,
      actionTitle: partial.importedFromCsv
        ? `Imported from Spreadsheet CSV (${LIFECYCLE_STAGES[stage].shortLabel})`
        : `Created in ${LIFECYCLE_STAGES[stage].shortLabel}`,
      actor: "Jordan Miller (IT Manager)",
      costImpact: newAsset.purchaseCost,
      notes:
        newAsset.anomalyNote ||
        `Added ${newAsset.modelName} (${newAsset.assetTag}) at $${newAsset.purchaseCost.toLocaleString()}.`,
      metadataJson: JSON.stringify({ poNumber: newAsset.poNumber }),
      createdAt: nowIso,
    });

    return newAsset;
  });
}

export async function bulkCreateAssetsPg(
  partials: (Partial<Asset> & { modelName: string })[]
): Promise<Asset[]> {
  await ensurePostgresInitialized();
  return withPgTransaction(async (client) => {
    const created: Asset[] = [];
    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);

    for (let i = 0; i < partials.length; i++) {
      const partial = partials[i];
      const stage: LifecycleStage = partial.stage || "procurement";
      const newAsset: Asset = {
        id:
          partial.id ||
          `ast-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
        assetTag: (partial.assetTag || `CSV-${2000 + i}`).trim(),
        serialNumber: partial.serialNumber || "",
        modelName: partial.modelName.trim(),
        normalizedModelKey: normalizeModelKey(partial.modelName),
        category: partial.category || "Laptop",
        vendor: partial.vendor || "Direct Vendor",
        stage,
        subStatus:
          partial.subStatus || LIFECYCLE_STAGES[stage].defaultSubStatus,
        purchaseDate: partial.purchaseDate || today,
        purchaseCost: Number(partial.purchaseCost) || 0,
        poNumber: partial.poNumber || "",
        warrantyExpiryDate: partial.warrantyExpiryDate || "",
        eolDate: partial.eolDate || "",
        assignedTo: partial.assignedTo || "",
        assignedEmail: partial.assignedEmail || "",
        department: partial.department || "Unassigned (IT Stock)",
        location: partial.location || "HQ",
        deployedDate:
          partial.deployedDate || (stage === "deployment" ? today : ""),
        condition: partial.condition || "Good",
        maintenanceIssue: partial.maintenanceIssue || "",
        rmaNumber: partial.rmaNumber || "",
        repairCostTotal: Number(partial.repairCostTotal) || 0,
        warrantyCovered:
          partial.warrantyCovered !== undefined
            ? partial.warrantyCovered
            : true,
        loanerAssetTag: partial.loanerAssetTag || "",
        optimizationReason: partial.optimizationReason || "",
        storageLocation: partial.storageLocation || "",
        idleSinceDate:
          partial.idleSinceDate || (stage === "optimization" ? today : ""),
        recommendedAction: partial.recommendedAction || "",
        decommissionDate:
          partial.decommissionDate || (stage === "decommission" ? today : ""),
        decommissionReason: partial.decommissionReason || "",
        dataWipeCert: partial.dataWipeCert || "",
        salvageValue: Number(partial.salvageValue) || 0,
        verificationStatus: partial.verificationStatus || "verified",
        anomalyNote: partial.anomalyNote || "",
        lastVerifiedDate: partial.lastVerifiedDate || today,
        importedFromCsv: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await upsertAssetPg(client, newAsset);
      await insertEventPg(client, {
        id: `evt-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
        assetId: newAsset.id,
        fromStage: null,
        toStage: stage,
        actionTitle: `Imported from Spreadsheet CSV (${LIFECYCLE_STAGES[stage].shortLabel})`,
        actor: "Jordan Miller (IT Manager)",
        costImpact: newAsset.purchaseCost,
        notes:
          newAsset.anomalyNote ||
          `Batch migrated ${newAsset.modelName} (${newAsset.assetTag}).`,
        metadataJson: JSON.stringify({ poNumber: newAsset.poNumber }),
        createdAt: nowIso,
      });

      created.push(newAsset);
    }

    return created;
  });
}

export async function transitionAssetStagePg(
  assetId: string,
  payload: StageTransitionPayload
): Promise<Asset> {
  await ensurePostgresInitialized();
  return withPgTransaction(async (client) => {
    const res = await client.query(
      "SELECT * FROM assets WHERE id = $1 FOR UPDATE",
      [assetId]
    );
    if (res.rows.length === 0) {
      throw new Error(`Asset ${assetId} not found`);
    }
    const existing = mapPgRowToAsset(res.rows[0]);
    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);
    const fromStage = existing.stage;
    const toStage = payload.targetStage;

    const updated: Asset = {
      ...existing,
      stage: toStage,
      subStatus: payload.subStatus || LIFECYCLE_STAGES[toStage].defaultSubStatus,
      updatedAt: nowIso,
    };

    let costImpact = 0;
    let actionTitle = `Moved from ${LIFECYCLE_STAGES[fromStage].shortLabel} to ${LIFECYCLE_STAGES[toStage].shortLabel}`;

    if (toStage === "procurement") {
      if (payload.poNumber !== undefined) updated.poNumber = payload.poNumber;
      if (payload.purchaseCost !== undefined)
        updated.purchaseCost = Number(payload.purchaseCost);
      if (payload.warrantyExpiryDate !== undefined)
        updated.warrantyExpiryDate = payload.warrantyExpiryDate;
      if (payload.eolDate !== undefined) updated.eolDate = payload.eolDate;
      actionTitle = "Updated Procurement / Stock Status";
    } else if (toStage === "deployment") {
      updated.assignedTo = payload.assignedTo ?? existing.assignedTo;
      updated.assignedEmail = payload.assignedEmail ?? existing.assignedEmail;
      updated.department =
        payload.department || existing.department || "Engineering";
      updated.location = payload.location || existing.location || "HQ";
      updated.deployedDate = payload.deployedDate || today;
      updated.condition = payload.condition || "Good";
      updated.optimizationReason = "";
      updated.idleSinceDate = "";
      updated.recommendedAction = "";
      updated.verificationStatus = "verified";
      updated.anomalyNote = "";
      updated.lastVerifiedDate = today;
      actionTitle =
        fromStage === "optimization" || fromStage === "procurement"
          ? `Reallocated & Deployed to ${
              updated.assignedTo || updated.department
            }`
          : `Deployed to ${updated.assignedTo || updated.department}`;
    } else if (toStage === "maintenance") {
      updated.maintenanceIssue =
        payload.maintenanceIssue ?? existing.maintenanceIssue;
      updated.rmaNumber = payload.rmaNumber ?? existing.rmaNumber;
      const repairDelta = Number(payload.repairCostDelta) || 0;
      updated.repairCostTotal =
        (Number(existing.repairCostTotal) || 0) + repairDelta;
      updated.warrantyCovered =
        payload.warrantyCovered !== undefined
          ? payload.warrantyCovered
          : existing.warrantyCovered;
      updated.loanerAssetTag =
        payload.loanerAssetTag ?? existing.loanerAssetTag;
      costImpact = repairDelta;
      actionTitle = updated.warrantyCovered
        ? `Entered Warranty Maintenance (${updated.rmaNumber || "RMA"})`
        : `Logged Out-of-Warranty Repair ($${repairDelta.toLocaleString()})`;
    } else if (toStage === "optimization") {
      updated.optimizationReason =
        payload.optimizationReason ||
        "Reclaimed to IT pool — ready for reallocation";
      updated.storageLocation =
        payload.storageLocation || existing.storageLocation || "HQ - IT Cage";
      updated.idleSinceDate = payload.idleSinceDate || today;
      updated.recommendedAction =
        payload.recommendedAction ||
        "Reallocate to next hire before purchasing new hardware";
      if (!updated.subStatus.toLowerCase().includes("awaiting return")) {
        updated.assignedTo = "";
        updated.assignedEmail = "";
      }
      actionTitle = `Moved to Optimization Pool (${updated.subStatus})`;
    } else if (toStage === "decommission") {
      updated.decommissionDate = payload.decommissionDate || today;
      updated.decommissionReason =
        payload.decommissionReason || "End of Life (EOL)";
      updated.dataWipeCert = payload.dataWipeCert || "";
      updated.salvageValue =
        payload.salvageValue !== undefined
          ? Number(payload.salvageValue)
          : existing.salvageValue;
      updated.assignedTo = "";
      updated.assignedEmail = "";
      updated.verificationStatus = "verified";
      updated.anomalyNote = "";
      updated.lastVerifiedDate = today;
      costImpact = -(Number(updated.salvageValue) || 0);
      actionTitle =
        updated.salvageValue > 0
          ? `Decommissioned ($${updated.salvageValue.toLocaleString()} salvage recovered)`
          : `Decommissioned (${updated.decommissionReason})`;
    }

    if (payload.markVerified) {
      updated.verificationStatus = "verified";
      updated.anomalyNote = "";
      updated.lastVerifiedDate = today;
    }

    await upsertAssetPg(client, updated);
    await insertEventPg(client, {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      assetId: updated.id,
      fromStage,
      toStage,
      actionTitle,
      actor: payload.actor || "Jordan Miller (IT Manager)",
      costImpact,
      notes:
        payload.notes || `${actionTitle}. Status: ${updated.subStatus}.`,
      metadataJson: JSON.stringify(payload),
      createdAt: nowIso,
    });

    return updated;
  });
}

export async function verifyAssetCustodyPg(
  assetId: string,
  updates: {
    assignedTo?: string;
    location?: string;
    serialNumber?: string;
    stage?: LifecycleStage;
    subStatus?: string;
    resolutionNote?: string;
  }
): Promise<Asset> {
  await ensurePostgresInitialized();
  return withPgTransaction(async (client) => {
    const res = await client.query(
      "SELECT * FROM assets WHERE id = $1 FOR UPDATE",
      [assetId]
    );
    if (res.rows.length === 0) throw new Error(`Asset ${assetId} not found`);
    const existing = mapPgRowToAsset(res.rows[0]);

    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);

    const updated: Asset = {
      ...existing,
      assignedTo: updates.assignedTo ?? existing.assignedTo,
      location: updates.location ?? existing.location,
      serialNumber: updates.serialNumber ?? existing.serialNumber,
      stage: updates.stage ?? existing.stage,
      subStatus: updates.subStatus ?? existing.subStatus,
      verificationStatus: "verified",
      anomalyNote: "",
      lastVerifiedDate: today,
      updatedAt: nowIso,
    };

    await upsertAssetPg(client, updated);
    await insertEventPg(client, {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      assetId: updated.id,
      fromStage: existing.stage,
      toStage: updated.stage,
      actionTitle: "Spreadsheet Anomaly Resolved & Custody Verified",
      actor: "Jordan Miller (IT Manager)",
      costImpact: 0,
      notes:
        updates.resolutionNote ||
        `Confirmed custody & location (${
          updated.location || "HQ"
        }). Removed from unconfirmed ghost asset list.`,
      metadataJson: JSON.stringify(updates),
      createdAt: nowIso,
    });

    return updated;
  });
}

export async function deleteAssetByIdPg(assetId: string): Promise<void> {
  await ensurePostgresInitialized();
  const pool = getPgPool();
  await pool.query("DELETE FROM assets WHERE id = $1", [assetId]);
}

export function getPostgresPoolTelemetry() {
  const connStr = getPostgresConnectionString();
  if (!connStr || !globalForPg.__lifecyclePgPool) {
    return null;
  }
  const pool = globalForPg.__lifecyclePgPool;
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
    maxConnections: Number(process.env.PG_POOL_MAX) || 20,
  };
}
