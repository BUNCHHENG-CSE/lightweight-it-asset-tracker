"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Edit3,
  HardDrive,
  History,
  Laptop,
  MapPin,
  Monitor,
  Printer,
  QrCode,
  Server,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tag,
  Trash2,
  User,
  Wrench,
  X,
} from "lucide-react";
import {
  AssetCategory,
  AssetEnriched,
  LifecycleEvent,
  LifecycleStage,
} from "@/lib/types";
import { LIFECYCLE_STAGES, STAGE_ORDER } from "@/lib/lifecycle-machine";
import { generateBarcodeSvg, generateQrCodeSvg } from "@/lib/qr-generator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface AssetDetailDrawerProps {
  asset: AssetEnriched | null;
  events: LifecycleEvent[];
  onClose: () => void;
  onOpenTransitionModal: (
    asset: AssetEnriched,
    targetStage: LifecycleStage
  ) => void;
  onVerifyCustody: (
    assetId: string,
    updates: {
      assignedTo?: string;
      location?: string;
      serialNumber?: string;
      resolutionNote?: string;
    }
  ) => Promise<void>;
  onDeleteAsset: (assetId: string) => Promise<void>;
  onEditAsset?: (asset: AssetEnriched) => void;
  onPrintLabel?: (asset: AssetEnriched) => void;
}

export default function AssetDetailDrawer({
  asset,
  events,
  onClose,
  onOpenTransitionModal,
  onVerifyCustody,
  onDeleteAsset,
  onEditAsset,
  onPrintLabel,
}: AssetDetailDrawerProps) {
  if (!asset) return null;

  const [verifyLocation, setVerifyLocation] = useState(
    asset.location || "HQ - Verified"
  );
  const [verifyAssignedTo, setVerifyAssignedTo] = useState(
    asset.assignedTo || ""
  );
  const [verifySerial, setVerifySerial] = useState(
    asset.serialNumber.startsWith("MISSING-") ? "" : asset.serialNumber
  );
  const [verifying, setVerifying] = useState(false);

  const assetEvents = events.filter((e) => e.assetId === asset.id);
  const currentStep = LIFECYCLE_STAGES[asset.stage].stepNumber;

  const handleQuickVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    try {
      await onVerifyCustody(asset.id, {
        location: verifyLocation,
        assignedTo: verifyAssignedTo,
        serialNumber: verifySerial || asset.serialNumber,
        resolutionNote: `Verified physical custody & resolved spreadsheet anomaly (${
          asset.anomalyNote || "Audit check"
        }).`,
      });
    } finally {
      setVerifying(false);
    }
  };

  const getCategoryIcon = (cat: AssetCategory) => {
    switch (cat) {
      case "Laptop":
        return <Laptop className="w-3.5 h-3.5" />;
      case "Monitor":
        return <Monitor className="w-3.5 h-3.5" />;
      case "Phone / Tablet":
        return <Smartphone className="w-3.5 h-3.5" />;
      case "Server / Network":
        return <Server className="w-3.5 h-3.5" />;
      default:
        return <HardDrive className="w-3.5 h-3.5" />;
    }
  };

  // 36-month depreciation calculation percentage
  const depreciationPct = Math.min(
    100,
    Math.round((asset.ageMonths / 36) * 100)
  );

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-background/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-card w-full max-w-xl h-full shadow-2xl border-l border-border text-foreground flex flex-col overflow-hidden font-mono">
        {/* Top Header */}
        <div className="bg-card border-b border-border px-5 py-3.5 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="font-mono text-xs font-bold py-0 h-5">
                {asset.assetTag}
              </Badge>
              <Badge variant="secondary" className="gap-1 text-[10px] py-0 h-5">
                {getCategoryIcon(asset.category)}
                <span>{asset.category}</span>
              </Badge>
              {asset.importedFromCsv && (
                <Badge variant="outline" className="text-[9px] py-0 h-4 text-muted-foreground">
                  CSV Migrated
                </Badge>
              )}
            </div>
            <h2 className="text-base font-bold text-foreground leading-tight">
              {asset.modelName}
            </h2>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <span>S/N: {asset.serialNumber || "Unassigned"}</span>
              <span>•</span>
              <span>PO: {asset.poNumber || "N/A"}</span>
              <span>•</span>
              <span>Vendor: {asset.vendor}</span>
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {onPrintLabel && (
              <Button
                onClick={() => onPrintLabel(asset)}
                variant="outline"
                size="xs"
                className="gap-1 font-mono text-[11px] h-7"
                title="Print physical QR / Barcode asset tag"
              >
                <Printer className="w-3 h-3 text-muted-foreground" />
                <span>Tag Label</span>
              </Button>
            )}

            {onEditAsset && (
              <Button
                onClick={() => onEditAsset(asset)}
                variant="outline"
                size="xs"
                className="gap-1 font-mono text-[11px] h-7"
                title="Edit hardware specs & custody"
              >
                <Edit3 className="w-3 h-3 text-primary" />
                <span>Edit Specs</span>
              </Button>
            )}

            <Button
              onClick={onClose}
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground h-7 w-7"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 5-Stage Interactive Lifecycle Pipeline */}
          <div className="bg-secondary/40 rounded-lg p-3.5 border border-border space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                5-Stage Lifecycle State Machine
              </span>
              <Badge variant="secondary" className="text-[10px] h-4.5 py-0 px-2 font-mono">
                {asset.subStatus}
              </Badge>
            </div>

            {/* Stepper Buttons */}
            <div className="grid grid-cols-5 gap-1 pt-0.5">
              {STAGE_ORDER.map((stg) => {
                const def = LIFECYCLE_STAGES[stg];
                const isActive = asset.stage === stg;
                const isPast = def.stepNumber < currentStep;

                return (
                  <button
                    key={stg}
                    onClick={() => onOpenTransitionModal(asset, stg)}
                    className={`p-1.5 rounded-md border text-left transition-all ${
                      isActive
                        ? "bg-primary text-primary-foreground border-primary font-bold shadow-xs"
                        : isPast
                        ? "bg-secondary text-foreground border-border hover:bg-secondary/80"
                        : "bg-card text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground"
                    }`}
                  >
                    <div className="text-[9px] opacity-75 font-mono">
                      0{def.stepNumber}
                    </div>
                    <div className="text-[10px] font-bold truncate mt-0.5">
                      {def.shortLabel}
                    </div>
                    <div className="text-[8px] mt-0.5 truncate opacity-70">
                      {isActive ? "Current" : "Move →"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Physical Barcode & QR Asset Tag Card */}
          <div className="bg-white text-slate-900 border border-slate-300 rounded-lg p-3 shadow-xs font-mono space-y-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Tag className="w-3 h-3 text-slate-700" />
                Physical Label (Scannable Tag)
              </span>
              {onPrintLabel && (
                <button
                  type="button"
                  onClick={() => onPrintLabel(asset)}
                  className="text-[10px] font-bold text-slate-700 hover:text-slate-900 flex items-center gap-1 hover:underline"
                >
                  <Printer className="w-2.5 h-2.5" />
                  <span>Print Tag</span>
                </button>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5 flex-1 min-w-0">
                <div className="text-base font-black text-slate-950 tracking-tight">
                  {asset.assetTag}
                </div>
                <div className="text-[11px] font-bold text-slate-800 truncate">
                  {asset.modelName}
                </div>
                <div className="text-[10px] text-slate-600">
                  S/N: {asset.serialNumber || "None"} • Custodian: {asset.assignedTo || "IT Stock"}
                </div>
              </div>

              <div
                className="shrink-0 p-1 border border-slate-300 rounded bg-white flex items-center justify-center"
                dangerouslySetInnerHTML={{
                  __html: generateQrCodeSvg(asset.assetTag, {
                    size: 64,
                    color: "#0f172a",
                    bgColor: "#ffffff",
                    quietZone: 2,
                  }),
                }}
              />
            </div>

            <div
              className="pt-1 flex justify-center"
              dangerouslySetInnerHTML={{
                __html: generateBarcodeSvg(asset.assetTag, {
                  height: 24,
                  barWidth: 1.2,
                  showText: false,
                  color: "#0f172a",
                }),
              }}
            />
          </div>

          {/* Redundancy / Idle Stock Warning */}
          {asset.redundancyMessage && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-200 space-y-1">
                <div className="font-bold text-xs text-amber-300">
                  Redundant Hardware Alert
                </div>
                <p className="text-[11px] text-muted-foreground">{asset.redundancyMessage}</p>
                {asset.isUnusedStock && (
                  <Button
                    onClick={() => onOpenTransitionModal(asset, "deployment")}
                    size="xs"
                    variant="outline"
                    className="border-amber-500/40 text-amber-300 hover:bg-amber-500/20 font-mono gap-1"
                  >
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>Deploy Unit Now</span>
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Spreadsheet Anomaly / Ghost Resolver Form */}
          {asset.isGhostOrUnconfirmed && (
            <form
              onSubmit={handleQuickVerify}
              className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3.5 space-y-2.5"
            >
              <div className="flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-rose-300">
                    Unconfirmed / Spreadsheet Anomaly (${asset.purchaseCost.toLocaleString()} at risk)
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {asset.anomalyNote ||
                      `Status (${asset.verificationStatus}) has not been physically verified recently.`}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground mb-1">
                    Confirmed Custodian
                  </label>
                  <Input
                    type="text"
                    value={verifyAssignedTo}
                    onChange={(e) => setVerifyAssignedTo(e.target.value)}
                    placeholder="Employee / IT Stock"
                    className="h-7 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground mb-1">
                    Confirmed Location *
                  </label>
                  <Input
                    type="text"
                    required
                    value={verifyLocation}
                    onChange={(e) => setVerifyLocation(e.target.value)}
                    placeholder="HQ Floor 2 / Closet"
                    className="h-7 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground mb-1">
                    Serial Number
                  </label>
                  <Input
                    type="text"
                    value={verifySerial}
                    onChange={(e) => setVerifySerial(e.target.value)}
                    placeholder="Confirm S/N"
                    className="h-7 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  type="submit"
                  disabled={verifying}
                  size="xs"
                  className="bg-rose-600 hover:bg-rose-500 text-white font-mono gap-1"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  <span>
                    {verifying ? "Verifying..." : "Confirm Custody & Clear Anomaly"}
                  </span>
                </Button>
              </div>
            </form>
          )}

          {/* Key Financials & Clock Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-lg border border-border bg-card">
              <div className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                <DollarSign className="w-3 h-3 text-muted-foreground" />
                Original Capex
              </div>
              <div className="text-sm font-bold text-foreground mt-0.5 tabular-nums font-mono">
                ${asset.purchaseCost.toLocaleString()}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {asset.purchaseDate || "No date"}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-border bg-card">
              <div className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                <Clock className="w-3 h-3 text-primary" />
                Book Value (36m)
              </div>
              <div className="text-sm font-bold text-primary mt-0.5 tabular-nums font-mono">
                ${asset.bookValue.toLocaleString()}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Age: {asset.ageMonths} mos
              </div>
            </div>

            <div className="p-3 rounded-lg border border-border bg-card">
              <div className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                <ShieldCheck className="w-3 h-3 text-muted-foreground" />
                Warranty Status
              </div>
              <div
                className={`text-[11px] font-bold mt-0.5 font-mono ${
                  asset.warrantyFlag === "expired"
                    ? "text-rose-400"
                    : asset.warrantyFlag === "expiring_soon"
                    ? "text-amber-400"
                    : "text-emerald-400"
                }`}
              >
                {asset.daysToWarrantyExpiry === null
                  ? "Unset"
                  : asset.daysToWarrantyExpiry < 0
                  ? `Expired (${Math.abs(asset.daysToWarrantyExpiry)}d)`
                  : `${asset.daysToWarrantyExpiry}d left`}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {asset.warrantyExpiryDate || "—"}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-border bg-card">
              <div className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                <Calendar className="w-3 h-3 text-muted-foreground" />
                EOL Clock
              </div>
              <div
                className={`text-[11px] font-bold mt-0.5 font-mono ${
                  asset.eolFlag === "past_eol"
                    ? "text-rose-400"
                    : asset.eolFlag === "approaching_eol"
                    ? "text-purple-400"
                    : "text-foreground"
                }`}
              >
                {asset.daysToEol === null
                  ? "Unset"
                  : asset.daysToEol < 0
                  ? `Past EOL (${Math.abs(asset.daysToEol)}d)`
                  : `${asset.daysToEol}d to EOL`}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {asset.eolDate || "—"}
              </div>
            </div>
          </div>

          {/* Straight-line Depreciation Progress */}
          <div className="p-3 rounded-lg border border-border bg-card space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
              <span>36-Month Straight-Line Depreciation</span>
              <span className="text-foreground font-semibold">{depreciationPct}% Depreciated</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${depreciationPct}%` }}
              />
            </div>
          </div>

          {/* Custody & Stage Specific Metadata */}
          <div className="rounded-lg border border-border p-3.5 space-y-2.5 bg-card">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Custody & Placement
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-start gap-2">
                <div className="p-1.5 rounded-md bg-secondary text-muted-foreground shrink-0">
                  <User className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px]">Assigned Custodian</div>
                  <div className="font-semibold text-foreground text-xs mt-0.5">
                    {asset.assignedTo || "Unassigned (IT Stock)"}
                  </div>
                  {asset.assignedEmail && (
                    <div className="text-muted-foreground text-[10px]">{asset.assignedEmail}</div>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2">
                <div className="p-1.5 rounded-md bg-secondary text-muted-foreground shrink-0">
                  <MapPin className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px]">Department & Location</div>
                  <div className="font-semibold text-foreground text-xs mt-0.5">
                    {asset.department || "Unassigned"}
                  </div>
                  <div className="text-muted-foreground text-[10px]">
                    {asset.location || asset.storageLocation || "HQ"}
                  </div>
                </div>
              </div>
            </div>

            {asset.stage === "maintenance" && (
              <div className="pt-2.5 border-t border-border text-xs space-y-1">
                <div className="font-semibold text-amber-400 flex items-center gap-1.5 text-xs">
                  <Wrench className="w-3.5 h-3.5" /> Active Maintenance Issue:
                </div>
                <p className="text-muted-foreground text-[11px]">{asset.maintenanceIssue}</p>
                <div className="text-muted-foreground text-[10px]">
                  RMA: <strong className="text-foreground">{asset.rmaNumber || "N/A"}</strong> • Total Repair:{" "}
                  <strong className="text-foreground">${asset.repairCostTotal}</strong> • Loaner:{" "}
                  <strong className="text-foreground">{asset.loanerAssetTag || "None"}</strong>
                </div>
              </div>
            )}

            {asset.stage === "optimization" && (
              <div className="pt-2.5 border-t border-border text-xs space-y-1">
                <div className="font-semibold text-purple-400 text-xs">
                  Optimization / Closet Notes:
                </div>
                <p className="text-muted-foreground text-[11px]">{asset.optimizationReason}</p>
                {asset.recommendedAction && (
                  <p className="text-primary font-medium text-[11px]">
                    Action: {asset.recommendedAction}
                  </p>
                )}
              </div>
            )}

            {asset.stage === "decommission" && (
              <div className="pt-2.5 border-t border-border text-xs space-y-1">
                <div className="font-semibold text-muted-foreground text-xs">
                  Decommission & Compliance Record:
                </div>
                <p className="text-muted-foreground text-[11px]">
                  Reason: {asset.decommissionReason} ({asset.decommissionDate})
                </p>
                <p className="text-muted-foreground text-[10px]">
                  Data Wipe Cert: {asset.dataWipeCert || "None"} • Salvage: ${asset.salvageValue}
                </p>
              </div>
            )}
          </div>

          {/* Audit Trail Timeline */}
          <div className="space-y-2">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-primary" />
              Lifecycle Audit Trail ({assetEvents.length})
            </h3>

            <div className="space-y-2">
              {assetEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="p-3 rounded-lg border border-border bg-card/60 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground text-xs">
                      {ev.actionTitle}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {ev.createdAt.slice(0, 10)}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-[11px]">{ev.notes}</p>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
                    <span>By {ev.actor}</span>
                    {ev.costImpact !== 0 && (
                      <span
                        className={`font-semibold ${
                          ev.costImpact < 0
                            ? "text-emerald-400"
                            : "text-foreground"
                        }`}
                      >
                        {ev.costImpact < 0
                          ? `+$${Math.abs(ev.costImpact)} recovered`
                          : `$${ev.costImpact.toLocaleString()} capex`}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Actions Bar */}
        <div className="p-3.5 border-t border-border bg-card flex items-center justify-between">
          <Button
            onClick={async () => {
              await onDeleteAsset(asset.id);
              onClose();
            }}
            variant="ghost"
            size="sm"
            className="text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 gap-1 font-mono text-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </Button>

          <div className="flex items-center gap-1.5">
            {LIFECYCLE_STAGES[asset.stage].allowedNextStages.map((nextStg) => (
              <Button
                key={nextStg}
                onClick={() => onOpenTransitionModal(asset, nextStg)}
                size="sm"
                className="font-mono text-xs gap-1.5"
              >
                <span>Move to {LIFECYCLE_STAGES[nextStg].shortLabel}</span>
                <ArrowRight className="w-3 h-3" />
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
