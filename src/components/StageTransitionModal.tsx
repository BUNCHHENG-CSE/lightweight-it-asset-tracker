"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  DollarSign,
  PackagePlus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import {
  AssetCategory,
  AssetEnriched,
  LifecycleStage,
  StageTransitionPayload,
} from "@/lib/types";
import {
  LIFECYCLE_STAGES,
  normalizeModelKey,
  STAGE_ORDER,
} from "@/lib/lifecycle-machine";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface StageTransitionModalProps {
  mode: "create" | "transition";
  asset?: AssetEnriched | null;
  initialTargetStage?: LifecycleStage;
  allAssets: AssetEnriched[];
  onClose: () => void;
  onCreateAsset: (payload: Record<string, unknown>) => Promise<void>;
  onTransitionAsset: (
    assetId: string,
    payload: StageTransitionPayload
  ) => Promise<void>;
  onSelectExistingAssetToDeploy: (existingAsset: AssetEnriched) => void;
}

const POPULAR_MODELS: {
  modelName: string;
  category: AssetCategory;
  defaultCost: number;
  vendor: string;
}[] = [
  {
    modelName: 'MacBook Pro 14" (M3 Pro)',
    category: "Laptop",
    defaultCost: 1999,
    vendor: "Apple Business",
  },
  {
    modelName: "ThinkPad X1 Carbon Gen 11",
    category: "Laptop",
    defaultCost: 1650,
    vendor: "Lenovo Pro",
  },
  {
    modelName: 'Dell UltraSharp 27" 4K USB-C (U2723QE)',
    category: "Monitor",
    defaultCost: 580,
    vendor: "CDW Direct",
  },
  {
    modelName: 'MacBook Air 15" (M3)',
    category: "Laptop",
    defaultCost: 1499,
    vendor: "Apple Business",
  },
  {
    modelName: "iPhone 15 Pro (256GB)",
    category: "Phone / Tablet",
    defaultCost: 1099,
    vendor: "Verizon Business",
  },
  {
    modelName: "CalDigit TS4 Thunderbolt 4 Dock",
    category: "Dock / Peripheral",
    defaultCost: 379,
    vendor: "B&H Business",
  },
];

const DEPARTMENTS = [
  "Engineering",
  "Sales",
  "Marketing",
  "Finance",
  "Operations",
  "Customer Success",
  "HR",
  "Design",
  "Unassigned (IT Stock)",
];

export default function StageTransitionModal({
  mode,
  asset,
  initialTargetStage,
  allAssets,
  onClose,
  onCreateAsset,
  onTransitionAsset,
  onSelectExistingAssetToDeploy,
}: StageTransitionModalProps) {
  const today = new Date().toISOString().slice(0, 10);
  const oneYearOut = new Date(Date.now() + 365 * 86400000)
    .toISOString()
    .slice(0, 10);
  const threeYearsOut = new Date(Date.now() + 1095 * 86400000)
    .toISOString()
    .slice(0, 10);

  const [targetStage, setTargetStage] = useState<LifecycleStage>(
    initialTargetStage ||
      (mode === "create"
        ? "procurement"
        : asset
        ? LIFECYCLE_STAGES[asset.stage].allowedNextStages[0] || "deployment"
        : "deployment")
  );

  // Create / Procurement fields
  const [modelName, setModelName] = useState(
    asset?.modelName || 'MacBook Pro 14" (M3 Pro)'
  );
  const [category, setCategory] = useState<AssetCategory>(
    asset?.category || "Laptop"
  );
  const [assetTag, setAssetTag] = useState(asset?.assetTag || "");
  const [serialNumber, setSerialNumber] = useState(asset?.serialNumber || "");
  const [vendor, setVendor] = useState(asset?.vendor || "Apple Business");
  const [purchaseCost, setPurchaseCost] = useState<string>(
    String(asset?.purchaseCost ?? 1999)
  );
  const [poNumber, setPoNumber] = useState(
    asset?.poNumber || `PO-2026-${Math.floor(900 + Math.random() * 90)}`
  );
  const [purchaseDate, setPurchaseDate] = useState(
    asset?.purchaseDate || today
  );
  const [warrantyExpiryDate, setWarrantyExpiryDate] = useState(
    asset?.warrantyExpiryDate || oneYearOut
  );
  const [eolDate, setEolDate] = useState(asset?.eolDate || threeYearsOut);

  // Substatus
  const [subStatus, setSubStatus] = useState<string>(
    LIFECYCLE_STAGES[targetStage].defaultSubStatus
  );

  // Stage 2: Deployment fields
  const [assignedTo, setAssignedTo] = useState(asset?.assignedTo || "");
  const [assignedEmail, setAssignedEmail] = useState(
    asset?.assignedEmail || ""
  );
  const [department, setDepartment] = useState(
    asset?.department && asset.department !== "Unassigned (IT Stock)"
      ? asset.department
      : "Engineering"
  );
  const [location, setLocation] = useState(
    asset?.location && !asset.location.includes("Cage")
      ? asset.location
      : "HQ - Floor 3"
  );
  const [condition, setCondition] = useState(asset?.condition || "Good");

  // Stage 3: Maintenance fields
  const [maintenanceIssue, setMaintenanceIssue] = useState(
    asset?.maintenanceIssue || ""
  );
  const [rmaNumber, setRmaNumber] = useState(
    asset?.rmaNumber || `RMA-${Math.floor(10000 + Math.random() * 89999)}`
  );
  const isWarrantyActive =
    asset?.daysToWarrantyExpiry !== null &&
    asset?.daysToWarrantyExpiry !== undefined
      ? asset.daysToWarrantyExpiry >= 0
      : true;
  const [warrantyCovered, setWarrantyCovered] = useState<boolean>(
    isWarrantyActive
  );
  const [repairCostDelta, setRepairCostDelta] = useState<string>(
    isWarrantyActive ? "0" : "285"
  );
  const [loanerAssetTag, setLoanerAssetTag] = useState(
    asset?.loanerAssetTag || ""
  );

  // Stage 4: Optimization fields
  const [optimizationReason, setOptimizationReason] = useState(
    asset?.optimizationReason ||
      "Employee offboarded — wiped and returned to IT closet"
  );
  const [storageLocation, setStorageLocation] = useState(
    asset?.storageLocation || "HQ - IT Cage Shelf B1"
  );
  const [recommendedAction, setRecommendedAction] = useState(
    asset?.recommendedAction ||
      "Reallocate to next hire before approving new POs"
  );

  // Stage 5: Decommission fields
  const [decommissionReason, setDecommissionReason] = useState(
    asset?.decommissionReason || "End of Life (EOL) — IT Buyback / Refresh"
  );
  const [dataWipeCert, setDataWipeCert] = useState(
    asset?.dataWipeCert ||
      `CERT-NIST800-88-${Math.floor(5000 + Math.random() * 4999)}`
  );
  const [salvageValue, setSalvageValue] = useState<string>(
    String(
      asset?.salvageValue ||
        Math.round((Number(asset?.purchaseCost) || 1500) * 0.15)
    )
  );

  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Handle stage tab switch inside modal
  const handleStageChange = (newStage: LifecycleStage) => {
    setTargetStage(newStage);
    setSubStatus(LIFECYCLE_STAGES[newStage].defaultSubStatus);
  };

  // LIVE REDUNDANCY CHECK when procuring / adding a new asset!
  const matchingUnusedAssets = useMemo(() => {
    const key = normalizeModelKey(modelName);
    if (!key) return [];
    return allAssets.filter((a) => {
      const aKey = a.normalizedModelKey || normalizeModelKey(a.modelName);
      return aKey === key && a.isUnusedStock && a.id !== asset?.id;
    });
  }, [modelName, allAssets, asset]);

  const unusedTotalValue = useMemo(
    () =>
      matchingUnusedAssets.reduce(
        (sum, item) => sum + (Number(item.purchaseCost) || 0),
        0
      ),
    [matchingUnusedAssets]
  );

  // Idle loaner candidates for Maintenance stage
  const availableLoaners = useMemo(
    () =>
      allAssets.filter(
        (a) =>
          a.isUnusedStock &&
          a.category === (asset?.category || category) &&
          a.id !== asset?.id
      ),
    [allAssets, asset, category]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "create") {
        await onCreateAsset({
          assetTag: assetTag.trim() || undefined,
          serialNumber: serialNumber.trim(),
          modelName: modelName.trim(),
          category,
          vendor: vendor.trim(),
          stage: targetStage,
          subStatus,
          purchaseDate,
          purchaseCost: Number(purchaseCost) || 0,
          poNumber: poNumber.trim(),
          warrantyExpiryDate,
          eolDate,
          assignedTo: targetStage === "deployment" ? assignedTo.trim() : "",
          assignedEmail:
            targetStage === "deployment" ? assignedEmail.trim() : "",
          department:
            targetStage === "deployment"
              ? department
              : "Unassigned (IT Stock)",
          location:
            targetStage === "deployment" ? location.trim() : "HQ - Receiving",
        });
      } else if (asset) {
        await onTransitionAsset(asset.id, {
          targetStage,
          subStatus,
          notes: notes.trim() || undefined,
          poNumber,
          purchaseCost: Number(purchaseCost) || asset.purchaseCost,
          warrantyExpiryDate,
          eolDate,
          assignedTo: assignedTo.trim(),
          assignedEmail: assignedEmail.trim(),
          department,
          location: location.trim(),
          condition,
          maintenanceIssue: maintenanceIssue.trim(),
          rmaNumber: rmaNumber.trim(),
          repairCostDelta: Number(repairCostDelta) || 0,
          warrantyCovered,
          loanerAssetTag,
          optimizationReason: optimizationReason.trim(),
          storageLocation: storageLocation.trim(),
          recommendedAction: recommendedAction.trim(),
          decommissionReason: decommissionReason.trim(),
          dataWipeCert: dataWipeCert.trim(),
          salvageValue: Number(salvageValue) || 0,
          markVerified: true,
        });
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-card rounded-xl shadow-2xl border border-border w-full max-w-2xl overflow-hidden my-8 text-card-foreground">
        {/* Header */}
        <div className="bg-muted/40 border-b border-border px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary font-mono">
              {mode === "create" ? (
                <>
                  <PackagePlus className="w-4 h-4" />
                  <span>Stage 1: Procurement & Redundancy Gate</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>5-Stage Lifecycle State Machine</span>
                </>
              )}
            </div>
            <h2 className="text-lg font-bold text-foreground mt-0.5">
              {mode === "create"
                ? "Procure / Register IT Asset"
                : `Transition ${asset?.assetTag} — ${asset?.modelName}`}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Stage Selector Pills */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 font-mono">
              {mode === "create"
                ? "Initial Lifecycle Stage"
                : `Move from ${
                    asset ? LIFECYCLE_STAGES[asset.stage].shortLabel : ""
                  } to Stage:`}
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {STAGE_ORDER.map((stg) => {
                const def = LIFECYCLE_STAGES[stg];
                const isCurrent = mode === "transition" && asset?.stage === stg;
                const isSelected = targetStage === stg;
                return (
                  <button
                    key={stg}
                    type="button"
                    onClick={() => handleStageChange(stg)}
                    className={`px-2.5 py-2 rounded-lg text-left border transition-all ${
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary font-bold shadow-xs"
                        : isCurrent
                        ? "bg-secondary text-secondary-foreground border-border font-medium"
                        : "bg-card text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground"
                    }`}
                  >
                    <div className="text-[10px] opacity-75 font-mono">
                      0{def.stepNumber}
                    </div>
                    <div className="text-xs font-semibold truncate mt-0.5">
                      {def.shortLabel}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {LIFECYCLE_STAGES[targetStage].description}
            </p>
          </div>

          {/* LIVE REDUNDANCY ALERT BANNER */}
          {mode === "create" && matchingUnusedAssets.length > 0 && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 text-amber-900 dark:text-amber-200 shadow-xs space-y-2">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="font-bold text-sm text-amber-700 dark:text-amber-300">
                    Redundant Purchase Flag: You already own {matchingUnusedAssets.length} of this model, unused (${unusedTotalValue.toLocaleString()} tied up)
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Before spending another{" "}
                    <strong className="text-foreground">${Number(purchaseCost || 0).toLocaleString()}</strong>{" "}
                    on a new <strong>{modelName}</strong>, you have{" "}
                    {matchingUnusedAssets.length} idle unit(s) ready for immediate deployment:
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2 pt-1">
                    {matchingUnusedAssets.map((unused) => (
                      <button
                        key={unused.id}
                        type="button"
                        onClick={() => onSelectExistingAssetToDeploy(unused)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 dark:text-amber-200 border border-amber-500/30 text-xs font-semibold transition"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        <span>Reallocate {unused.assetTag} ({unused.location || unused.subStatus})</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Create Mode: Hardware Model & Quick Presets */}
          {mode === "create" && (
            <div className="space-y-3 bg-muted/30 p-4 rounded-xl border border-border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                  Hardware Model & Quick Presets
                </label>
                <span className="text-[11px] text-muted-foreground">
                  Click preset to test live duplicate detection
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_MODELS.map((preset) => (
                  <button
                    key={preset.modelName}
                    type="button"
                    onClick={() => {
                      setModelName(preset.modelName);
                      setCategory(preset.category);
                      setPurchaseCost(String(preset.defaultCost));
                      setVendor(preset.vendor);
                    }}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                      modelName === preset.modelName
                        ? "bg-primary text-primary-foreground border-primary font-semibold shadow-xs"
                        : "bg-background border-input text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                    }`}
                  >
                    {preset.modelName}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-foreground/80 mb-1">
                    Model Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder='e.g. MacBook Pro 14" (M3 Pro)'
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/80 mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value as AssetCategory)
                    }
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="Laptop">Laptop</option>
                    <option value="Monitor">Monitor</option>
                    <option value="Phone / Tablet">Phone / Tablet</option>
                    <option value="Server / Network">Server / Network</option>
                    <option value="Dock / Peripheral">Dock / Peripheral</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground/80 mb-1">
                    Asset Tag (auto if blank)
                  </label>
                  <input
                    type="text"
                    value={assetTag}
                    onChange={(e) => setAssetTag(e.target.value)}
                    placeholder="AST-1025"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/80 mb-1">
                    Serial Number
                  </label>
                  <input
                    type="text"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    placeholder="C02Z..."
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/80 mb-1">
                    Vendor
                  </label>
                  <input
                    type="text"
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                    placeholder="Apple Business / CDW"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Stage Sub-Status Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground/80 mb-1">
                Stage Status ({LIFECYCLE_STAGES[targetStage].shortLabel})
              </label>
              <select
                value={subStatus}
                onChange={(e) => setSubStatus(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {LIFECYCLE_STAGES[targetStage].subStatusOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            {mode === "transition" && asset && (
              <div className="flex flex-col justify-end">
                <div className="text-xs bg-muted/40 rounded-lg px-3 py-2 border border-border text-muted-foreground">
                  Current Cost:{" "}
                  <strong className="text-foreground">
                    ${asset.purchaseCost.toLocaleString()}
                  </strong>{" "}
                  • Book Value:{" "}
                  <strong className="text-primary">
                    ${asset.bookValue.toLocaleString()}
                  </strong>
                </div>
              </div>
            )}
          </div>

          {/* STAGE SPECIFIC FORMS */}
          {(targetStage === "procurement" || mode === "create") && (
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 dark:bg-sky-500/10 p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400 flex items-center gap-1.5 font-mono">
                <DollarSign className="w-4 h-4" />
                <span>Procurement & Lifecycle Financial Details</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground/80 mb-1">
                    Unit Cost ($) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="1"
                    value={purchaseCost}
                    onChange={(e) => setPurchaseCost(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/80 mb-1">
                    PO / Invoice #
                  </label>
                  <input
                    type="text"
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/80 mb-1">
                    Warranty Expiry
                  </label>
                  <input
                    type="date"
                    value={warrantyExpiryDate}
                    onChange={(e) => setWarrantyExpiryDate(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/80 mb-1">
                    Target EOL Date
                  </label>
                  <input
                    type="date"
                    value={eolDate}
                    onChange={(e) => setEolDate(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>
            </div>
          )}

          {targetStage === "deployment" && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10 p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-mono">
                <CheckCircle2 className="w-4 h-4" />
                <span>Stage 2: Deployment & Custody Confirmation</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground/80 mb-1">
                    Assigned Custodian *
                  </label>
                  <input
                    type="text"
                    required
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    placeholder="e.g. Maya Lin"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/80 mb-1">
                    Employee Email
                  </label>
                  <input
                    type="email"
                    value={assignedEmail}
                    onChange={(e) => setAssignedEmail(e.target.value)}
                    placeholder="maya.l@vanguardlabs.io"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/80 mb-1">
                    Department (Finance Chargeback)
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/80 mb-1">
                    Physical / Remote Location *
                  </label>
                  <input
                    type="text"
                    required
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="HQ - Floor 3 / Remote - Austin"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>
            </div>
          )}

          {targetStage === "maintenance" && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5 font-mono">
                  <Wrench className="w-4 h-4" />
                  <span>Stage 3: Maintenance & Warranty RMA Tracking</span>
                </div>
                {isWarrantyActive ? (
                  <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 font-mono text-xs">
                    <ShieldCheck className="w-3.5 h-3.5" /> Warranty Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/10 font-mono text-xs">
                    <ShieldAlert className="w-3.5 h-3.5" /> Warranty Expired
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-foreground/80 mb-1">
                    Issue Summary *
                  </label>
                  <input
                    type="text"
                    required
                    value={maintenanceIssue}
                    onChange={(e) => setMaintenanceIssue(e.target.value)}
                    placeholder="e.g. Battery swelling / USB-C logic board failure"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/80 mb-1">
                    Vendor RMA / Ticket #
                  </label>
                  <input
                    type="text"
                    value={rmaNumber}
                    onChange={(e) => setRmaNumber(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/80 mb-1">
                    Out-of-Pocket Repair Cost ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={repairCostDelta}
                    onChange={(e) => setRepairCostDelta(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div className="flex items-center gap-2 pt-2 sm:col-span-2">
                  <input
                    id="warrantyCoveredCheck"
                    type="checkbox"
                    checked={warrantyCovered}
                    onChange={(e) => {
                      setWarrantyCovered(e.target.checked);
                      if (e.target.checked) setRepairCostDelta("0");
                    }}
                    className="rounded border-input text-primary focus:ring-ring"
                  />
                  <label
                    htmlFor="warrantyCoveredCheck"
                    className="text-xs font-medium text-foreground/80 cursor-pointer"
                  >
                    Covered under manufacturer warranty ($0 repair leak)
                  </label>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-foreground/80 mb-1">
                    Issue Idle Loaner Asset (Optional)
                  </label>
                  <select
                    value={loanerAssetTag}
                    onChange={(e) => setLoanerAssetTag(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">None / No loaner needed</option>
                    {availableLoaners.map((l) => (
                      <option key={l.id} value={l.assetTag}>
                        {l.assetTag} — {l.modelName} ({l.location})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {targetStage === "optimization" && (
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 dark:bg-purple-500/10 p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5 font-mono">
                <Sparkles className="w-4 h-4" />
                <span>Stage 4: Optimization & Closet Stock Pool</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-foreground/80 mb-1">
                    Why is this asset in Optimization? *
                  </label>
                  <input
                    type="text"
                    required
                    value={optimizationReason}
                    onChange={(e) => setOptimizationReason(e.target.value)}
                    placeholder="e.g. Employee offboarded — wiped and ready for next hire"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/80 mb-1">
                    Storage / Locker Location *
                  </label>
                  <input
                    type="text"
                    required
                    value={storageLocation}
                    onChange={(e) => setStorageLocation(e.target.value)}
                    placeholder="HQ - IT Cage Shelf B1"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/80 mb-1">
                    Recommended Next Action
                  </label>
                  <input
                    type="text"
                    value={recommendedAction}
                    onChange={(e) => setRecommendedAction(e.target.value)}
                    placeholder="Reallocate to next new hire"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>
            </div>
          )}

          {targetStage === "decommission" && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 font-mono">
                <ShieldCheck className="w-4 h-4" />
                <span>Stage 5: Decommission, NIST Wipe & Salvage Recovery</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-foreground/80 mb-1">
                    Disposal Reason *
                  </label>
                  <select
                    value={decommissionReason}
                    onChange={(e) => setDecommissionReason(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="End of Life (EOL) — IT Buyback / Refresh">
                      End of Life (EOL) — IT Buyback / Refresh
                    </option>
                    <option value="Broken Beyond Economical Repair">
                      Broken Beyond Economical Repair
                    </option>
                    <option value="R2 Certified E-Waste Recycling">
                      R2 Certified E-Waste Recycling
                    </option>
                    <option value="Written Off — Unrecovered / Lost">
                      Written Off — Unrecovered / Lost
                    </option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-foreground/80 mb-1">
                    Data Wipe Certificate / NIST Ref
                  </label>
                  <input
                    type="text"
                    value={dataWipeCert}
                    onChange={(e) => setDataWipeCert(e.target.value)}
                    placeholder="CERT-NIST800-88-..."
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/80 mb-1">
                    Salvage / Buyback ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={salvageValue}
                    onChange={(e) => setSalvageValue(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>
            </div>
          )}

          {mode === "transition" && (
            <div>
              <label className="block text-xs font-medium text-foreground/80 mb-1">
                Audit Trail Note (Optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add brief context for lifecycle audit trail..."
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="font-mono text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              size="sm"
              className="font-mono text-xs gap-1.5 shadow-sm"
            >
              <span>
                {submitting
                  ? "Saving..."
                  : mode === "create"
                  ? `Save to ${LIFECYCLE_STAGES[targetStage].shortLabel}`
                  : `Confirm Move to ${LIFECYCLE_STAGES[targetStage].shortLabel}`}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
