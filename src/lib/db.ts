import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  Asset,
  AssetUpdatePayload,
  LifecycleEvent,
  LifecycleStage,
  StageTransitionPayload,
} from "./types";
import { LIFECYCLE_STAGES, normalizeModelKey } from "./lifecycle-machine";
import { getInitialSeedData } from "./seed-data";
import {
  getPostgresConnectionString,
  getPostgresPoolTelemetry,
  resetPgPool,
} from "./postgres";
import {
  bulkCreateAssetsPrisma,
  bulkDeleteAssetsPrisma,
  bulkTransitionAssetsPrisma,
  bulkVerifyAssetsPrisma,
  createNewAssetPrisma,
  deleteAssetByIdPrisma,
  isNeonDatabase,
  listAllAssetsPrisma,
  listLifecycleEventsPrisma,
  resetPrismaClient,
  seedPrismaDatabase,
  transitionAssetStagePrisma,
  updateAssetDetailsPrisma,
  verifyAssetCustodyPrisma,
} from "./prisma";

export interface DatabaseEngineStatus {
  engine: "postgresql" | "sqlite-fallback";
  orm: string;
  label: string;
  connectionPool: {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
    maxConnections: number;
  } | null;
  indexesActive: string[];
  acidTransactions: boolean;
}

const DB_PATH = path.join(process.cwd(), "lifecycle-tracker.db");

const globalForSqlite = globalThis as unknown as {
  __lifecycleDb?: DatabaseSync;
};

const globalForDbRouting = globalThis as unknown as {
  __postgresOfflineUntil?: number;
  __postgresOfflineReason?: string;
  __postgresWarnedOnce?: boolean;
};

export function isPostgresConfigured(): boolean {
  return Boolean(getPostgresConnectionString());
}

export function isPostgresOperational(): boolean {
  if (!isPostgresConfigured()) return false;
  const offlineUntil = globalForDbRouting.__postgresOfflineUntil || 0;
  return Date.now() >= offlineUntil;
}

function isConnectionError(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as Record<string, unknown>;
  const code =
    anyErr.code ||
    (anyErr.cause as Record<string, unknown> | undefined)?.code;
  if (
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "ECONNRESET" ||
    code === "EHOSTUNREACH" ||
    code === "EPIPE" ||
    code === "ERR_SOCKET_CONNECTION_TIMEOUT"
  ) {
    return true;
  }

  if (Array.isArray(anyErr.errors)) {
    return anyErr.errors.some((inner) => isConnectionError(inner));
  }

  const msg = `${anyErr.name || ""} ${anyErr.message || ""} ${String(err)}`;
  return (
    msg.includes("ECONNREFUSED") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("ECONNRESET") ||
    msg.includes("connect ECONNREFUSED") ||
    msg.includes("Connection terminated") ||
    msg.includes("Connection refused") ||
    msg.includes("server closed the connection")
  );
}

function formatErrorMessage(err: unknown): string {
  if (!err) return "Unknown connection error";
  const anyErr = err as Record<string, unknown>;
  if (anyErr.code) return String(anyErr.code);
  if (Array.isArray(anyErr.errors) && anyErr.errors.length > 0) {
    return anyErr.errors
      .map((e) =>
        e instanceof Error
          ? e.message
          : String((e as Record<string, unknown>)?.code || e)
      )
      .join(", ");
  }
  if (err instanceof Error && err.message) return err.message;
  return String(err);
}

function disablePostgresTemporarily(err: unknown, actionName: string) {
  // Cooldown for 30 seconds before attempting to reach PostgreSQL again
  globalForDbRouting.__postgresOfflineUntil = Date.now() + 30000;
  const reason = formatErrorMessage(err);
  globalForDbRouting.__postgresOfflineReason = reason;
  resetPgPool();
  resetPrismaClient();

  if (!globalForDbRouting.__postgresWarnedOnce) {
    globalForDbRouting.__postgresWarnedOnce = true;
    console.warn(
      `\n⚠️  [Database Fallback] PostgreSQL is unreachable (${reason}) during '${actionName}'.` +
        `\n    Gracefully falling back to local SQLite WAL database (lifecycle-tracker.db).` +
        `\n    All queries, ACID transactions, and lifecycle features will continue uninterrupted.` +
        `\n    (To use PostgreSQL, run 'docker compose up -d' or set a reachable DATABASE_URL in .env)\n`
    );
  }
}

async function executeWithDbFallback<T>(
  actionName: string,
  prismaOp: () => Promise<T>,
  sqliteOp: () => T | Promise<T>
): Promise<T> {
  if (isPostgresOperational()) {
    try {
      return await prismaOp();
    } catch (err) {
      if (isConnectionError(err)) {
        disablePostgresTemporarily(err, actionName);
        return await sqliteOp();
      }
      throw err;
    }
  }
  return await sqliteOp();
}

export function getDatabaseEngineStatus(): DatabaseEngineStatus {
  const isOperational = isPostgresOperational();
  const isConfigured = isPostgresConfigured();
  const pgActive = isOperational;
  const offlineReason = globalForDbRouting.__postgresOfflineReason;
  const isNeon = pgActive && isNeonDatabase();

  let label =
    "Local SQLite WAL Engine (Zero-Config Development)";
  let orm = "SQLite WAL Engine (Production Prisma Ready for Neon)";

  if (pgActive) {
    if (isNeon) {
      label = "Prisma ORM + Neon PostgreSQL";
      orm = "Prisma ORM v6 (@prisma/adapter-neon + Neon Serverless Pool)";
    } else {
      label = "Prisma ORM + PostgreSQL 16 Pool";
      orm = "Prisma ORM v6 (@prisma/adapter-pg + pg.Pool)";
    }
  } else if (isConfigured && !isOperational) {
    label = "Prisma ORM Ready (SQLite Fallback — PostgreSQL Offline)";
    orm = `Local SQLite Fallback (${offlineReason || "PostgreSQL ECONNREFUSED"})`;
  }

  return {
    engine: pgActive ? "postgresql" : "sqlite-fallback",
    orm,
    label,
    connectionPool: pgActive
      ? (isNeon
          ? { totalCount: 1, idleCount: 1, waitingCount: 0, maxConnections: 100 }
          : getPostgresPoolTelemetry())
      : null,
    indexesActive: [
      "idx_assets_stage_substatus",
      "idx_assets_normalized_model_key",
      "idx_assets_active_warranty (partial)",
      "idx_assets_active_eol (partial)",
      "idx_assets_unconfirmed_ghost (partial)",
      "idx_assets_department_stage",
      "idx_lifecycle_events_asset_created",
      ...(pgActive ? ["idx_lifecycle_events_metadata_gin (JSONB GIN)"] : []),
    ],
    acidTransactions: true,
  };
}

function getSqliteDb(): DatabaseSync {
  if (!globalForSqlite.__lifecycleDb) {
    const db = new DatabaseSync(DB_PATH);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA synchronous = NORMAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    initializeSqliteSchema(db);
    globalForSqlite.__lifecycleDb = db;
  }
  return globalForSqlite.__lifecycleDb;
}

function withSqliteTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE;");
  try {
    const res = fn();
    db.exec("COMMIT;");
    return res;
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

function initializeSqliteSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      assetTag TEXT NOT NULL,
      serialNumber TEXT NOT NULL DEFAULT '',
      modelName TEXT NOT NULL,
      normalizedModelKey TEXT NOT NULL,
      category TEXT NOT NULL,
      vendor TEXT NOT NULL DEFAULT '',
      stage TEXT NOT NULL,
      subStatus TEXT NOT NULL DEFAULT '',

      purchaseDate TEXT NOT NULL DEFAULT '',
      purchaseCost REAL NOT NULL DEFAULT 0,
      poNumber TEXT NOT NULL DEFAULT '',
      warrantyExpiryDate TEXT NOT NULL DEFAULT '',
      eolDate TEXT NOT NULL DEFAULT '',

      assignedTo TEXT NOT NULL DEFAULT '',
      assignedEmail TEXT NOT NULL DEFAULT '',
      department TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      deployedDate TEXT NOT NULL DEFAULT '',
      condition TEXT NOT NULL DEFAULT 'Good',

      maintenanceIssue TEXT NOT NULL DEFAULT '',
      rmaNumber TEXT NOT NULL DEFAULT '',
      repairCostTotal REAL NOT NULL DEFAULT 0,
      warrantyCovered INTEGER NOT NULL DEFAULT 1,
      loanerAssetTag TEXT NOT NULL DEFAULT '',

      optimizationReason TEXT NOT NULL DEFAULT '',
      storageLocation TEXT NOT NULL DEFAULT '',
      idleSinceDate TEXT NOT NULL DEFAULT '',
      recommendedAction TEXT NOT NULL DEFAULT '',

      decommissionDate TEXT NOT NULL DEFAULT '',
      decommissionReason TEXT NOT NULL DEFAULT '',
      dataWipeCert TEXT NOT NULL DEFAULT '',
      salvageValue REAL NOT NULL DEFAULT 0,

      verificationStatus TEXT NOT NULL DEFAULT 'verified',
      anomalyNote TEXT NOT NULL DEFAULT '',
      lastVerifiedDate TEXT NOT NULL DEFAULT '',
      importedFromCsv INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lifecycle_events (
      id TEXT PRIMARY KEY,
      assetId TEXT NOT NULL,
      fromStage TEXT,
      toStage TEXT NOT NULL,
      actionTitle TEXT NOT NULL,
      actor TEXT NOT NULL,
      costImpact REAL NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      metadataJson TEXT NOT NULL DEFAULT '{}',
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_assets_stage_substatus
      ON assets (stage, subStatus);
    CREATE INDEX IF NOT EXISTS idx_assets_normalized_model_key
      ON assets (normalizedModelKey, stage);
    CREATE INDEX IF NOT EXISTS idx_assets_active_warranty
      ON assets (warrantyExpiryDate)
      WHERE stage != 'decommission' AND warrantyExpiryDate != '';
    CREATE INDEX IF NOT EXISTS idx_assets_active_eol
      ON assets (eolDate)
      WHERE stage != 'decommission' AND eolDate != '';
    CREATE INDEX IF NOT EXISTS idx_assets_unconfirmed_ghost
      ON assets (verificationStatus, purchaseCost)
      WHERE stage != 'decommission' AND verificationStatus != 'verified';
    CREATE INDEX IF NOT EXISTS idx_assets_department_stage
      ON assets (department, stage);
    CREATE INDEX IF NOT EXISTS idx_lifecycle_events_asset_created
      ON lifecycle_events (assetId, createdAt DESC);
  `);

  const countRow = db
    .prepare("SELECT COUNT(*) as cnt FROM assets")
    .get() as { cnt: number };

  if (!countRow || countRow.cnt === 0) {
    seedSqliteDatabase(db);
  }
}

function insertAssetRowSqlite(db: DatabaseSync, a: Asset) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO assets (
      id, assetTag, serialNumber, modelName, normalizedModelKey, category, vendor,
      stage, subStatus, purchaseDate, purchaseCost, poNumber, warrantyExpiryDate, eolDate,
      assignedTo, assignedEmail, department, location, deployedDate, condition,
      maintenanceIssue, rmaNumber, repairCostTotal, warrantyCovered, loanerAssetTag,
      optimizationReason, storageLocation, idleSinceDate, recommendedAction,
      decommissionDate, decommissionReason, dataWipeCert, salvageValue,
      verificationStatus, anomalyNote, lastVerifiedDate, importedFromCsv, createdAt, updatedAt
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
  `);

  stmt.run(
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
    a.warrantyCovered ? 1 : 0,
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
    a.importedFromCsv ? 1 : 0,
    a.createdAt || new Date().toISOString(),
    a.updatedAt || new Date().toISOString()
  );
}

function insertEventRowSqlite(db: DatabaseSync, e: LifecycleEvent) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO lifecycle_events (
      id, assetId, fromStage, toStage, actionTitle, actor, costImpact, notes, metadataJson, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    e.id,
    e.assetId,
    e.fromStage,
    e.toStage,
    e.actionTitle,
    e.actor,
    Number(e.costImpact) || 0,
    e.notes || "",
    e.metadataJson || "{}",
    e.createdAt
  );
}

function seedSqliteDatabase(dbInstance?: DatabaseSync) {
  const db = dbInstance || getSqliteDb();
  const { assets, events } = getInitialSeedData();
  withSqliteTransaction(db, () => {
    db.exec("DELETE FROM lifecycle_events; DELETE FROM assets;");
    for (const a of assets) {
      insertAssetRowSqlite(db, a);
    }
    for (const e of events) {
      insertEventRowSqlite(db, e);
    }
  });
}

function mapSqliteRowToAsset(row: Record<string, unknown>): Asset {
  return {
    id: String(row.id),
    assetTag: String(row.assetTag),
    serialNumber: String(row.serialNumber || ""),
    modelName: String(row.modelName),
    normalizedModelKey: String(row.normalizedModelKey),
    category: row.category as Asset["category"],
    vendor: String(row.vendor || ""),
    stage: row.stage as LifecycleStage,
    subStatus: String(row.subStatus || ""),
    purchaseDate: String(row.purchaseDate || ""),
    purchaseCost: Number(row.purchaseCost) || 0,
    poNumber: String(row.poNumber || ""),
    warrantyExpiryDate: String(row.warrantyExpiryDate || ""),
    eolDate: String(row.eolDate || ""),
    assignedTo: String(row.assignedTo || ""),
    assignedEmail: String(row.assignedEmail || ""),
    department: String(row.department || ""),
    location: String(row.location || ""),
    deployedDate: String(row.deployedDate || ""),
    condition: String(row.condition || "Good"),
    maintenanceIssue: String(row.maintenanceIssue || ""),
    rmaNumber: String(row.rmaNumber || ""),
    repairCostTotal: Number(row.repairCostTotal) || 0,
    warrantyCovered: Boolean(row.warrantyCovered),
    loanerAssetTag: String(row.loanerAssetTag || ""),
    optimizationReason: String(row.optimizationReason || ""),
    storageLocation: String(row.storageLocation || ""),
    idleSinceDate: String(row.idleSinceDate || ""),
    recommendedAction: String(row.recommendedAction || ""),
    decommissionDate: String(row.decommissionDate || ""),
    decommissionReason: String(row.decommissionReason || ""),
    dataWipeCert: String(row.dataWipeCert || ""),
    salvageValue: Number(row.salvageValue) || 0,
    verificationStatus: row.verificationStatus as Asset["verificationStatus"],
    anomalyNote: String(row.anomalyNote || ""),
    lastVerifiedDate: String(row.lastVerifiedDate || ""),
    importedFromCsv: Boolean(row.importedFromCsv),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

// ============================================================================
// Unified Async Repository API (Routes to Prisma ORM over pg.Pool in Prod)
// ============================================================================

function listAllAssetsSqlite(): Asset[] {
  const db = getSqliteDb();
  const rows = db
    .prepare("SELECT * FROM assets ORDER BY assetTag ASC")
    .all() as Record<string, unknown>[];
  return rows.map(mapSqliteRowToAsset);
}

function listLifecycleEventsSqlite(assetId?: string): LifecycleEvent[] {
  const db = getSqliteDb();
  const rows = (
    assetId
      ? db
          .prepare(
            "SELECT * FROM lifecycle_events WHERE assetId = ? ORDER BY createdAt DESC"
          )
          .all(assetId)
      : db
          .prepare(
            "SELECT * FROM lifecycle_events ORDER BY createdAt DESC LIMIT 100"
          )
          .all()
  ) as Record<string, unknown>[];

  return rows.map((r) => ({
    id: String(r.id),
    assetId: String(r.assetId),
    fromStage: r.fromStage ? (String(r.fromStage) as LifecycleStage) : null,
    toStage: String(r.toStage) as LifecycleStage,
    actionTitle: String(r.actionTitle),
    actor: String(r.actor),
    costImpact: Number(r.costImpact) || 0,
    notes: String(r.notes || ""),
    metadataJson: String(r.metadataJson || "{}"),
    createdAt: String(r.createdAt),
  }));
}

function createNewAssetSqlite(
  partial: Partial<Asset> & { modelName: string }
): Asset {
  const db = getSqliteDb();
  return withSqliteTransaction(db, () => {
    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);

    let assetTag = (partial.assetTag || "").trim();
    if (!assetTag) {
      const countRow = db
        .prepare("SELECT COUNT(*) as cnt FROM assets")
        .get() as { cnt: number };
      assetTag = `AST-${
        1001 + (countRow?.cnt || 0) + Math.floor(Math.random() * 90 + 10)
      }`;
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

    insertAssetRowSqlite(db, newAsset);

    insertEventRowSqlite(db, {
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

function bulkCreateAssetsSqlite(
  partials: (Partial<Asset> & { modelName: string })[]
): Asset[] {
  const db = getSqliteDb();
  return withSqliteTransaction(db, () => {
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

      insertAssetRowSqlite(db, newAsset);
      insertEventRowSqlite(db, {
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

function transitionAssetStageSqlite(
  assetId: string,
  payload: StageTransitionPayload
): Asset {
  const db = getSqliteDb();
  return withSqliteTransaction(db, () => {
    const row = db
      .prepare("SELECT * FROM assets WHERE id = ?")
      .get(assetId) as Record<string, unknown> | undefined;
    if (!row) {
      throw new Error(`Asset ${assetId} not found`);
    }
    const existing = mapSqliteRowToAsset(row);

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

    insertAssetRowSqlite(db, updated);

    insertEventRowSqlite(db, {
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

function verifyAssetCustodySqlite(
  assetId: string,
  updates: {
    assignedTo?: string;
    location?: string;
    serialNumber?: string;
    stage?: LifecycleStage;
    subStatus?: string;
    resolutionNote?: string;
  }
): Asset {
  const db = getSqliteDb();
  return withSqliteTransaction(db, () => {
    const row = db
      .prepare("SELECT * FROM assets WHERE id = ?")
      .get(assetId) as Record<string, unknown> | undefined;
    if (!row) throw new Error(`Asset ${assetId} not found`);
    const existing = mapSqliteRowToAsset(row);

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

    insertAssetRowSqlite(db, updated);

    insertEventRowSqlite(db, {
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

function deleteAssetByIdSqlite(assetId: string): void {
  const db = getSqliteDb();
  withSqliteTransaction(db, () => {
    db.prepare("DELETE FROM lifecycle_events WHERE assetId = ?").run(assetId);
    db.prepare("DELETE FROM assets WHERE id = ?").run(assetId);
  });
}

function updateAssetDetailsSqlite(
  assetId: string,
  updates: AssetUpdatePayload
): Asset {
  const db = getSqliteDb();
  return withSqliteTransaction(db, () => {
    const row = db
      .prepare("SELECT * FROM assets WHERE id = ?")
      .get(assetId) as Record<string, unknown> | undefined;
    if (!row) throw new Error(`Asset ${assetId} not found`);
    const existing = mapSqliteRowToAsset(row);

    const nowIso = new Date().toISOString();
    const modelName = (updates.modelName ?? existing.modelName).trim();
    const normalizedModelKey = normalizeModelKey(modelName);

    const updated: Asset = {
      ...existing,
      modelName,
      normalizedModelKey,
      category: updates.category ?? existing.category,
      vendor: updates.vendor ?? existing.vendor,
      serialNumber: updates.serialNumber ?? existing.serialNumber,
      stage: updates.stage ?? existing.stage,
      subStatus: updates.subStatus ?? existing.subStatus,
      poNumber: updates.poNumber ?? existing.poNumber,
      purchaseCost:
        updates.purchaseCost !== undefined
          ? Number(updates.purchaseCost)
          : existing.purchaseCost,
      purchaseDate: updates.purchaseDate ?? existing.purchaseDate,
      warrantyExpiryDate:
        updates.warrantyExpiryDate ?? existing.warrantyExpiryDate,
      eolDate: updates.eolDate ?? existing.eolDate,
      assignedTo: updates.assignedTo ?? existing.assignedTo,
      assignedEmail: updates.assignedEmail ?? existing.assignedEmail,
      department: updates.department ?? existing.department,
      location: updates.location ?? existing.location,
      deployedDate: updates.deployedDate ?? existing.deployedDate,
      condition: updates.condition ?? existing.condition,
      maintenanceIssue: updates.maintenanceIssue ?? existing.maintenanceIssue,
      rmaNumber: updates.rmaNumber ?? existing.rmaNumber,
      repairCostTotal:
        updates.repairCostTotal !== undefined
          ? Number(updates.repairCostTotal)
          : existing.repairCostTotal,
      warrantyCovered:
        updates.warrantyCovered !== undefined
          ? updates.warrantyCovered
          : existing.warrantyCovered,
      loanerAssetTag: updates.loanerAssetTag ?? existing.loanerAssetTag,
      optimizationReason:
        updates.optimizationReason ?? existing.optimizationReason,
      storageLocation: updates.storageLocation ?? existing.storageLocation,
      idleSinceDate: updates.idleSinceDate ?? existing.idleSinceDate,
      recommendedAction:
        updates.recommendedAction ?? existing.recommendedAction,
      decommissionDate: updates.decommissionDate ?? existing.decommissionDate,
      decommissionReason:
        updates.decommissionReason ?? existing.decommissionReason,
      dataWipeCert: updates.dataWipeCert ?? existing.dataWipeCert,
      salvageValue:
        updates.salvageValue !== undefined
          ? Number(updates.salvageValue)
          : existing.salvageValue,
      verificationStatus:
        updates.verificationStatus ?? existing.verificationStatus,
      anomalyNote: updates.anomalyNote ?? existing.anomalyNote,
      updatedAt: nowIso,
    };

    insertAssetRowSqlite(db, updated);

    insertEventRowSqlite(db, {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      assetId: updated.id,
      fromStage: existing.stage,
      toStage: updated.stage,
      actionTitle: "Asset Specifications & Details Updated",
      actor: updates.actor || "Jordan Miller (IT Manager)",
      costImpact: 0,
      notes:
        updates.editNotes ||
        "Modified hardware specifications or assignment parameters.",
      metadataJson: JSON.stringify(updates),
      createdAt: nowIso,
    });

    return updated;
  });
}

function bulkDeleteAssetsSqlite(assetIds: string[]): void {
  if (assetIds.length === 0) return;
  const db = getSqliteDb();
  withSqliteTransaction(db, () => {
    for (const id of assetIds) {
      db.prepare("DELETE FROM lifecycle_events WHERE assetId = ?").run(id);
      db.prepare("DELETE FROM assets WHERE id = ?").run(id);
    }
  });
}

function bulkVerifyAssetsSqlite(
  assetIds: string[],
  options: { location?: string; actor?: string; notes?: string } = {}
): Asset[] {
  if (assetIds.length === 0) return [];
  const db = getSqliteDb();
  return withSqliteTransaction(db, () => {
    const today = new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();
    const results: Asset[] = [];

    for (const id of assetIds) {
      const row = db
        .prepare("SELECT * FROM assets WHERE id = ?")
        .get(id) as Record<string, unknown> | undefined;
      if (!row) continue;
      const existing = mapSqliteRowToAsset(row);
      const nextLocation = options.location || existing.location;
      const updated: Asset = {
        ...existing,
        location: nextLocation,
        verificationStatus: "verified",
        anomalyNote: "",
        lastVerifiedDate: today,
        updatedAt: nowIso,
      };
      insertAssetRowSqlite(db, updated);
      insertEventRowSqlite(db, {
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        assetId: updated.id,
        fromStage: existing.stage,
        toStage: existing.stage,
        actionTitle: "Batch Custody & Physical Audit Verified",
        actor: options.actor || "Jordan Miller (IT Manager)",
        costImpact: 0,
        notes:
          options.notes ||
          `Batch audit confirmed at ${nextLocation || "HQ"}.`,
        metadataJson: JSON.stringify({
          batch: true,
          location: nextLocation,
        }),
        createdAt: nowIso,
      });
      results.push(updated);
    }
    return results;
  });
}

function bulkTransitionAssetsSqlite(
  assetIds: string[],
  payload: StageTransitionPayload
): Asset[] {
  if (assetIds.length === 0) return [];
  const results: Asset[] = [];
  for (const id of assetIds) {
    const updated = transitionAssetStageSqlite(id, payload);
    results.push(updated);
  }
  return results;
}

// ============================================================================
// Unified Async Repository API (Routes to Prisma ORM in Prod, Auto-Fallback to SQLite)
// ============================================================================

export async function seedDatabase(): Promise<void> {
  return executeWithDbFallback(
    "seedDatabase",
    () => seedPrismaDatabase(),
    () => seedSqliteDatabase()
  );
}

export async function listAllAssets(): Promise<Asset[]> {
  return executeWithDbFallback(
    "listAllAssets",
    () => listAllAssetsPrisma(),
    () => listAllAssetsSqlite()
  );
}

export async function listLifecycleEvents(
  assetId?: string
): Promise<LifecycleEvent[]> {
  return executeWithDbFallback(
    "listLifecycleEvents",
    () => listLifecycleEventsPrisma(assetId),
    () => listLifecycleEventsSqlite(assetId)
  );
}

export async function createNewAsset(
  partial: Partial<Asset> & { modelName: string }
): Promise<Asset> {
  return executeWithDbFallback(
    "createNewAsset",
    () => createNewAssetPrisma(partial),
    () => createNewAssetSqlite(partial)
  );
}

export async function bulkCreateAssets(
  partials: (Partial<Asset> & { modelName: string })[]
): Promise<Asset[]> {
  return executeWithDbFallback(
    "bulkCreateAssets",
    () => bulkCreateAssetsPrisma(partials),
    () => bulkCreateAssetsSqlite(partials)
  );
}

export async function transitionAssetStage(
  assetId: string,
  payload: StageTransitionPayload
): Promise<Asset> {
  return executeWithDbFallback(
    "transitionAssetStage",
    () => transitionAssetStagePrisma(assetId, payload),
    () => transitionAssetStageSqlite(assetId, payload)
  );
}

export async function updateAssetDetails(
  assetId: string,
  updates: AssetUpdatePayload
): Promise<Asset> {
  return executeWithDbFallback(
    "updateAssetDetails",
    () => updateAssetDetailsPrisma(assetId, updates),
    () => updateAssetDetailsSqlite(assetId, updates)
  );
}

export async function bulkTransitionAssets(
  assetIds: string[],
  payload: StageTransitionPayload
): Promise<Asset[]> {
  return executeWithDbFallback(
    "bulkTransitionAssets",
    () => bulkTransitionAssetsPrisma(assetIds, payload),
    () => bulkTransitionAssetsSqlite(assetIds, payload)
  );
}

export async function bulkVerifyAssets(
  assetIds: string[],
  options?: { location?: string; actor?: string; notes?: string }
): Promise<Asset[]> {
  return executeWithDbFallback(
    "bulkVerifyAssets",
    () => bulkVerifyAssetsPrisma(assetIds, options),
    () => bulkVerifyAssetsSqlite(assetIds, options)
  );
}

export async function bulkDeleteAssets(assetIds: string[]): Promise<void> {
  return executeWithDbFallback(
    "bulkDeleteAssets",
    () => bulkDeleteAssetsPrisma(assetIds),
    () => bulkDeleteAssetsSqlite(assetIds)
  );
}

export async function verifyAssetCustody(
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
  return executeWithDbFallback(
    "verifyAssetCustody",
    () => verifyAssetCustodyPrisma(assetId, updates),
    () => verifyAssetCustodySqlite(assetId, updates)
  );
}

export async function deleteAssetById(assetId: string): Promise<void> {
  return executeWithDbFallback(
    "deleteAssetById",
    () => deleteAssetByIdPrisma(assetId),
    () => deleteAssetByIdSqlite(assetId)
  );
}
