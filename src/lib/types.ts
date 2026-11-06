export type LifecycleStage =
  | "procurement"
  | "deployment"
  | "maintenance"
  | "optimization"
  | "decommission";

export type AssetCategory =
  | "Laptop"
  | "Monitor"
  | "Phone / Tablet"
  | "Server / Network"
  | "Dock / Peripheral";

export type VerificationStatus =
  | "verified"
  | "unverified"
  | "missing_data"
  | "contradictory"
  | "unlocated";

export interface Asset {
  id: string;
  assetTag: string;
  serialNumber: string;
  modelName: string;
  normalizedModelKey: string;
  category: AssetCategory;
  vendor: string;
  stage: LifecycleStage;
  subStatus: string;

  // Stage 1: Procurement
  purchaseDate: string;
  purchaseCost: number;
  poNumber: string;
  warrantyExpiryDate: string;
  eolDate: string;

  // Stage 2: Deployment
  assignedTo: string;
  assignedEmail: string;
  department: string;
  location: string;
  deployedDate: string;
  condition: string;

  // Stage 3: Maintenance
  maintenanceIssue: string;
  rmaNumber: string;
  repairCostTotal: number;
  warrantyCovered: boolean;
  loanerAssetTag: string;

  // Stage 4: Optimization
  optimizationReason: string;
  storageLocation: string;
  idleSinceDate: string;
  recommendedAction: string;

  // Stage 5: Decommission
  decommissionDate: string;
  decommissionReason: string;
  dataWipeCert: string;
  salvageValue: number;

  // Spreadsheet Escape / Verification
  verificationStatus: VerificationStatus;
  anomalyNote: string;
  lastVerifiedDate: string;
  importedFromCsv: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LifecycleEvent {
  id: string;
  assetId: string;
  fromStage: LifecycleStage | null;
  toStage: LifecycleStage;
  actionTitle: string;
  actor: string;
  costImpact: number;
  notes: string;
  metadataJson: string;
  createdAt: string;
}

export type WarrantyFlag = "healthy" | "expiring_soon" | "expired" | "no_date";
export type EolFlag = "healthy" | "approaching_eol" | "past_eol" | "no_date";

export interface AssetEnriched extends Asset {
  daysToWarrantyExpiry: number | null;
  warrantyFlag: WarrantyFlag;
  daysToEol: number | null;
  eolFlag: EolFlag;
  isUnusedStock: boolean;
  redundantUnusedUnitsForModel: number;
  isRedundantPurchaseFlag: boolean;
  redundancyMessage: string | null;
  isGhostOrUnconfirmed: boolean;
  bookValue: number;
  ageMonths: number;
}

export interface RedundantModelGroup {
  normalizedModelKey: string;
  modelName: string;
  category: AssetCategory;
  unusedUnitsCount: number;
  inProcurementOrderedCount: number;
  inProcurementStockCount: number;
  inOptimizationIdleCount: number;
  activeDeployedCount: number;
  unusedCapitalValue: number;
  avoidableOrderValue: number;
  unusedAssetTags: string[];
  unusedAssetIds: string[];
  headlineMessage: string;
}

export interface MoneyLeaksSummary {
  // 1. Redundant / Idle stock
  redundantModelGroups: RedundantModelGroup[];
  totalUnusedStockCount: number;
  totalUnusedCapitalValue: number;
  avoidablePendingOrderValue: number;

  // 2. Ghost / Unconfirmed / Spreadsheet Contradictions ("Business Case Validator")
  unconfirmedAssetsCount: number;
  unconfirmedAssetsValue: number;
  contradictoryCount: number;
  unlocatedCount: number;
  missingDataCount: number;

  // 3. Warranty & EOL risks
  warrantyExpiringSoonCount: number;
  warrantyExpiredActiveCount: number;
  outOfWarrantyRepairRiskCount: number;
  approachingEolCount: number;
  pastEolActiveCount: number;
  upcomingEolReplacementCapex: number;

  // 4. Overall Fleet Metrics
  totalAssetsCount: number;
  activeFleetCount: number;
  totalFleetPurchaseValue: number;
  totalCurrentBookValue: number;
  totalRepairSpend: number;
  totalSalvageRecovered: number;
  totalMoneyLeaksExposed: number;
}

export interface StageTransitionPayload {
  targetStage: LifecycleStage;
  actor?: string;
  notes?: string;
  // Stage-specific minimal form fields
  subStatus?: string;
  // Procurement
  poNumber?: string;
  purchaseCost?: number;
  warrantyExpiryDate?: string;
  eolDate?: string;
  // Deployment
  assignedTo?: string;
  assignedEmail?: string;
  department?: string;
  location?: string;
  deployedDate?: string;
  condition?: string;
  // Maintenance
  maintenanceIssue?: string;
  rmaNumber?: string;
  repairCostDelta?: number;
  warrantyCovered?: boolean;
  loanerAssetTag?: string;
  // Optimization
  optimizationReason?: string;
  storageLocation?: string;
  idleSinceDate?: string;
  recommendedAction?: string;
  // Decommission
  decommissionDate?: string;
  decommissionReason?: string;
  dataWipeCert?: string;
  salvageValue?: number;
  // Verification
  markVerified?: boolean;
}

export interface AssetUpdatePayload {
  modelName?: string;
  category?: AssetCategory;
  vendor?: string;
  serialNumber?: string;
  stage?: LifecycleStage;
  subStatus?: string;
  poNumber?: string;
  purchaseCost?: number;
  purchaseDate?: string;
  warrantyExpiryDate?: string;
  eolDate?: string;
  assignedTo?: string;
  assignedEmail?: string;
  department?: string;
  location?: string;
  deployedDate?: string;
  condition?: string;
  maintenanceIssue?: string;
  rmaNumber?: string;
  repairCostTotal?: number;
  warrantyCovered?: boolean;
  loanerAssetTag?: string;
  optimizationReason?: string;
  storageLocation?: string;
  idleSinceDate?: string;
  recommendedAction?: string;
  decommissionDate?: string;
  decommissionReason?: string;
  dataWipeCert?: string;
  salvageValue?: number;
  verificationStatus?: VerificationStatus;
  anomalyNote?: string;
  actor?: string;
  editNotes?: string;
}

export type BulkActionType =
  | "transition"
  | "verify"
  | "delete"
  | "update_location"
  | "update_department";

export interface BulkActionPayload {
  action: BulkActionType;
  assetIds: string[];
  transitionPayload?: StageTransitionPayload;
  location?: string;
  department?: string;
  actor?: string;
  notes?: string;
}

