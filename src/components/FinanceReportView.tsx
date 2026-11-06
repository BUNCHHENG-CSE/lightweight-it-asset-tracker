"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  DollarSign,
  Download,
  FileSpreadsheet,
  Layers,
  Printer,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  AssetEnriched,
  LifecycleStage,
  MoneyLeaksSummary,
} from "@/lib/types";
import { LIFECYCLE_STAGES, STAGE_ORDER } from "@/lib/lifecycle-machine";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface FinanceReportViewProps {
  assets: AssetEnriched[];
  summary: MoneyLeaksSummary;
}

export default function FinanceReportView({
  assets,
  summary,
}: FinanceReportViewProps) {
  const [forecastHorizonDays, setForecastHorizonDays] = useState<number>(90);

  // Hardware Refresh & EOL Budget Forecaster
  const refreshForecast = useMemo(() => {
    const eligible = assets.filter((a) => {
      if (a.stage === "decommission") return false;
      if (a.daysToEol === null) return false;
      return a.daysToEol <= forecastHorizonDays;
    });

    const categoryBreakdown = new Map<
      string,
      {
        category: string;
        count: number;
        estimatedCapex: number;
        units: AssetEnriched[];
      }
    >();

    for (const a of eligible) {
      if (!categoryBreakdown.has(a.category)) {
        categoryBreakdown.set(a.category, {
          category: a.category,
          count: 0,
          estimatedCapex: 0,
          units: [],
        });
      }
      const entry = categoryBreakdown.get(a.category)!;
      entry.count += 1;
      const unitCost =
        Number(a.purchaseCost) > 0 ? Number(a.purchaseCost) : 1800;
      entry.estimatedCapex += unitCost;
      entry.units.push(a);
    }

    const totalUnits = eligible.length;
    const totalGrossCapex = Array.from(categoryBreakdown.values()).reduce(
      (sum, e) => sum + e.estimatedCapex,
      0
    );
    const estimatedSalvageRecovery = Math.round(totalGrossCapex * 0.12);
    const netCapexRequired = totalGrossCapex - estimatedSalvageRecovery;

    return {
      totalUnits,
      totalGrossCapex,
      estimatedSalvageRecovery,
      netCapexRequired,
      categories: Array.from(categoryBreakdown.values()).sort(
        (a, b) => b.estimatedCapex - a.estimatedCapex
      ),
      eligibleAssets: eligible,
    };
  }, [assets, forecastHorizonDays]);
  // Group by Department for Finance Chargeback
  const departmentRows = useMemo(() => {
    const map = new Map<
      string,
      {
        department: string;
        totalUnits: number;
        activeUnits: number;
        idleUnits: number;
        purchaseCapex: number;
        bookValue: number;
        repairSpend: number;
        salvageRecovered: number;
        unconfirmedRiskValue: number;
      }
    >();

    for (const a of assets) {
      const dept = a.department || "Unassigned (IT Stock)";
      if (!map.has(dept)) {
        map.set(dept, {
          department: dept,
          totalUnits: 0,
          activeUnits: 0,
          idleUnits: 0,
          purchaseCapex: 0,
          bookValue: 0,
          repairSpend: 0,
          salvageRecovered: 0,
          unconfirmedRiskValue: 0,
        });
      }
      const row = map.get(dept)!;
      row.totalUnits += 1;
      if (a.stage === "deployment") row.activeUnits += 1;
      if (a.isUnusedStock) row.idleUnits += 1;
      row.purchaseCapex += Number(a.purchaseCost) || 0;
      row.bookValue += a.bookValue;
      row.repairSpend += Number(a.repairCostTotal) || 0;
      row.salvageRecovered += Number(a.salvageValue) || 0;
      if (a.isGhostOrUnconfirmed) {
        row.unconfirmedRiskValue += Number(a.purchaseCost) || 0;
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => b.purchaseCapex - a.purchaseCapex
    );
  }, [assets]);

  // Group by Lifecycle Stage
  const stageBreakdown = useMemo(() => {
    return STAGE_ORDER.map((stg: LifecycleStage) => {
      const matching = assets.filter((a) => a.stage === stg);
      const purchaseValue = matching.reduce(
        (sum, a) => sum + (Number(a.purchaseCost) || 0),
        0
      );
      const bookValue = matching.reduce((sum, a) => sum + a.bookValue, 0);
      const pctOfTotal = summary.totalFleetPurchaseValue > 0
        ? Math.round((purchaseValue / summary.totalFleetPurchaseValue) * 100)
        : 0;

      return {
        stage: stg,
        label: LIFECYCLE_STAGES[stg].label,
        tagline: LIFECYCLE_STAGES[stg].tagline,
        count: matching.length,
        purchaseValue,
        bookValue,
        pctOfTotal,
      };
    });
  }, [assets, summary.totalFleetPurchaseValue]);

  const escapeCsvCell = (val: unknown): string => {
    const str = String(val ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Export 1: Full Asset Lifecycle Register for Finance (CSV)
  const handleExportFullRegisterCsv = () => {
    const headers = [
      "Asset Tag",
      "Model Name",
      "Category",
      "Serial Number",
      "Lifecycle Stage",
      "Sub-Status",
      "Department",
      "Assigned Custodian",
      "Location",
      "Purchase Date",
      "PO Number",
      "Original Cost ($)",
      "Depreciated Book Value ($)",
      "Age (Months)",
      "Repair Spend ($)",
      "Salvage Recovered ($)",
      "Warranty Expiry",
      "Warranty Status",
      "Target EOL Date",
      "EOL Status",
      "Data Wipe Certificate",
      "Verification Status",
      "Money Leak / Anomaly Note",
    ];

    const rows = assets.map((a) => [
      a.assetTag,
      a.modelName,
      a.category,
      a.serialNumber,
      LIFECYCLE_STAGES[a.stage].shortLabel,
      a.subStatus,
      a.department,
      a.assignedTo || "Unassigned",
      a.location || a.storageLocation,
      a.purchaseDate,
      a.poNumber,
      a.purchaseCost,
      a.bookValue,
      a.ageMonths,
      a.repairCostTotal,
      a.salvageValue,
      a.warrantyExpiryDate,
      a.warrantyFlag,
      a.eolDate,
      a.eolFlag,
      a.dataWipeCert,
      a.verificationStatus,
      a.redundancyMessage || a.anomalyNote || "",
    ]);

    const csvContent = [
      headers.map(escapeCsvCell).join(","),
      ...rows.map((r) => r.map(escapeCsvCell).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Finance_IT_Asset_Lifecycle_Report_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export 2: Department Chargeback & Capex Summary for Finance (CSV)
  const handleExportDepartmentSummaryCsv = () => {
    const headers = [
      "Department",
      "Total Units",
      "Active Deployed Units",
      "Idle / Reclaimable Units",
      "Original Purchase Capex ($)",
      "Current Depreciated Book Value ($)",
      "Out-of-Pocket Repair Spend ($)",
      "Decommission Salvage Recovered ($)",
      "Unconfirmed / Ghost Asset Risk ($)",
    ];

    const rows = departmentRows.map((d) => [
      d.department,
      d.totalUnits,
      d.activeUnits,
      d.idleUnits,
      d.purchaseCapex,
      d.bookValue,
      d.repairSpend,
      d.salvageRecovered,
      d.unconfirmedRiskValue,
    ]);

    const csvContent = [
      headers.map(escapeCsvCell).join(","),
      ...rows.map((r) => r.map(escapeCsvCell).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Finance_Department_Chargeback_Summary_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportRefreshForecastCsv = () => {
    const headers = [
      "Asset Tag",
      "Model Name",
      "Category",
      "Current Stage",
      "Department",
      "Custodian",
      "EOL Date",
      "Days To EOL",
      "Original Purchase Cost ($)",
      "Estimated Replacement Capex ($)",
    ];

    const rows = refreshForecast.eligibleAssets.map((a) => [
      a.assetTag,
      a.modelName,
      a.category,
      a.stage,
      a.department,
      a.assignedTo || "Unassigned",
      a.eolDate,
      a.daysToEol,
      a.purchaseCost,
      Number(a.purchaseCost) > 0 ? Number(a.purchaseCost) : 1800,
    ]);

    const csvContent = [
      headers.map(escapeCsvCell).join(","),
      ...rows.map((r) => r.map(escapeCsvCell).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Hardware_Refresh_Capex_Forecast_${forecastHorizonDays}d_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const currentTier =
    summary.totalAssetsCount <= 300
      ? {
          name: "Growth Tier (Up to 300 Assets)",
          price: "$99/mo",
          range: "$79–$149/month",
          annualCost: 1188,
        }
      : {
          name: "Scale Tier (Up to 1,000 Assets)",
          price: "$249/mo",
          range: "$199–$299/month",
          annualCost: 2988,
        };

  const roiMultiple = Math.max(
    1,
    Math.round(summary.totalMoneyLeaksExposed / currentTier.annualCost)
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-150 font-mono">
      {/* Top Modern Export & Financial Intelligence Banner */}
      <div className="rounded-lg bg-card border border-border p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 shadow-xs">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
            <FileSpreadsheet className="w-4 h-4" />
            <span>CFO & Finance Lifecycle Schedule</span>
          </div>
          <h2 className="text-base font-bold text-foreground mt-1 tracking-tight">
            Fleet Valuation, Depreciation Book Value & Exposed Money Leaks
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl leading-relaxed">
            Audit-ready CSV schedules without fragile VLOOKUP spreadsheets. Includes 36-month straight-line depreciation, NIST wipe certificates, and avoidable duplicate capex analysis.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            onClick={handleExportFullRegisterCsv}
            size="sm"
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-mono"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Full Register (.CSV)</span>
          </Button>

          <Button
            onClick={handleExportDepartmentSummaryCsv}
            variant="outline"
            size="sm"
            className="gap-1.5 font-mono"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Dept Chargeback (.CSV)</span>
          </Button>

          <Button
            onClick={() => window.print()}
            variant="ghost"
            size="sm"
            className="gap-1.5 font-mono text-muted-foreground"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / PDF</span>
          </Button>
        </div>
      </div>

      {/* Finance KPI Glass Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* KPI 1 */}
        <div className="bg-card rounded-lg p-3.5 border border-border shadow-xs">
          <div className="text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
            <span>Gross Fleet Capex</span>
            <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <div className="text-xl font-bold text-foreground mt-1 tabular-nums">
            ${summary.totalFleetPurchaseValue.toLocaleString()}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Across {summary.totalAssetsCount} tracked hardware units
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-card rounded-lg p-3.5 border border-border shadow-xs">
          <div className="text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
            <span>Net Book Value (36m)</span>
            <TrendingDown className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="text-xl font-bold text-primary mt-1 tabular-nums">
            ${summary.totalCurrentBookValue.toLocaleString()}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Straight-line depreciated
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-card rounded-lg p-3.5 border border-amber-500/30 shadow-xs">
          <div className="text-[11px] font-semibold text-amber-400 flex items-center justify-between">
            <span>Idle Stock</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="text-xl font-bold text-amber-300 mt-1 tabular-nums">
            ${summary.totalUnusedCapitalValue.toLocaleString()}
          </div>
          <div className="text-[10px] text-amber-400/80 mt-0.5">
            {summary.totalUnusedStockCount} unused units ready
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-card rounded-lg p-3.5 border border-rose-500/30 shadow-xs">
          <div className="text-[11px] font-semibold text-rose-400 flex items-center justify-between">
            <span>Ghost & Risk Value</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
          </div>
          <div className="text-xl font-bold text-rose-300 mt-1 tabular-nums">
            ${summary.unconfirmedAssetsValue.toLocaleString()}
          </div>
          <div className="text-[10px] text-rose-400/80 mt-0.5">
            {summary.unconfirmedAssetsCount} records unverified
          </div>
        </div>

        {/* KPI 5 */}
        <div className="bg-card rounded-lg p-3.5 border border-emerald-500/30 shadow-xs">
          <div className="text-[11px] font-semibold text-emerald-400 flex items-center justify-between">
            <span>Salvage vs Repair</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-emerald-300 mt-1 tabular-nums">
            +${summary.totalSalvageRecovered.toLocaleString()}
            <span className="text-[11px] font-normal text-rose-400 ml-1">
              /-${summary.totalRepairSpend}
            </span>
          </div>
          <div className="text-[10px] text-emerald-400/80 mt-0.5">
            Buyback salvage vs repair spend
          </div>
        </div>
      </div>

      {/* Business Case & Validation Card */}
      <div className="rounded-lg border border-border bg-card p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1 max-w-3xl">
          <Badge variant="outline" className="text-[10px] font-mono h-4.5 py-0">
            ROI & Business Case Validator
          </Badge>
          <h3 className="text-sm font-bold text-foreground">
            &ldquo;What is the total purchase value of assets you cannot currently locate or confirm the status of?&rdquo;
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            In this workspace, there is currently{" "}
            <strong className="text-rose-400 font-mono">
              ${summary.unconfirmedAssetsValue.toLocaleString()}
            </strong>{" "}
            in unconfirmed/contradictory spreadsheet records,{" "}
            <strong className="text-amber-300 font-mono">
              ${summary.totalUnusedCapitalValue.toLocaleString()}
            </strong>{" "}
            in unused stock, and{" "}
            <strong className="text-amber-400 font-mono">
              ${summary.avoidablePendingOrderValue.toLocaleString()}
            </strong>{" "}
            in avoidable duplicate purchase orders — totaling{" "}
            <strong className="text-foreground underline font-bold font-mono">
              ${summary.totalMoneyLeaksExposed.toLocaleString()} in exposed money leaks
            </strong>
            . Stopping just <strong>one</strong> redundant MacBook purchase pays for{" "}
            <strong>16+ months</strong> of this tracker.
          </p>
        </div>

        <div className="bg-secondary/60 rounded-lg p-3.5 border border-border shrink-0 min-w-[240px]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-primary">
            {currentTier.name}
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-xl font-bold text-foreground tabular-nums">
              {currentTier.price}
            </span>
            <span className="text-[11px] text-muted-foreground">
              ({currentTier.range})
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-xs">
            <span className="text-muted-foreground text-[11px]">Annualized ROI:</span>
            <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 text-[10px] font-mono">
              {roiMultiple}x Return
            </Badge>
          </div>
        </div>
      </div>

      {/* Interactive Hardware Refresh & EOL Budget Forecaster */}
      <div className="bg-card rounded-lg border border-border p-4 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-bold text-foreground">
                Hardware Refresh & EOL Budget Forecaster
              </h3>
              <Badge
                variant="outline"
                className="border-purple-500/40 text-purple-300 font-mono text-[10px] py-0 h-4.5"
              >
                CFO / Budget Planning
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Simulate Capex budget required for upcoming device retirements and 36-month refresh cycles.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-secondary/80 rounded-md p-0.5 border border-border text-xs">
              {[
                { label: "90 Days (Q1)", val: 90 },
                { label: "180 Days (H1)", val: 180 },
                { label: "365 Days (1 Yr)", val: 365 },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setForecastHorizonDays(opt.val)}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                    forecastHorizonDays === opt.val
                      ? "bg-primary text-primary-foreground font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <Button
              onClick={handleExportRefreshForecastCsv}
              variant="outline"
              size="sm"
              className="font-mono text-xs gap-1 border-purple-500/40 text-purple-400 hover:bg-purple-500/10"
            >
              <Download className="w-3 h-3" />
              <span>Export Plan</span>
            </Button>
          </div>
        </div>

        {/* Forecast Summary Numbers */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="bg-secondary/40 p-3 rounded-lg border border-border">
            <span className="text-[10px] uppercase font-bold text-muted-foreground">
              Units Up For Refresh
            </span>
            <div className="text-xl font-bold text-foreground mt-0.5 tabular-nums">
              {refreshForecast.totalUnits}{" "}
              <span className="text-xs text-muted-foreground font-normal">
                devices
              </span>
            </div>
            <div className="text-[10px] text-purple-400 mt-0.5">
              Within next {forecastHorizonDays} days
            </div>
          </div>

          <div className="bg-secondary/40 p-3 rounded-lg border border-border">
            <span className="text-[10px] uppercase font-bold text-muted-foreground">
              Gross Capex Estimate
            </span>
            <div className="text-xl font-bold text-foreground mt-0.5 tabular-nums">
              ${refreshForecast.totalGrossCapex.toLocaleString()}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Based on model purchase specs
            </div>
          </div>

          <div className="bg-secondary/40 p-3 rounded-lg border border-border">
            <span className="text-[10px] uppercase font-bold text-emerald-400">
              Est. Buyback Salvage (12%)
            </span>
            <div className="text-xl font-bold text-emerald-400 mt-0.5 tabular-nums">
              -${refreshForecast.estimatedSalvageRecovery.toLocaleString()}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Enterprise hardware recovery
            </div>
          </div>

          <div className="bg-secondary/40 p-3 rounded-lg border border-primary/30 bg-primary/5">
            <span className="text-[10px] uppercase font-bold text-primary">
              Net Capex Approval Needed
            </span>
            <div className="text-xl font-bold text-foreground mt-0.5 tabular-nums">
              ${refreshForecast.netCapexRequired.toLocaleString()}
            </div>
            <div className="text-[10px] text-primary font-medium mt-0.5">
              Net budget for Finance signoff
            </div>
          </div>
        </div>

        {/* Category Breakdown Chips */}
        {refreshForecast.categories.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-muted-foreground font-medium">
              By Hardware Type:
            </span>
            {refreshForecast.categories.map((cat) => (
              <Badge
                key={cat.category}
                variant="secondary"
                className="font-mono text-xs py-1 px-2.5 gap-1.5 border border-border"
              >
                <span className="font-bold text-foreground">
                  {cat.category}:
                </span>
                <span className="text-purple-400">{cat.count} units</span>
                <span className="text-muted-foreground font-normal">
                  (${cat.estimatedCapex.toLocaleString()})
                </span>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Two Tables: 5-Stage Valuation & Department Chargeback */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* 5-Stage Valuation Breakdown */}
        <div className="lg:col-span-5 bg-card rounded-lg border border-border p-4 shadow-xs space-y-3">
          <div>
            <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
              <Layers className="w-3.5 h-3.5 text-primary" />
              <span>Valuation by Lifecycle Stage</span>
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Capital distribution across the 5 stages
            </p>
          </div>

          <div className="space-y-2">
            {stageBreakdown.map((item) => (
              <div
                key={item.stage}
                className="p-3 rounded-md border border-border bg-secondary/30 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <span>{item.label}</span>
                      <Badge variant="secondary" className="text-[9px] h-4 py-0 px-1 font-mono">
                        {item.count} units
                      </Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {item.tagline}
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <div className="text-xs font-bold text-foreground tabular-nums">
                      ${item.purchaseValue.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-primary font-medium tabular-nums">
                      ${item.bookValue.toLocaleString()} book
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${item.pctOfTotal}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Department Chargeback Table */}
        <div className="lg:col-span-7 bg-card rounded-lg border border-border p-4 shadow-xs space-y-3">
          <div>
            <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
              <Building2 className="w-3.5 h-3.5 text-primary" />
              <span>Department Chargeback & Risk Allocation</span>
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Ready for monthly Finance journal entry & audits
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground bg-secondary/40 font-mono text-[10px]">
                  <th className="py-2 px-2.5 font-semibold">Department</th>
                  <th className="py-2 px-2.5 font-semibold text-center">
                    Units (Active/Idle)
                  </th>
                  <th className="py-2 px-2.5 font-semibold text-right">
                    Cost
                  </th>
                  <th className="py-2 px-2.5 font-semibold text-right">
                    Book
                  </th>
                  <th className="py-2 px-2.5 font-semibold text-right">
                    Risk
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {departmentRows.map((row) => (
                  <tr key={row.department} className="hover:bg-muted/40 transition-colors font-mono text-[11px]">
                    <td className="py-2 px-2.5 font-semibold text-foreground">
                      {row.department}
                    </td>
                    <td className="py-2 px-2.5 text-center">
                      <span className="font-bold text-foreground">
                        {row.totalUnits}
                      </span>{" "}
                      <span className="text-muted-foreground text-[10px]">
                        ({row.activeUnits}/{row.idleUnits})
                      </span>
                    </td>
                    <td className="py-2 px-2.5 text-right font-semibold text-foreground tabular-nums">
                      ${row.purchaseCapex.toLocaleString()}
                    </td>
                    <td className="py-2 px-2.5 text-right font-semibold text-primary tabular-nums">
                      ${row.bookValue.toLocaleString()}
                    </td>
                    <td className="py-2 px-2.5 text-right">
                      {row.unconfirmedRiskValue > 0 ? (
                        <Badge variant="outline" className="border-rose-500/40 text-rose-300 font-mono text-[10px] h-4 py-0">
                          ${row.unconfirmedRiskValue.toLocaleString()}
                        </Badge>
                      ) : (
                        <span className="text-emerald-400 text-[10px] font-mono">
                          $0
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
