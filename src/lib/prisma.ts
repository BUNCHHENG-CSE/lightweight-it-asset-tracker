import {
  PrismaClient,
  Prisma,
  LifecycleStageEnum,
  VerificationStatusEnum,
  AssetRecord,
  LifecycleEventRecord,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
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
  ensurePostgresInitialized,
  getPgPool,
  getPostgresConnectionString,
} from "./postgres";

const globalForPrisma = globalThis as unknown as {
  __lifecyclePrisma?: PrismaClient;
  __lifecyclePrismaSeeded?: boolean;
};

export function isNeonDatabase(): boolean {
  const url = getPostgresConnectionString();
  return Boolean(
    url &&
      (url.includes("neon.tech") ||
        process.env.USE_NEON_ADAPTER === "true" ||
        Boolean(process.env.NEON_DATABASE_URL))
  );
}

/**
 * Singleton PrismaClient wired to either:
 * 1. Neon Serverless adapter (@prisma/adapter-neon) when connected to Neon PostgreSQL
 * 2. Tuned pg.Pool adapter (@prisma/adapter-pg) when connected to standard PostgreSQL
 * Safe across Next.js hot-reloads and serverless invocations.
 */
export function getPrismaClient(): PrismaClient {
  const connectionString = getPostgresConnectionString();
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required to initialize the PostgreSQL PrismaClient."
    );
  }

  if (!globalForPrisma.__lifecyclePrisma) {
    // Configure Neon WebSockets for Node.js environments
    if (typeof WebSocket === "undefined") {
      neonConfig.webSocketConstructor = ws;
    }

    let adapter: PrismaPg | PrismaNeon;
    if (isNeonDatabase()) {
      adapter = new PrismaNeon({ connectionString });
    } else {
      const pool = getPgPool();
      adapter = new PrismaPg(pool);
    }

    globalForPrisma.__lifecyclePrisma = new PrismaClient({
      adapter,
      log:
        process.env.NODE_ENV === "development"
          ? ["warn", "error"]
          : ["error"],
    });
  }

  return globalForPrisma.__lifecyclePrisma;
}

export function resetPrismaClient(): void {
  if (globalForPrisma.__lifecyclePrisma) {
    globalForPrisma.__lifecyclePrisma.$disconnect().catch(() => {});
    globalForPrisma.__lifecyclePrisma = undefined;
  }
  globalForPrisma.__lifecyclePrismaSeeded = false;
}

function mapPrismaAssetToDomain(row: AssetRecord): Asset {
  return {
    id: row.id,
    assetTag: row.assetTag,
    serialNumber: row.serialNumber || "",
    modelName: row.modelName,
    normalizedModelKey: row.normalizedModelKey,
    category: row.category as Asset["category"],
    vendor: row.vendor || "",
    stage: row.stage as LifecycleStage,
    subStatus: row.subStatus || "",
    purchaseDate: row.purchaseDate || "",
    purchaseCost: Number(row.purchaseCost) || 0,
    poNumber: row.poNumber || "",
    warrantyExpiryDate: row.warrantyExpiryDate || "",
    eolDate: row.eolDate || "",
    assignedTo: row.assignedTo || "",
    assignedEmail: row.assignedEmail || "",
    department: row.department || "",
    location: row.location || "",
    deployedDate: row.deployedDate || "",
    condition: row.condition || "Good",
    maintenanceIssue: row.maintenanceIssue || "",
    rmaNumber: row.rmaNumber || "",
    repairCostTotal: Number(row.repairCostTotal) || 0,
    warrantyCovered: Boolean(row.warrantyCovered),
    loanerAssetTag: row.loanerAssetTag || "",
    optimizationReason: row.optimizationReason || "",
    storageLocation: row.storageLocation || "",
    idleSinceDate: row.idleSinceDate || "",
    recommendedAction: row.recommendedAction || "",
    decommissionDate: row.decommissionDate || "",
    decommissionReason: row.decommissionReason || "",
    dataWipeCert: row.dataWipeCert || "",
    salvageValue: Number(row.salvageValue) || 0,
    verificationStatus: row.verificationStatus as Asset["verificationStatus"],
    anomalyNote: row.anomalyNote || "",
    lastVerifiedDate: row.lastVerifiedDate || "",
    importedFromCsv: Boolean(row.importedFromCsv),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapPrismaEventToDomain(row: LifecycleEventRecord): LifecycleEvent {
  return {
    id: row.id,
    assetId: row.assetId,
    fromStage: row.fromStage ? (row.fromStage as LifecycleStage) : null,
    toStage: row.toStage as LifecycleStage,
    actionTitle: row.actionTitle,
    actor: row.actor,
    costImpact: Number(row.costImpact) || 0,
    notes: row.notes || "",
    metadataJson:
      typeof row.metadataJson === "string"
        ? row.metadataJson
        : JSON.stringify(row.metadataJson ?? {}),
    createdAt: row.createdAt.toISOString(),
  };
}

function toPrismaAssetCreateInput(
  a: Asset
): Prisma.AssetRecordCreateManyInput {
  return {
    id: a.id,
    assetTag: a.assetTag,
    serialNumber: a.serialNumber || "",
    modelName: a.modelName,
    normalizedModelKey:
      a.normalizedModelKey || normalizeModelKey(a.modelName),
    category: a.category,
    vendor: a.vendor || "",
    stage: a.stage as LifecycleStageEnum,
    subStatus: a.subStatus || LIFECYCLE_STAGES[a.stage].defaultSubStatus,
    purchaseDate: a.purchaseDate || "",
    purchaseCost: new Prisma.Decimal(Number(a.purchaseCost) || 0),
    poNumber: a.poNumber || "",
    warrantyExpiryDate: a.warrantyExpiryDate || "",
    eolDate: a.eolDate || "",
    assignedTo: a.assignedTo || "",
    assignedEmail: a.assignedEmail || "",
    department: a.department || "",
    location: a.location || "",
    deployedDate: a.deployedDate || "",
    condition: a.condition || "Good",
    maintenanceIssue: a.maintenanceIssue || "",
    rmaNumber: a.rmaNumber || "",
    repairCostTotal: new Prisma.Decimal(Number(a.repairCostTotal) || 0),
    warrantyCovered: Boolean(a.warrantyCovered),
    loanerAssetTag: a.loanerAssetTag || "",
    optimizationReason: a.optimizationReason || "",
    storageLocation: a.storageLocation || "",
    idleSinceDate: a.idleSinceDate || "",
    recommendedAction: a.recommendedAction || "",
    decommissionDate: a.decommissionDate || "",
    decommissionReason: a.decommissionReason || "",
    dataWipeCert: a.dataWipeCert || "",
    salvageValue: new Prisma.Decimal(Number(a.salvageValue) || 0),
    verificationStatus: (a.verificationStatus ||
      "verified") as VerificationStatusEnum,
    anomalyNote: a.anomalyNote || "",
    lastVerifiedDate:
      a.lastVerifiedDate || new Date().toISOString().slice(0, 10),
    importedFromCsv: Boolean(a.importedFromCsv),
    createdAt: a.createdAt ? new Date(a.createdAt) : new Date(),
    updatedAt: a.updatedAt ? new Date(a.updatedAt) : new Date(),
  };
}

export async function ensurePrismaReady(): Promise<PrismaClient> {
  // Ensure underlying tables & partial indexes exist before Prisma queries run
  await ensurePostgresInitialized();
  const prisma = getPrismaClient();

  if (!globalForPrisma.__lifecyclePrismaSeeded) {
    const count = await prisma.assetRecord.count();
    if (count === 0) {
      await seedPrismaDatabase();
    }
    globalForPrisma.__lifecyclePrismaSeeded = true;
  }

  return prisma;
}

/**
 * Seeds the database using Prisma batch `createMany` inside an interactive transaction.
 */
export async function seedPrismaDatabase(): Promise<void> {
  await ensurePostgresInitialized();
  const prisma = getPrismaClient();
  const { assets, events } = getInitialSeedData();

  await prisma.$transaction(
    async (tx) => {
      await tx.lifecycleEventRecord.deleteMany({});
      await tx.assetRecord.deleteMany({});

      await tx.assetRecord.createMany({
        data: assets.map(toPrismaAssetCreateInput),
        skipDuplicates: true,
      });

      await tx.lifecycleEventRecord.createMany({
        data: events.map((e) => ({
          id: e.id,
          assetId: e.assetId,
          fromStage: e.fromStage ? (e.fromStage as LifecycleStageEnum) : null,
          toStage: e.toStage as LifecycleStageEnum,
          actionTitle: e.actionTitle,
          actor: e.actor,
          costImpact: new Prisma.Decimal(Number(e.costImpact) || 0),
          notes: e.notes || "",
          metadataJson: JSON.parse(e.metadataJson || "{}"),
          createdAt: new Date(e.createdAt),
        })),
        skipDuplicates: true,
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    }
  );
}

export async function listAllAssetsPrisma(): Promise<Asset[]> {
  const prisma = await ensurePrismaReady();
  const rows = await prisma.assetRecord.findMany({
    orderBy: { assetTag: "asc" },
  });
  return rows.map(mapPrismaAssetToDomain);
}

export async function listLifecycleEventsPrisma(
  assetId?: string
): Promise<LifecycleEvent[]> {
  const prisma = await ensurePrismaReady();
  const rows = await prisma.lifecycleEventRecord.findMany({
    where: assetId ? { assetId } : undefined,
    orderBy: { createdAt: "desc" },
    take: assetId ? undefined : 100,
  });
  return rows.map(mapPrismaEventToDomain);
}

export async function createNewAssetPrisma(
  partial: Partial<Asset> & { modelName: string }
): Promise<Asset> {
  const prisma = await ensurePrismaReady();

  return prisma.$transaction(
    async (tx) => {
      const nowIso = new Date().toISOString();
      const today = nowIso.slice(0, 10);

      let assetTag = (partial.assetTag || "").trim();
      if (!assetTag) {
        const cnt = await tx.assetRecord.count();
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
        location: partial.location || "HQ - Receiving",
        deployedDate:
          partial.deployedDate || (stage === "deployment" ? today : ""),
        condition: partial.condition || "New",
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
        importedFromCsv: Boolean(partial.importedFromCsv),
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const createdRecord = await tx.assetRecord.create({
        data: {
          ...toPrismaAssetCreateInput(newAsset),
          events: {
            create: {
              id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              fromStage: null,
              toStage: stage as LifecycleStageEnum,
              actionTitle: partial.importedFromCsv
                ? `Imported from Spreadsheet CSV (${LIFECYCLE_STAGES[stage].shortLabel})`
                : `Created in ${LIFECYCLE_STAGES[stage].shortLabel}`,
              actor: "Jordan Miller (IT Manager)",
              costImpact: new Prisma.Decimal(newAsset.purchaseCost),
              notes:
                newAsset.anomalyNote ||
                `Added ${newAsset.modelName} (${newAsset.assetTag}) at $${newAsset.purchaseCost.toLocaleString()}.`,
              metadataJson: { poNumber: newAsset.poNumber },
            },
          },
        },
      });

      return mapPrismaAssetToDomain(createdRecord);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    }
  );
}

/**
 * High-performance batch CSV migration using Prisma `createMany` inside a single ACID transaction.
 */
export async function bulkCreateAssetsPrisma(
  partials: (Partial<Asset> & { modelName: string })[]
): Promise<Asset[]> {
  const prisma = await ensurePrismaReady();

  return prisma.$transaction(
    async (tx) => {
      const nowIso = new Date().toISOString();
      const today = nowIso.slice(0, 10);
      const domainAssets: Asset[] = [];
      const eventInputs: Prisma.LifecycleEventRecordCreateManyInput[] = [];

      for (let i = 0; i < partials.length; i++) {
        const partial = partials[i];
        const stage: LifecycleStage = partial.stage || "procurement";
        const newAsset: Asset = {
          id:
            partial.id ||
            `ast-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
          assetTag: (
            partial.assetTag ||
            `CSV-${2000 + i}-${Math.random().toString(36).slice(2, 4)}`
          ).trim(),
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

        domainAssets.push(newAsset);
        eventInputs.push({
          id: `evt-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
          assetId: newAsset.id,
          fromStage: null,
          toStage: stage as LifecycleStageEnum,
          actionTitle: `Imported from Spreadsheet CSV (${LIFECYCLE_STAGES[stage].shortLabel})`,
          actor: "Jordan Miller (IT Manager)",
          costImpact: new Prisma.Decimal(newAsset.purchaseCost),
          notes:
            newAsset.anomalyNote ||
            `Batch migrated ${newAsset.modelName} (${newAsset.assetTag}).`,
          metadataJson: { poNumber: newAsset.poNumber },
          createdAt: new Date(nowIso),
        });
      }

      await tx.assetRecord.createMany({
        data: domainAssets.map(toPrismaAssetCreateInput),
        skipDuplicates: true,
      });

      await tx.lifecycleEventRecord.createMany({
        data: eventInputs,
        skipDuplicates: true,
      });

      return domainAssets;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    }
  );
}

export async function transitionAssetStagePrisma(
  assetId: string,
  payload: StageTransitionPayload
): Promise<Asset> {
  const prisma = await ensurePrismaReady();

  return prisma.$transaction(
    async (tx) => {
      const existingRow = await tx.assetRecord.findUnique({
        where: { id: assetId },
      });
      if (!existingRow) {
        throw new Error(`Asset ${assetId} not found`);
      }

      const existing = mapPrismaAssetToDomain(existingRow);
      const nowIso = new Date().toISOString();
      const today = nowIso.slice(0, 10);
      const fromStage = existing.stage;
      const toStage = payload.targetStage;

      const updated: Asset = {
        ...existing,
        stage: toStage,
        subStatus:
          payload.subStatus || LIFECYCLE_STAGES[toStage].defaultSubStatus,
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
          payload.storageLocation ||
          existing.storageLocation ||
          "HQ - IT Cage";
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

      const savedRow = await tx.assetRecord.update({
        where: { id: assetId },
        data: {
          stage: updated.stage as LifecycleStageEnum,
          subStatus: updated.subStatus,
          poNumber: updated.poNumber,
          purchaseCost: new Prisma.Decimal(updated.purchaseCost),
          warrantyExpiryDate: updated.warrantyExpiryDate,
          eolDate: updated.eolDate,
          assignedTo: updated.assignedTo,
          assignedEmail: updated.assignedEmail,
          department: updated.department,
          location: updated.location,
          deployedDate: updated.deployedDate,
          condition: updated.condition,
          maintenanceIssue: updated.maintenanceIssue,
          rmaNumber: updated.rmaNumber,
          repairCostTotal: new Prisma.Decimal(updated.repairCostTotal),
          warrantyCovered: updated.warrantyCovered,
          loanerAssetTag: updated.loanerAssetTag,
          optimizationReason: updated.optimizationReason,
          storageLocation: updated.storageLocation,
          idleSinceDate: updated.idleSinceDate,
          recommendedAction: updated.recommendedAction,
          decommissionDate: updated.decommissionDate,
          decommissionReason: updated.decommissionReason,
          dataWipeCert: updated.dataWipeCert,
          salvageValue: new Prisma.Decimal(updated.salvageValue),
          verificationStatus:
            updated.verificationStatus as VerificationStatusEnum,
          anomalyNote: updated.anomalyNote,
          lastVerifiedDate: updated.lastVerifiedDate,
          events: {
            create: {
              id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              fromStage: fromStage as LifecycleStageEnum,
              toStage: toStage as LifecycleStageEnum,
              actionTitle,
              actor: payload.actor || "Jordan Miller (IT Manager)",
              costImpact: new Prisma.Decimal(costImpact),
              notes:
                payload.notes ||
                `${actionTitle}. Status: ${updated.subStatus}.`,
              metadataJson: payload as unknown as Prisma.InputJsonValue,
            },
          },
        },
      });

      return mapPrismaAssetToDomain(savedRow);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    }
  );
}

export async function verifyAssetCustodyPrisma(
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
  const prisma = await ensurePrismaReady();

  return prisma.$transaction(
    async (tx) => {
      const existingRow = await tx.assetRecord.findUnique({
        where: { id: assetId },
      });
      if (!existingRow) throw new Error(`Asset ${assetId} not found`);

      const today = new Date().toISOString().slice(0, 10);
      const nextStage = (updates.stage ??
        existingRow.stage) as LifecycleStageEnum;
      const nextLocation = updates.location ?? existingRow.location;

      const savedRow = await tx.assetRecord.update({
        where: { id: assetId },
        data: {
          assignedTo: updates.assignedTo ?? existingRow.assignedTo,
          location: nextLocation,
          serialNumber: updates.serialNumber ?? existingRow.serialNumber,
          stage: nextStage,
          subStatus: updates.subStatus ?? existingRow.subStatus,
          verificationStatus: VerificationStatusEnum.verified,
          anomalyNote: "",
          lastVerifiedDate: today,
          events: {
            create: {
              id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              fromStage: existingRow.stage,
              toStage: nextStage,
              actionTitle:
                "Spreadsheet Anomaly Resolved & Custody Verified",
              actor: "Jordan Miller (IT Manager)",
              costImpact: new Prisma.Decimal(0),
              notes:
                updates.resolutionNote ||
                `Confirmed custody & location (${
                  nextLocation || "HQ"
                }). Removed from unconfirmed ghost asset list.`,
              metadataJson: updates as unknown as Prisma.InputJsonValue,
            },
          },
        },
      });

      return mapPrismaAssetToDomain(savedRow);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    }
  );
}

export async function deleteAssetByIdPrisma(assetId: string): Promise<void> {
  const prisma = await ensurePrismaReady();
  await prisma.assetRecord.delete({
    where: { id: assetId },
  });
}

export async function updateAssetDetailsPrisma(
  assetId: string,
  updates: AssetUpdatePayload
): Promise<Asset> {
  const prisma = await ensurePrismaReady();

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.assetRecord.findUnique({
        where: { id: assetId },
      });
      if (!existing) throw new Error(`Asset ${assetId} not found`);

      const nowIso = new Date().toISOString();
      const nextModelName =
        updates.modelName !== undefined
          ? updates.modelName.trim()
          : existing.modelName;
      const nextNormalizedKey = normalizeModelKey(nextModelName);

      const dataToUpdate: Prisma.AssetRecordUpdateInput = {
        updatedAt: new Date(nowIso),
      };

      if (updates.modelName !== undefined) {
        dataToUpdate.modelName = nextModelName;
        dataToUpdate.normalizedModelKey = nextNormalizedKey;
      }
      if (updates.category !== undefined) dataToUpdate.category = updates.category;
      if (updates.vendor !== undefined) dataToUpdate.vendor = updates.vendor;
      if (updates.serialNumber !== undefined)
        dataToUpdate.serialNumber = updates.serialNumber;
      if (updates.stage !== undefined)
        dataToUpdate.stage = updates.stage as LifecycleStageEnum;
      if (updates.subStatus !== undefined)
        dataToUpdate.subStatus = updates.subStatus;
      if (updates.poNumber !== undefined)
        dataToUpdate.poNumber = updates.poNumber;
      if (updates.purchaseCost !== undefined)
        dataToUpdate.purchaseCost = new Prisma.Decimal(updates.purchaseCost);
      if (updates.purchaseDate !== undefined)
        dataToUpdate.purchaseDate = updates.purchaseDate;
      if (updates.warrantyExpiryDate !== undefined)
        dataToUpdate.warrantyExpiryDate = updates.warrantyExpiryDate;
      if (updates.eolDate !== undefined) dataToUpdate.eolDate = updates.eolDate;
      if (updates.assignedTo !== undefined)
        dataToUpdate.assignedTo = updates.assignedTo;
      if (updates.assignedEmail !== undefined)
        dataToUpdate.assignedEmail = updates.assignedEmail;
      if (updates.department !== undefined)
        dataToUpdate.department = updates.department;
      if (updates.location !== undefined)
        dataToUpdate.location = updates.location;
      if (updates.deployedDate !== undefined)
        dataToUpdate.deployedDate = updates.deployedDate;
      if (updates.condition !== undefined)
        dataToUpdate.condition = updates.condition;
      if (updates.maintenanceIssue !== undefined)
        dataToUpdate.maintenanceIssue = updates.maintenanceIssue;
      if (updates.rmaNumber !== undefined)
        dataToUpdate.rmaNumber = updates.rmaNumber;
      if (updates.repairCostTotal !== undefined)
        dataToUpdate.repairCostTotal = new Prisma.Decimal(
          updates.repairCostTotal
        );
      if (updates.warrantyCovered !== undefined)
        dataToUpdate.warrantyCovered = updates.warrantyCovered;
      if (updates.loanerAssetTag !== undefined)
        dataToUpdate.loanerAssetTag = updates.loanerAssetTag;
      if (updates.optimizationReason !== undefined)
        dataToUpdate.optimizationReason = updates.optimizationReason;
      if (updates.storageLocation !== undefined)
        dataToUpdate.storageLocation = updates.storageLocation;
      if (updates.idleSinceDate !== undefined)
        dataToUpdate.idleSinceDate = updates.idleSinceDate;
      if (updates.recommendedAction !== undefined)
        dataToUpdate.recommendedAction = updates.recommendedAction;
      if (updates.decommissionDate !== undefined)
        dataToUpdate.decommissionDate = updates.decommissionDate;
      if (updates.decommissionReason !== undefined)
        dataToUpdate.decommissionReason = updates.decommissionReason;
      if (updates.dataWipeCert !== undefined)
        dataToUpdate.dataWipeCert = updates.dataWipeCert;
      if (updates.salvageValue !== undefined)
        dataToUpdate.salvageValue = new Prisma.Decimal(updates.salvageValue);
      if (updates.verificationStatus !== undefined)
        dataToUpdate.verificationStatus =
          updates.verificationStatus as VerificationStatusEnum;
      if (updates.anomalyNote !== undefined)
        dataToUpdate.anomalyNote = updates.anomalyNote;

      const savedRow = await tx.assetRecord.update({
        where: { id: assetId },
        data: {
          ...dataToUpdate,
          events: {
            create: {
              id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              fromStage: existing.stage,
              toStage: (updates.stage as LifecycleStageEnum) ?? existing.stage,
              actionTitle: "Asset Specifications & Details Updated",
              actor: updates.actor || "Jordan Miller (IT Manager)",
              costImpact: new Prisma.Decimal(0),
              notes:
                updates.editNotes ||
                "Modified hardware specifications or assignment parameters.",
              metadataJson: updates as unknown as Prisma.InputJsonValue,
            },
          },
        },
      });

      return mapPrismaAssetToDomain(savedRow);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
  );
}

export async function bulkDeleteAssetsPrisma(
  assetIds: string[]
): Promise<void> {
  if (assetIds.length === 0) return;
  const prisma = await ensurePrismaReady();
  await prisma.$transaction(async (tx) => {
    await tx.lifecycleEventRecord.deleteMany({
      where: { assetId: { in: assetIds } },
    });
    await tx.assetRecord.deleteMany({
      where: { id: { in: assetIds } },
    });
  });
}

export async function bulkVerifyAssetsPrisma(
  assetIds: string[],
  options: { location?: string; actor?: string; notes?: string } = {}
): Promise<Asset[]> {
  if (assetIds.length === 0) return [];
  const prisma = await ensurePrismaReady();

  return prisma.$transaction(async (tx) => {
    const today = new Date().toISOString().slice(0, 10);
    const existing = await tx.assetRecord.findMany({
      where: { id: { in: assetIds } },
    });

    const results: Asset[] = [];
    for (const ast of existing) {
      const nextLocation = options.location || ast.location;
      const updated = await tx.assetRecord.update({
        where: { id: ast.id },
        data: {
          location: nextLocation,
          verificationStatus: VerificationStatusEnum.verified,
          anomalyNote: "",
          lastVerifiedDate: today,
          events: {
            create: {
              id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              fromStage: ast.stage,
              toStage: ast.stage,
              actionTitle: "Batch Custody & Physical Audit Verified",
              actor: options.actor || "Jordan Miller (IT Manager)",
              costImpact: new Prisma.Decimal(0),
              notes:
                options.notes ||
                `Batch audit confirmed at ${nextLocation || "HQ"}.`,
              metadataJson: { batch: true, location: nextLocation },
            },
          },
        },
      });
      results.push(mapPrismaAssetToDomain(updated));
    }
    return results;
  });
}

export async function bulkTransitionAssetsPrisma(
  assetIds: string[],
  payload: StageTransitionPayload
): Promise<Asset[]> {
  if (assetIds.length === 0) return [];
  const results: Asset[] = [];
  for (const id of assetIds) {
    const res = await transitionAssetStagePrisma(id, payload);
    results.push(res);
  }
  return results;
}

