import {
  Asset,
  AssetEnriched,
  EolFlag,
  LifecycleStage,
  MoneyLeaksSummary,
  RedundantModelGroup,
  WarrantyFlag,
} from "./types";

export interface StageDefinition {
  id: LifecycleStage;
  stepNumber: number;
  label: string;
  shortLabel: string;
  tagline: string;
  description: string;
  allowedNextStages: LifecycleStage[];
  defaultSubStatus: string;
  subStatusOptions: string[];
}

export const LIFECYCLE_STAGES: Record<LifecycleStage, StageDefinition> = {
  procurement: {
    id: "procurement",
    stepNumber: 1,
    label: "1. Procurement",
    shortLabel: "Procurement",
    tagline: "Ordered or In Receiving Stock",
    description:
      "Track POs, unit cost, warranty start, and catch duplicate purchases before unboxing.",
    allowedNextStages: ["deployment", "optimization", "decommission"],
    defaultSubStatus: "In Stock - Unused",
    subStatusOptions: [
      "Ordered",
      "In Stock - Unused",
      "Staging / Imaging",
    ],
  },
  deployment: {
    id: "deployment",
    stepNumber: 2,
    label: "2. Deployment",
    shortLabel: "Deployment",
    tagline: "Assigned & Active in Field",
    description:
      "Confirm employee custody, department chargeback, and physical/remote location.",
    allowedNextStages: ["maintenance", "optimization", "decommission"],
    defaultSubStatus: "Active - Assigned",
    subStatusOptions: [
      "Active - Assigned",
      "Shared / Conference Room",
      "Loaner Active",
    ],
  },
  maintenance: {
    id: "maintenance",
    stepNumber: 3,
    label: "3. Maintenance",
    shortLabel: "Maintenance",
    tagline: "Under Repair / Warranty RMA",
    description:
      "Track repair issues, RMA numbers, warranty coverage vs. out-of-pocket repair leaks.",
    allowedNextStages: ["deployment", "optimization", "decommission"],
    defaultSubStatus: "Under Repair - RMA",
    subStatusOptions: [
      "Under Repair - RMA",
      "Awaiting Vendor Parts",
      "Diagnostics / IT Bench",
    ],
  },
  optimization: {
    id: "optimization",
    stepNumber: 4,
    label: "4. Optimization",
    shortLabel: "Optimization",
    tagline: "Idle, Reclaimable, or Offboarded",
    description:
      "Surface idle closet hardware, unreturned offboarded laptops, and units ready for reallocation.",
    allowedNextStages: ["deployment", "maintenance", "decommission"],
    defaultSubStatus: "Idle - Ready to Reallocate",
    subStatusOptions: [
      "Idle - Ready to Reallocate",
      "Offboarded - In IT Closet",
      "Offboarded - Awaiting Return",
      "Underutilized - Candidate for Reclaim",
    ],
  },
  decommission: {
    id: "decommission",
    stepNumber: 5,
    label: "5. Decommission",
    shortLabel: "Decommission",
    tagline: "Wiped, Retired, or Resold",
    description:
      "Record data wipe certificate, disposal reason, and salvage/buyback recovery for Finance.",
    allowedNextStages: ["optimization"], // Rare reactivation if needed
    defaultSubStatus: "Retired - Data Wiped",
    subStatusOptions: [
      "Retired - Data Wiped",
      "Sold / Buyback Recovered",
      "E-Waste Recycled",
      "Written Off - Lost/Stolen",
    ],
  },
};

export const STAGE_ORDER: LifecycleStage[] = [
  "procurement",
  "deployment",
  "maintenance",
  "optimization",
  "decommission",
];

/**
 * Normalizes messy spreadsheet model names so equivalent hardware models match reliably.
 * E.g. 'Apple MacBook Pro 14" (M3 Pro)' and 'MacBook Pro 14 M3 Pro' -> 'macbook pro 14 m3 pro'
 */
export function normalizeModelKey(modelName: string): string {
  return (modelName || "")
    .toLowerCase()
    .replace(/\b(apple|dell|lenovo|hp|lg|sony|logitech|caldigit|cisco|ubiquiti)\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(inch|in)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function canTransitionStage(
  fromStage: LifecycleStage,
  toStage: LifecycleStage
): boolean {
  if (fromStage === toStage) return true;
  return LIFECYCLE_STAGES[fromStage].allowedNextStages.includes(toStage);
}

export function daysBetween(fromIso: string, toIso: string): number | null {
  if (!toIso) return null;
  const d1 = new Date(fromIso);
  const d2 = new Date(toIso);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;
  const diffMs = d2.getTime() - d1.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function monthsBetween(fromIso: string, toIso: string): number {
  if (!fromIso) return 0;
  const d1 = new Date(fromIso);
  const d2 = new Date(toIso);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
  const diffDays = Math.max(0, (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
  return Math.round(diffDays / 30.44);
}

/**
 * Computes 36-month straight-line depreciation book value for Finance reporting.
 */
export function calculateBookValue(
  asset: Asset,
  referenceDateIso: string
): { bookValue: number; ageMonths: number } {
  const ageMonths = monthsBetween(asset.purchaseDate, referenceDateIso);
  if (asset.stage === "decommission") {
    return { bookValue: asset.salvageValue || 0, ageMonths };
  }
  const cost = Number(asset.purchaseCost) || 0;
  if (cost <= 0) return { bookValue: 0, ageMonths };
  const usefulLifeMonths = 36;
  const residualFloor = cost * 0.1; // 10% salvage floor while still in active fleet
  const depreciated = cost * (1 - Math.min(ageMonths, usefulLifeMonths) / usefulLifeMonths);
  return {
    bookValue: Math.round(Math.max(residualFloor, depreciated)),
    ageMonths,
  };
}

/**
 * Core rules engine: Enriches every asset with Warranty, EOL, Redundancy, Book Value,
 * and Ghost/Unconfirmed flags, and computes the fleet-wide Money Leaks Summary.
 */
export function enrichAssetsAndAnalyzeLeaks(
  assets: Asset[],
  referenceDateIso: string = new Date().toISOString().slice(0, 10)
): {
  enrichedAssets: AssetEnriched[];
  summary: MoneyLeaksSummary;
} {
  // First pass: group by normalizedModelKey to find unused/idle stock per model
  const modelMap = new Map<
    string,
    {
      modelName: string;
      category: Asset["category"];
      unusedAssets: Asset[];
      orderedAssets: Asset[];
       procurementStockAssets: Asset[];
      optimizationIdleAssets: Asset[];
      activeDeployedCount: number;
    }
  >();

  for (const a of assets) {
    const key = a.normalizedModelKey || normalizeModelKey(a.modelName);
    if (!modelMap.has(key)) {
      modelMap.set(key, {
        modelName: a.modelName,
        category: a.category,
        unusedAssets: [],
        orderedAssets: [],
        procurementStockAssets: [],
        optimizationIdleAssets: [],
        activeDeployedCount: 0,
      });
    }
    const group = modelMap.get(key)!;

    const isProcurementStock =
      a.stage === "procurement" && a.subStatus !== "Ordered";
    const isProcurementOrdered =
      a.stage === "procurement" && a.subStatus === "Ordered";
    const isOptimizationIdle =
      a.stage === "optimization" &&
      !a.subStatus.toLowerCase().includes("awaiting return");

    if (isProcurementStock) {
      group.procurementStockAssets.push(a);
      group.unusedAssets.push(a);
    } else if (isOptimizationIdle) {
      group.optimizationIdleAssets.push(a);
      group.unusedAssets.push(a);
    } else if (isProcurementOrdered) {
      group.orderedAssets.push(a);
    } else if (a.stage === "deployment") {
      group.activeDeployedCount += 1;
    }
  }

  const redundantModelGroups: RedundantModelGroup[] = [];
  for (const [key, group] of modelMap.entries()) {
    const unusedCount = group.unusedAssets.length;
    const orderedCount = group.orderedAssets.length;
    const unusedCapitalValue = group.unusedAssets.reduce(
      (sum, item) => sum + (Number(item.purchaseCost) || 0),
      0
    );
    const avoidableOrderValue =
      unusedCount > 0
        ? group.orderedAssets
            .slice(0, unusedCount)
            .reduce((sum, item) => sum + (Number(item.purchaseCost) || 0), 0)
        : 0;

    if (unusedCount >= 2 || (unusedCount >= 1 && orderedCount >= 1)) {
      const headlineMessage =
        orderedCount > 0 && unusedCount > 0
          ? `Redundant order alert: Buying ${orderedCount} new while you already own ${unusedCount} of this model unused ($${unusedCapitalValue.toLocaleString()} in stock/idle).`
          : `You already own ${unusedCount} of this model, unused ($${unusedCapitalValue.toLocaleString()} sitting idle).`;

      redundantModelGroups.push({
        normalizedModelKey: key,
        modelName: group.modelName,
        category: group.category,
        unusedUnitsCount: unusedCount,
        inProcurementOrderedCount: orderedCount,
        inProcurementStockCount: group.procurementStockAssets.length,
        inOptimizationIdleCount: group.optimizationIdleAssets.length,
        activeDeployedCount: group.activeDeployedCount,
        unusedCapitalValue,
        avoidableOrderValue,
        unusedAssetTags: group.unusedAssets.map((u) => u.assetTag),
        unusedAssetIds: group.unusedAssets.map((u) => u.id),
        headlineMessage,
      });
    }
  }

  redundantModelGroups.sort(
    (a, b) =>
      b.avoidableOrderValue +
      b.unusedCapitalValue -
      (a.avoidableOrderValue + a.unusedCapitalValue)
  );

  // Second pass: enrich individual assets and accumulate summary stats
  let totalUnusedStockCount = 0;
  let totalUnusedCapitalValue = 0;
  let avoidablePendingOrderValue = 0;

  let unconfirmedAssetsCount = 0;
  let unconfirmedAssetsValue = 0;
  let contradictoryCount = 0;
  let unlocatedCount = 0;
  let missingDataCount = 0;

  let warrantyExpiringSoonCount = 0;
  let warrantyExpiredActiveCount = 0;
  let outOfWarrantyRepairRiskCount = 0;
  let approachingEolCount = 0;
  let pastEolActiveCount = 0;
  let upcomingEolReplacementCapex = 0;

  let activeFleetCount = 0;
  let totalFleetPurchaseValue = 0;
  let totalCurrentBookValue = 0;
  let totalRepairSpend = 0;
  let totalSalvageRecovered = 0;

  const enrichedAssets: AssetEnriched[] = assets.map((asset) => {
    const isDecommissioned = asset.stage === "decommission";
    const daysToWarrantyExpiry = daysBetween(
      referenceDateIso,
      asset.warrantyExpiryDate
    );
    const daysToEol = daysBetween(referenceDateIso, asset.eolDate);

    let warrantyFlag: WarrantyFlag = "no_date";
    if (daysToWarrantyExpiry !== null) {
      if (daysToWarrantyExpiry < 0) warrantyFlag = "expired";
      else if (daysToWarrantyExpiry <= 60) warrantyFlag = "expiring_soon";
      else warrantyFlag = "healthy";
    }

    let eolFlag: EolFlag = "no_date";
    if (daysToEol !== null) {
      if (daysToEol < 0) eolFlag = "past_eol";
      else if (daysToEol <= 90) eolFlag = "approaching_eol";
      else eolFlag = "healthy";
    }

    const key = asset.normalizedModelKey || normalizeModelKey(asset.modelName);
    const modelGroup = modelMap.get(key);
    const redundantUnusedUnitsForModel = modelGroup
      ? modelGroup.unusedAssets.length
      : 0;

    const isUnusedStock =
      (asset.stage === "procurement" && asset.subStatus !== "Ordered") ||
      (asset.stage === "optimization" &&
        !asset.subStatus.toLowerCase().includes("awaiting return"));

    const isRedundantPurchaseFlag =
      !isDecommissioned &&
      ((asset.stage === "procurement" &&
        asset.subStatus === "Ordered" &&
        redundantUnusedUnitsForModel >= 1) ||
        (isUnusedStock && redundantUnusedUnitsForModel >= 2));

    let redundancyMessage: string | null = null;
    if (
      asset.stage === "procurement" &&
      asset.subStatus === "Ordered" &&
      redundantUnusedUnitsForModel >= 1
    ) {
      redundancyMessage = `Redundant order: You already own ${redundantUnusedUnitsForModel} of ${asset.modelName}, unused (${modelGroup?.unusedAssets
        .map((u) => u.assetTag)
        .join(", ")})`;
    } else if (isUnusedStock && redundantUnusedUnitsForModel >= 2) {
      redundancyMessage = `You already own ${redundantUnusedUnitsForModel} of this model, unused — reallocate before buying more`;
    }

    const isGhostOrUnconfirmed =
      !isDecommissioned && asset.verificationStatus !== "verified";

    const { bookValue, ageMonths } = calculateBookValue(asset, referenceDateIso);

    // Aggregate metrics
    totalFleetPurchaseValue += Number(asset.purchaseCost) || 0;
    totalCurrentBookValue += bookValue;
    totalRepairSpend += Number(asset.repairCostTotal) || 0;
    totalSalvageRecovered += Number(asset.salvageValue) || 0;

    if (!isDecommissioned) {
      activeFleetCount += 1;

      if (isUnusedStock) {
        totalUnusedStockCount += 1;
        totalUnusedCapitalValue += Number(asset.purchaseCost) || 0;
      }

      if (isGhostOrUnconfirmed) {
        unconfirmedAssetsCount += 1;
        unconfirmedAssetsValue += Number(asset.purchaseCost) || 0;
        if (asset.verificationStatus === "contradictory") contradictoryCount += 1;
        if (asset.verificationStatus === "unlocated") unlocatedCount += 1;
        if (asset.verificationStatus === "missing_data") missingDataCount += 1;
      }

      if (warrantyFlag === "expiring_soon") warrantyExpiringSoonCount += 1;
      if (warrantyFlag === "expired") warrantyExpiredActiveCount += 1;

      if (
        asset.stage === "maintenance" &&
        (!asset.warrantyCovered || warrantyFlag === "expired")
      ) {
        outOfWarrantyRepairRiskCount += 1;
      }

      if (eolFlag === "approaching_eol") {
        approachingEolCount += 1;
        upcomingEolReplacementCapex += Number(asset.purchaseCost) || 0;
      } else if (eolFlag === "past_eol") {
        pastEolActiveCount += 1;
        upcomingEolReplacementCapex += Number(asset.purchaseCost) || 0;
      }
    }

    return {
      ...asset,
      daysToWarrantyExpiry,
      warrantyFlag,
      daysToEol,
      eolFlag,
      isUnusedStock,
      redundantUnusedUnitsForModel,
      isRedundantPurchaseFlag,
      redundancyMessage,
      isGhostOrUnconfirmed,
      bookValue,
      ageMonths,
    };
  });

  avoidablePendingOrderValue = redundantModelGroups.reduce(
    (sum, g) => sum + g.avoidableOrderValue,
    0
  );

  const totalMoneyLeaksExposed =
    totalUnusedCapitalValue +
    avoidablePendingOrderValue +
    unconfirmedAssetsValue +
    totalRepairSpend;

  return {
    enrichedAssets,
    summary: {
      redundantModelGroups,
      totalUnusedStockCount,
      totalUnusedCapitalValue,
      avoidablePendingOrderValue,
      unconfirmedAssetsCount,
      unconfirmedAssetsValue,
      contradictoryCount,
      unlocatedCount,
      missingDataCount,
      warrantyExpiringSoonCount,
      warrantyExpiredActiveCount,
      outOfWarrantyRepairRiskCount,
      approachingEolCount,
      pastEolActiveCount,
      upcomingEolReplacementCapex,
      totalAssetsCount: assets.length,
      activeFleetCount,
      totalFleetPurchaseValue,
      totalCurrentBookValue,
      totalRepairSpend,
      totalSalvageRecovered,
      totalMoneyLeaksExposed,
    },
  };
}
