"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Barcode,
  Boxes,
  Building,
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  DollarSign,
  Download,
  Edit3,
  FileSpreadsheet,
  HardDrive,
  HelpCircle,
  History,
  Kanban,
  Keyboard,
  Laptop,
  Layers,
  MapPin,
  Monitor,
  PackagePlus,
  Printer,
  RefreshCcw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Square,
  Table2,
  Trash2,
  TrendingUp,
  User,
  Wrench,
  X,
} from "lucide-react";
import {
  AssetCategory,
  AssetEnriched,
  AssetUpdatePayload,
  BulkActionPayload,
  LifecycleEvent,
  LifecycleStage,
  MoneyLeaksSummary,
  StageTransitionPayload,
} from "@/lib/types";
import { LIFECYCLE_STAGES, STAGE_ORDER } from "@/lib/lifecycle-machine";
import StageTransitionModal from "./StageTransitionModal";
import AssetDetailDrawer from "./AssetDetailDrawer";
import CsvImportModal from "./CsvImportModal";
import FinanceReportView from "./FinanceReportView";
import PhysicalAuditScannerModal from "./PhysicalAuditScannerModal";
import FleetActivityLogModal from "./FleetActivityLogModal";
import AssetLabelPrintModal from "./AssetLabelPrintModal";
import EditAssetModal from "./EditAssetModal";
import KeyboardShortcutsModal from "./KeyboardShortcutsModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "./ThemeToggle";

type ActiveTab = "kanban" | "table" | "finance";
type LeakFilter =
  | "all"
  | "redundant_unused"
  | "ghost_unconfirmed"
  | "warranty_risk"
  | "eol_risk";

type QuickChip =
  | "all"
  | "audit_needed"
  | "idle_stock"
  | "expiring_60d"
  | "past_eol"
  | "rma_repairs";

type SortField =
  | "tag"
  | "model"
  | "stage"
  | "custodian"
  | "cost"
  | "book"
  | "warranty";
type SortDirection = "asc" | "desc";

export default function LifecycleTrackerApp() {
  const [assets, setAssets] = useState<AssetEnriched[]>([]);
  const [summary, setSummary] = useState<MoneyLeaksSummary | null>(null);
  const [events, setEvents] = useState<LifecycleEvent[]>([]);
  const [sampleCsv, setSampleCsv] = useState<string>("");
  const [dbEngine, setDbEngine] = useState<{
    engine: "postgresql" | "sqlite-fallback";
    orm?: string;
    label: string;
    indexesActive: string[];
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Navigation & Filters
  const [activeTab, setActiveTab] = useState<ActiveTab>("kanban");
  const [leakFilter, setLeakFilter] = useState<LeakFilter>("all");
  const [stageFilter, setStageFilter] = useState<LifecycleStage | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | "all">(
    "all"
  );
  const [quickChip, setQuickChip] = useState<QuickChip>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Table Sorting & Multi-Select
  const [sortField, setSortField] = useState<SortField>("tag");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(
    new Set()
  );

  // Modals & Drawers
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [transitionModalState, setTransitionModalState] = useState<{
    open: boolean;
    mode: "create" | "transition";
    asset?: AssetEnriched | null;
    initialTargetStage?: LifecycleStage;
  }>({ open: false, mode: "create" });
  const [csvModalOpen, setCsvModalOpen] = useState<boolean>(false);
  const [auditScannerOpen, setAuditScannerOpen] = useState<boolean>(false);
  const [activityLogOpen, setActivityLogOpen] = useState<boolean>(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState<boolean>(false);
  const [labelPrintModalState, setLabelPrintModalState] = useState<{
    open: boolean;
    assets: AssetEnriched[];
  }>({ open: false, assets: [] });
  const [editAssetModalState, setEditAssetModalState] = useState<{
    open: boolean;
    asset: AssetEnriched | null;
  }>({ open: false, asset: null });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const fetchWorkspaceData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/assets", { cache: "no-store" });
      const data = await res.json();
      if (data.assets) setAssets(data.assets);
      if (data.summary) setSummary(data.summary);
      if (data.events) setEvents(data.events);
      if (data.sampleCsv) setSampleCsv(data.sampleCsv);
      if (data.dbEngine) setDbEngine(data.dbEngine);
    } catch (err) {
      console.error("Failed to fetch assets:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspaceData();
  }, [fetchWorkspaceData]);

  const selectedAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId) || null,
    [assets, selectedAssetId]
  );

  // Filtered Assets
  const filteredAssets = useMemo(() => {
    return assets.filter((a) => {
      if (stageFilter !== "all" && a.stage !== stageFilter) return false;
      if (categoryFilter !== "all" && a.category !== categoryFilter)
        return false;

      if (quickChip === "audit_needed") {
        if (!a.isGhostOrUnconfirmed) return false;
      } else if (quickChip === "idle_stock") {
        if (!a.isUnusedStock) return false;
      } else if (quickChip === "expiring_60d") {
        if (a.warrantyFlag !== "expiring_soon") return false;
      } else if (quickChip === "past_eol") {
        if (a.eolFlag !== "past_eol" && a.eolFlag !== "approaching_eol")
          return false;
      } else if (quickChip === "rma_repairs") {
        if (a.stage !== "maintenance") return false;
      }

      if (leakFilter === "redundant_unused") {
        if (!a.isRedundantPurchaseFlag && !a.isUnusedStock) return false;
      } else if (leakFilter === "ghost_unconfirmed") {
        if (!a.isGhostOrUnconfirmed) return false;
      } else if (leakFilter === "warranty_risk") {
        if (
          a.stage === "decommission" ||
          (a.warrantyFlag !== "expiring_soon" && a.warrantyFlag !== "expired")
        )
          return false;
      } else if (leakFilter === "eol_risk") {
        if (
          a.stage === "decommission" ||
          (a.eolFlag !== "approaching_eol" && a.eolFlag !== "past_eol")
        )
          return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${a.assetTag} ${a.modelName} ${a.serialNumber} ${a.assignedTo} ${a.department} ${a.location} ${a.poNumber} ${a.subStatus}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [assets, stageFilter, categoryFilter, leakFilter, quickChip, searchQuery]);

  const sortedAndFilteredAssets = useMemo(() => {
    const list = [...filteredAssets];
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "tag":
          cmp = a.assetTag.localeCompare(b.assetTag);
          break;
        case "model":
          cmp = a.modelName.localeCompare(b.modelName);
          break;
        case "stage":
          cmp = a.stage.localeCompare(b.stage);
          break;
        case "custodian":
          cmp = (a.assignedTo || "").localeCompare(b.assignedTo || "");
          break;
        case "cost":
          cmp = Number(a.purchaseCost) - Number(b.purchaseCost);
          break;
        case "book":
          cmp = a.bookValue - b.bookValue;
          break;
        case "warranty":
          cmp =
            (a.daysToWarrantyExpiry ?? 99999) -
            (b.daysToWarrantyExpiry ?? 99999);
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return list;
  }, [filteredAssets, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const toggleSelectAll = () => {
    if (
      selectedAssetIds.size === sortedAndFilteredAssets.length &&
      sortedAndFilteredAssets.length > 0
    ) {
      setSelectedAssetIds(new Set());
    } else {
      setSelectedAssetIds(new Set(sortedAndFilteredAssets.map((a) => a.id)));
    }
  };

  const toggleSelectAsset = (id: string) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        if (e.key === "Escape") {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      if (e.key === "/") {
        e.preventDefault();
        const searchInput = document.getElementById("global-search-input");
        searchInput?.focus();
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        setTransitionModalState({
          open: true,
          mode: "create",
          initialTargetStage: "procurement",
        });
      } else if (e.key.toLowerCase() === "b") {
        e.preventDefault();
        setAuditScannerOpen(true);
      } else if (e.key.toLowerCase() === "l") {
        e.preventDefault();
        setActivityLogOpen(true);
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        setActiveTab((prev) => (prev === "finance" ? "kanban" : "finance"));
      } else if (e.key === "?") {
        e.preventDefault();
        setShortcutsModalOpen(true);
      } else if (e.key === "Escape") {
        setSelectedAssetId(null);
        setTransitionModalState({ open: false, mode: "create" });
        setCsvModalOpen(false);
        setAuditScannerOpen(false);
        setActivityLogOpen(false);
        setLabelPrintModalState({ open: false, assets: [] });
        setEditAssetModalState({ open: false, asset: null });
        setShortcutsModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Handlers
  const handleCreateAsset = async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.assets) {
      setAssets(data.assets);
      setSummary(data.summary);
      setEvents(data.events);
      showToast(
        `Added ${data.created?.assetTag} (${data.created?.modelName}) to ${
          LIFECYCLE_STAGES[data.created?.stage as LifecycleStage]?.shortLabel ||
          "Procurement"
        }`
      );
    }
  };

  const handleTransitionAsset = async (
    assetId: string,
    payload: StageTransitionPayload
  ) => {
    const res = await fetch(`/api/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.assets) {
      setAssets(data.assets);
      setSummary(data.summary);
      setEvents(data.events);
      showToast(
        `Transitioned asset to ${LIFECYCLE_STAGES[payload.targetStage].shortLabel}`
      );
    }
  };

  const handleVerifyCustody = async (
    assetId: string,
    updates: {
      assignedTo?: string;
      location?: string;
      serialNumber?: string;
      resolutionNote?: string;
    }
  ) => {
    const res = await fetch(`/api/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", ...updates }),
    });
    const data = await res.json();
    if (data.assets) {
      setAssets(data.assets);
      setSummary(data.summary);
      setEvents(data.events);
      showToast("Verified custody & resolved spreadsheet anomaly!");
    }
  };

  const handleDeleteAsset = async (assetId: string) => {
    const res = await fetch(`/api/assets/${assetId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (data.assets) {
      setAssets(data.assets);
      setSummary(data.summary);
      setEvents(data.events);
      showToast("Asset record removed.");
    }
  };

  const handleUpdateAssetDetails = async (
    assetId: string,
    updates: AssetUpdatePayload
  ) => {
    const res = await fetch(`/api/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_details", ...updates }),
    });
    const data = await res.json();
    if (data.assets) {
      setAssets(data.assets);
      setSummary(data.summary);
      setEvents(data.events);
      showToast(`Updated specifications for ${updates.modelName || "asset"}.`);
    }
  };

  const handleBulkAction = async (payload: {
    bulkType: "transition" | "verify" | "delete";
    assetIds: string[];
    transitionPayload?: StageTransitionPayload;
    location?: string;
  }) => {
    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk_action", ...payload }),
      });
      const data = await res.json();
      if (data.assets) {
        setAssets(data.assets);
        setSummary(data.summary);
        setEvents(data.events);
        setSelectedAssetIds(new Set());
        showToast(
          `Batch action completed for ${payload.assetIds.length} asset${
            payload.assetIds.length === 1 ? "" : "s"
          }.`
        );
      }
    } catch (err) {
      console.error("Bulk action failed:", err);
      showToast("Bulk operation failed. Check console for details.");
    }
  };

  const handleExportFullFleetCsv = () => {
    if (assets.length === 0) return;
    const headers = [
      "Asset Tag",
      "Serial Number",
      "Hardware Model",
      "Category",
      "Vendor",
      "Lifecycle Stage",
      "Sub-Status",
      "Assigned Custodian",
      "Assigned Email",
      "Department",
      "Location / Desk",
      "Deployed Date",
      "Condition",
      "PO Number",
      "Purchase Cost ($)",
      "Purchase Date",
      "Current Book Value ($)",
      "Age (Months)",
      "Warranty Expiry Date",
      "Warranty Flag",
      "EOL Date",
      "EOL Flag",
      "Maintenance Issue",
      "RMA Number",
      "Total Repair Cost ($)",
      "Warranty Covered",
      "Optimization Reason",
      "Storage Location",
      "Idle Since Date",
      "Decommission Date",
      "Decommission Reason",
      "Data Wipe Cert",
      "Salvage Recovered ($)",
      "Verification Status",
      "Anomaly Note",
      "Last Verified Date",
    ];

    const escapeCell = (val: unknown) => {
      const s = String(val ?? "").replace(/"/g, '""');
      return `"${s}"`;
    };

    const rows = assets.map((a) => [
      a.assetTag,
      a.serialNumber,
      a.modelName,
      a.category,
      a.vendor,
      a.stage,
      a.subStatus,
      a.assignedTo,
      a.assignedEmail,
      a.department,
      a.location,
      a.deployedDate,
      a.condition,
      a.poNumber,
      a.purchaseCost,
      a.purchaseDate,
      a.bookValue,
      a.ageMonths,
      a.warrantyExpiryDate,
      a.warrantyFlag,
      a.eolDate,
      a.eolFlag,
      a.maintenanceIssue,
      a.rmaNumber,
      a.repairCostTotal,
      a.warrantyCovered ? "Yes" : "No",
      a.optimizationReason,
      a.storageLocation,
      a.idleSinceDate,
      a.decommissionDate,
      a.decommissionReason,
      a.dataWipeCert,
      a.salvageValue,
      a.verificationStatus,
      a.anomalyNote,
      a.lastVerifiedDate,
    ]);

    const csvContent = [
      headers.map(escapeCell).join(","),
      ...rows.map((r) => r.map(escapeCell).join(",")),
    ].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Vanguard_Labs_Full_Fleet_Inventory_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Exported full fleet register to CSV.");
  };

  const handleExportFullBackupJson = () => {
    const backupData = {
      workspace: "Spreadsheet Escape IT Asset Lifecycle Tracker",
      exportedAt: new Date().toISOString(),
      fleetCount: assets.length,
      eventsCount: events.length,
      assets,
      events,
      summary,
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `IT_Asset_Tracker_Full_Backup_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Downloaded full JSON database backup file.");
  };

  const handleImportCsv = async (csvText: string) => {
    const res = await fetch("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "import_csv", csvText }),
    });
    const data = await res.json();
    if (data.assets) {
      setAssets(data.assets);
      setSummary(data.summary);
      setEvents(data.events);
      showToast(
        `Migrated ${data.importedCount} assets from spreadsheet CSV!`
      );
    }
  };

  const handleResetDemo = async () => {
    const res = await fetch("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset_demo" }),
    });
    const data = await res.json();
    if (data.assets) {
      setAssets(data.assets);
      setSummary(data.summary);
      setEvents(data.events);
      setLeakFilter("all");
      setStageFilter("all");
      setCategoryFilter("all");
      setSearchQuery("");
      showToast("Reset workspace to initial 185-employee demo dataset.");
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

  const getStageBadgeStyle = (stage: LifecycleStage) => {
    switch (stage) {
      case "procurement":
        return "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20";
      case "deployment":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
      case "maintenance":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
      case "optimization":
        return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
      case "decommission":
        return "bg-muted/40 text-muted-foreground border-border";
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-mono selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-card text-card-foreground px-4 py-3 rounded-lg shadow-2xl border border-border flex items-center gap-3 text-xs font-semibold animate-in slide-in-from-bottom duration-200">
          <div className="p-1 rounded-full bg-emerald-500/20 text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-muted-foreground hover:text-foreground ml-2"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Modern Mission-Control Header */}
      <header className="bg-card/80 backdrop-blur-md border-b border-border sticky top-0 z-30">
        <div className="max-w-[1536px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          {/* Logo & Identity */}
          <div className="flex items-center gap-3.5">
            <div className="relative group">
              <div className="w-9 h-9 rounded-md bg-secondary border border-border flex items-center justify-center font-bold text-primary tracking-tight text-sm shadow-xs">
                <Boxes className="w-4 h-4 text-foreground" />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-sm tracking-tight text-foreground flex items-center gap-2">
                  TCT Asset Tracker
                </h1>
                <Badge variant="outline" className="gap-1 font-mono text-[10px] py-0 h-4.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  5-Stage Lifecycle
                </Badge>
                {dbEngine && (
                  <Badge
                    variant="secondary"
                    title={`${dbEngine.orm || dbEngine.label} • Active Indexes: ${dbEngine.indexesActive.join(", ")}`}
                    className="hidden md:inline-flex gap-1 text-[10px] py-0 h-4.5 font-mono"
                  >
                    <Layers className="w-2.5 h-2.5 text-emerald-500" />
                    {dbEngine.engine === "postgresql"
                      ? (dbEngine.label?.includes("Neon") ? "Prisma + Neon" : "Prisma + PG16")
                      : "Prisma Ready (SQLite)"}
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <span className="text-foreground font-medium">Vanguard Labs</span>
                <span>•</span>
                <span>185 Employees</span>
                <span>•</span>
                <span>Lightweight ITAM</span>
              </p>
            </div>
          </div>

          {/* Top Actions using shadcn Button components */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <Button
              onClick={() =>
                setTransitionModalState({
                  open: true,
                  mode: "create",
                  initialTargetStage: "procurement",
                })
              }
              size="sm"
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-mono shadow-xs h-8 text-xs"
              title="Procure new hardware (Shortcut: N)"
            >
              <PackagePlus className="w-3.5 h-3.5" />
              <span>Procure</span>
            </Button>

            <Button
              onClick={() => setAuditScannerOpen(true)}
              variant="outline"
              size="sm"
              className="gap-1.5 font-mono border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 h-8 text-xs"
              title="Open Barcode & QR Physical Audit Scanner (Shortcut: B)"
            >
              <Barcode className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Audit Scanner</span>
              <kbd className="hidden lg:inline text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                B
              </kbd>
            </Button>

            <Button
              onClick={() => setActivityLogOpen(true)}
              variant="outline"
              size="sm"
              className="gap-1.5 font-mono text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/10 h-8 text-xs"
              title="Global Fleet Audit Trail & Activity Log (Shortcut: L)"
            >
              <History className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Activity Log</span>
              <kbd className="hidden lg:inline text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                L
              </kbd>
            </Button>

            <Button
              onClick={() => setCsvModalOpen(true)}
              variant="outline"
              size="sm"
              className="gap-1.5 font-mono border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 h-8 text-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Migrate CSV</span>
            </Button>

            <Button
              onClick={() =>
                setActiveTab(activeTab === "finance" ? "kanban" : "finance")
              }
              variant={activeTab === "finance" ? "default" : "outline"}
              size="sm"
              className="gap-1.5 font-mono h-8 text-xs"
              title="Toggle Finance Report (Shortcut: F)"
            >
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Finance Report</span>
            </Button>

            {/* Fleet Export Options */}
            <Button
              onClick={handleExportFullFleetCsv}
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground h-8 w-8"
              title="Export complete 35-column fleet register to CSV"
            >
              <Download className="w-3.5 h-3.5" />
            </Button>

            <Button
              onClick={handleResetDemo}
              title="Reset to default seed dataset"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground h-8 w-8"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
            </Button>

            <Button
              onClick={() => setShortcutsModalOpen(true)}
              title="Keyboard Shortcuts (?)"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground h-8 w-8"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </Button>

            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-[1536px] w-full mx-auto px-4 sm:px-6 py-5 flex-1 space-y-5">
        {/* ================================================================= */}
        {/* EXECUTIVE MONEY LEAK & HEALTH RADAR (Clean, Organized HUD)        */}
        {/* ================================================================= */}
        {summary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Leak Card 1: Redundant & Unused Stock */}
            <button
              onClick={() => {
                setLeakFilter(
                  leakFilter === "redundant_unused" ? "all" : "redundant_unused"
                );
                if (activeTab === "finance") setActiveTab("kanban");
              }}
              className={`text-left p-3.5 rounded-lg border transition-all duration-150 relative group ${
                leakFilter === "redundant_unused"
                  ? "bg-card border-amber-500/80 ring-2 ring-amber-500/30 shadow-xs"
                  : "bg-card/70 hover:bg-card border-border hover:border-amber-500/40"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Redundant & Idle
                </span>
                <span className="p-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <AlertTriangle className="w-3 h-3" />
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-foreground tabular-nums tracking-tight font-mono">
                  ${summary.totalUnusedCapitalValue.toLocaleString()}
                </span>
                <Badge variant="outline" className="border-amber-500/30 text-amber-300 font-mono text-[10px] h-4.5 py-0">
                  {summary.totalUnusedStockCount} idle
                </Badge>
              </div>

              <div className="mt-2 text-[11px] text-muted-foreground font-mono">
                {summary.avoidablePendingOrderValue > 0 ? (
                  <span className="text-amber-300 font-medium">
                    +${summary.avoidablePendingOrderValue.toLocaleString()} duplicate PO alert
                  </span>
                ) : (
                  <span>Ready in closet / Optimization</span>
                )}
              </div>

              {leakFilter === "redundant_unused" && (
                <div className="mt-1.5 text-[9px] font-bold text-amber-400 uppercase tracking-wider">
                  Active Filter • Click to clear
                </div>
              )}
            </button>

            {/* Leak Card 2: Ghost & Contradictory Records */}
            <button
              onClick={() => {
                setLeakFilter(
                  leakFilter === "ghost_unconfirmed" ? "all" : "ghost_unconfirmed"
                );
                if (activeTab === "finance") setActiveTab("kanban");
              }}
              className={`text-left p-3.5 rounded-lg border transition-all duration-150 relative group ${
                leakFilter === "ghost_unconfirmed"
                  ? "bg-card border-rose-500/80 ring-2 ring-rose-500/30 shadow-xs"
                  : "bg-card/70 hover:bg-card border-border hover:border-rose-500/40"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  Ghost & Spreadsheet
                </span>
                <span className="p-1 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <ShieldAlert className="w-3 h-3" />
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-foreground tabular-nums tracking-tight font-mono">
                  ${summary.unconfirmedAssetsValue.toLocaleString()}
                </span>
                <Badge variant="outline" className="border-rose-500/30 text-rose-300 font-mono text-[10px] h-4.5 py-0">
                  {summary.unconfirmedAssetsCount} unverified
                </Badge>
              </div>

              <div className="mt-2 text-[11px] text-muted-foreground font-mono flex items-center gap-1.5">
                <span>{summary.contradictoryCount} contradictory</span>
                <span>•</span>
                <span>{summary.unlocatedCount} unlocated</span>
              </div>

              {leakFilter === "ghost_unconfirmed" && (
                <div className="mt-1.5 text-[9px] font-bold text-rose-400 uppercase tracking-wider">
                  Active Filter • Click to clear
                </div>
              )}
            </button>

            {/* Leak Card 3: Warranty Expiry */}
            <button
              onClick={() => {
                setLeakFilter(
                  leakFilter === "warranty_risk" ? "all" : "warranty_risk"
                );
                if (activeTab === "finance") setActiveTab("kanban");
              }}
              className={`text-left p-3.5 rounded-lg border transition-all duration-150 relative group ${
                leakFilter === "warranty_risk"
                  ? "bg-card border-indigo-500/80 ring-2 ring-indigo-500/30 shadow-xs"
                  : "bg-card/70 hover:bg-card border-border hover:border-indigo-500/40"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  Warranty Radar
                </span>
                <span className="p-1 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Wrench className="w-3 h-3" />
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-foreground tabular-nums tracking-tight font-mono">
                  {summary.warrantyExpiringSoonCount}
                </span>
                <span className="text-xs text-muted-foreground">expiring (&le;60d)</span>
                <Badge variant="outline" className="border-indigo-500/30 text-indigo-300 font-mono text-[10px] h-4.5 py-0">
                  {summary.warrantyExpiredActiveCount} expired
                </Badge>
              </div>

              <div className="mt-2 text-[11px] text-muted-foreground font-mono">
                <span>RMA claims • ${summary.totalRepairSpend} repair spend</span>
              </div>

              {leakFilter === "warranty_risk" && (
                <div className="mt-1.5 text-[9px] font-bold text-indigo-400 uppercase tracking-wider">
                  Active Filter • Click to clear
                </div>
              )}
            </button>

            {/* Leak Card 4: End-of-Life Horizon */}
            <button
              onClick={() => {
                setLeakFilter(leakFilter === "eol_risk" ? "all" : "eol_risk");
                if (activeTab === "finance") setActiveTab("kanban");
              }}
              className={`text-left p-3.5 rounded-lg border transition-all duration-150 relative group ${
                leakFilter === "eol_risk"
                  ? "bg-card border-purple-500/80 ring-2 ring-purple-500/30 shadow-xs"
                  : "bg-card/70 hover:bg-card border-border hover:border-purple-500/40"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                  EOL Capex
                </span>
                <span className="p-1 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <CalendarClock className="w-3 h-3" />
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-foreground tabular-nums tracking-tight font-mono">
                  {summary.approachingEolCount + summary.pastEolActiveCount}
                </span>
                <span className="text-xs text-muted-foreground">units</span>
                <Badge variant="outline" className="border-purple-500/30 text-purple-300 font-mono text-[10px] h-4.5 py-0">
                  ${summary.upcomingEolReplacementCapex.toLocaleString()}
                </Badge>
              </div>

              <div className="mt-2 text-[11px] text-muted-foreground font-mono">
                <span>{summary.pastEolActiveCount} past 36m • {summary.approachingEolCount} &le;90d</span>
              </div>

              {leakFilter === "eol_risk" && (
                <div className="mt-1.5 text-[9px] font-bold text-purple-400 uppercase tracking-wider">
                  Active Filter • Click to clear
                </div>
              )}
            </button>
          </div>
        )}

        {/* ================================================================= */}
        {/* SMART REALLOCATION STRIP (Live Redundancy Alert)                  */}
        {/* ================================================================= */}
        {summary &&
          summary.redundantModelGroups.length > 0 &&
          activeTab !== "finance" && (
            <div className="rounded-lg bg-card/90 border border-amber-500/30 p-3.5 shadow-xs">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 font-mono">
                      Smart Reallocation Radar
                    </div>
                    <div className="text-xs font-semibold text-foreground">
                      Prevent unnecessary purchases: You already own matching units idle in stock
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {summary.redundantModelGroups.map((group) => {
                    const firstUnusedAsset = assets.find(
                      (a) => a.id === group.unusedAssetIds[0]
                    );
                    return (
                      <div
                        key={group.normalizedModelKey}
                        className="flex items-center gap-2.5 bg-secondary/80 px-3 py-1.5 rounded-md border border-border text-xs"
                      >
                        <div>
                          <div className="font-bold text-foreground text-xs">
                            {group.modelName}
                          </div>
                          <div className="text-[10px] text-amber-400 font-mono">
                            <strong>{group.unusedUnitsCount} idle</strong> (${group.unusedCapitalValue.toLocaleString()})
                            {group.inProcurementOrderedCount > 0 && (
                              <span className="text-rose-400 font-bold ml-1">
                                • {group.inProcurementOrderedCount} on PO
                              </span>
                            )}
                          </div>
                        </div>

                        {firstUnusedAsset && (
                          <Button
                            onClick={() =>
                              setTransitionModalState({
                                open: true,
                                mode: "transition",
                                asset: firstUnusedAsset,
                                initialTargetStage: "deployment",
                              })
                            }
                            size="xs"
                            variant="outline"
                            className="font-mono text-amber-300 border-amber-500/40 hover:bg-amber-500/20"
                          >
                            <span>Deploy</span>
                            <ArrowRight className="w-2.5 h-2.5 ml-1" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

        {/* ================================================================= */}
        {/* VIEW SWITCHER & CONTROL BAR                                       */}
        {/* ================================================================= */}
        <div className="bg-card/80 backdrop-blur-md rounded-lg border border-border p-2 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-xs">
          {/* View Tabs */}
          <div className="flex items-center gap-1 bg-secondary/60 p-0.5 rounded-md border border-border w-fit">
            <Button
              onClick={() => setActiveTab("kanban")}
              variant={activeTab === "kanban" ? "default" : "ghost"}
              size="sm"
              className="gap-1.5 font-mono text-xs"
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>5-Stage Board</span>
            </Button>

            <Button
              onClick={() => setActiveTab("table")}
              variant={activeTab === "table" ? "default" : "ghost"}
              size="sm"
              className="gap-1.5 font-mono text-xs"
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Asset Register ({filteredAssets.length})</span>
            </Button>

            <Button
              onClick={() => setActiveTab("finance")}
              variant={activeTab === "finance" ? "default" : "ghost"}
              size="sm"
              className="gap-1.5 font-mono text-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Finance Report</span>
            </Button>
          </div>

          {/* Search & Filters with shadcn Input component */}
          {activeTab !== "finance" && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  id="global-search-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tag, model, custodian... (/)"
                  className="pl-7 pr-6 w-56 font-mono text-xs h-7"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <select
                  value={leakFilter}
                  onChange={(e) => {
                    setLeakFilter(e.target.value as LeakFilter);
                    setQuickChip("all");
                  }}
                  className="rounded-md border border-input bg-input/20 px-2 py-1 text-xs font-mono text-foreground focus:border-ring focus:outline-none h-7"
                >
                  <option value="all">All Leaks ({assets.length})</option>
                  <option value="redundant_unused">⚠️ Idle / Redundant</option>
                  <option value="ghost_unconfirmed">🚨 Ghost / Contradictory</option>
                  <option value="warranty_risk">🛡️ Warranty Expiring</option>
                  <option value="eol_risk">⏳ Approaching / Past EOL</option>
                </select>

                <select
                  value={categoryFilter}
                  onChange={(e) =>
                    setCategoryFilter(e.target.value as AssetCategory | "all")
                  }
                  className="rounded-md border border-input bg-input/20 px-2 py-1 text-xs font-mono text-foreground focus:border-ring focus:outline-none h-7"
                >
                  <option value="all">All Categories</option>
                  <option value="Laptop">Laptops</option>
                  <option value="Monitor">Monitors</option>
                  <option value="Phone / Tablet">Phones / Tablets</option>
                  <option value="Server / Network">Servers / Network</option>
                  <option value="Dock / Peripheral">Docks / Peripherals</option>
                </select>

                {(leakFilter !== "all" ||
                  stageFilter !== "all" ||
                  categoryFilter !== "all" ||
                  quickChip !== "all" ||
                  searchQuery) && (
                  <Button
                    onClick={() => {
                      setLeakFilter("all");
                      setStageFilter("all");
                      setCategoryFilter("all");
                      setQuickChip("all");
                      setSearchQuery("");
                    }}
                    variant="secondary"
                    size="xs"
                    className="font-mono text-xs"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Quick Filter Chips */}
        {activeTab !== "finance" && (
          <div className="flex flex-wrap items-center gap-1.5 px-0.5">
            <span className="text-[10px] uppercase font-bold text-muted-foreground mr-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-primary" />
              <span>Quick Views:</span>
            </span>
            {[
              { id: "all", label: "All Fleet", count: assets.length },
              {
                id: "audit_needed",
                label: "🚨 Needs Custody Audit",
                count: summary?.unconfirmedAssetsCount,
              },
              {
                id: "idle_stock",
                label: "⚠️ Idle Closet Stock",
                count: summary?.totalUnusedStockCount,
              },
              {
                id: "expiring_60d",
                label: "🛡️ Warranty Expiring ≤60d",
                count: summary?.warrantyExpiringSoonCount,
              },
              {
                id: "past_eol",
                label: "⏳ EOL Refresh Horizon",
                count:
                  (summary?.approachingEolCount || 0) +
                  (summary?.pastEolActiveCount || 0),
              },
              {
                id: "rma_repairs",
                label: "⚡ In Maintenance / RMA",
                count: assets.filter((a) => a.stage === "maintenance").length,
              },
            ].map((chip) => {
              const isSelected = quickChip === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => {
                    setQuickChip(chip.id as QuickChip);
                    if (chip.id === "idle_stock")
                      setLeakFilter("redundant_unused");
                    else if (chip.id === "audit_needed")
                      setLeakFilter("ghost_unconfirmed");
                    else if (chip.id === "expiring_60d")
                      setLeakFilter("warranty_risk");
                    else if (chip.id === "past_eol")
                      setLeakFilter("eol_risk");
                    else setLeakFilter("all");
                  }}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full border transition-all flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary font-bold shadow-xs"
                      : "bg-secondary/60 text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground"
                  }`}
                >
                  <span>{chip.label}</span>
                  {chip.count !== undefined && (
                    <span
                      className={`px-1 rounded-full text-[9px] font-bold ${
                        isSelected
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-secondary text-foreground"
                      }`}
                    >
                      {chip.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ================================================================= */}
        {/* VIEW 1: 5-STAGE KANBAN BOARD                                      */}
        {/* ================================================================= */}
        {loading ? (
          <div className="py-24 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-3">
            <div className="w-7 h-7 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            <span className="font-mono text-xs">Loading IT Asset Lifecycle Tracker...</span>
          </div>
        ) : activeTab === "kanban" ? (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-start">
            {STAGE_ORDER.map((stg) => {
              const def = LIFECYCLE_STAGES[stg];
              const stageAssets = filteredAssets.filter((a) => a.stage === stg);
              const stageCost = stageAssets.reduce(
                (sum, a) => sum + (Number(a.purchaseCost) || 0),
                0
              );

              return (
                <div
                  key={stg}
                  className="bg-card/50 rounded-lg border border-border p-2.5 flex flex-col gap-2.5 min-h-[500px]"
                >
                  {/* Column Header */}
                  <div className="px-1 pt-0.5 pb-1 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-bold px-1 py-0.5 rounded bg-secondary text-primary border border-border">
                          0{def.stepNumber}
                        </span>
                        <span className="text-xs font-bold text-foreground">
                          {def.shortLabel}
                        </span>
                      </div>
                      <Badge variant="secondary" className="font-mono text-[10px] h-4.5 py-0 px-1.5">
                        {stageAssets.length}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1 font-mono">
                      <span className="truncate text-muted-foreground/80">{def.tagline}</span>
                      <span className="font-semibold text-foreground shrink-0 tabular-nums">
                        ${stageCost.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Asset Cards */}
                  <div className="space-y-2 flex-1">
                    {stageAssets.length === 0 ? (
                      <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground font-mono">
                        No assets in {def.shortLabel}
                      </div>
                    ) : (
                      stageAssets.map((asset) => {
                        const nextStage =
                          LIFECYCLE_STAGES[asset.stage].allowedNextStages[0];

                        return (
                          <div
                            key={asset.id}
                            onClick={() => setSelectedAssetId(asset.id)}
                            className={`group cursor-pointer rounded-md p-3 border transition-all duration-150 relative space-y-2 ${
                              asset.isGhostOrUnconfirmed
                                ? "bg-card border-rose-500/40 hover:border-rose-400 shadow-xs"
                                : asset.isRedundantPurchaseFlag
                                ? "bg-card border-amber-500/40 hover:border-amber-400 shadow-xs"
                                : "bg-card/90 hover:bg-card border-border hover:border-foreground/30 shadow-xs"
                            }`}
                          >
                            {/* Top Row: Tag, Category, Cost */}
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1.5">
                                <Badge variant="outline" className="font-mono font-bold text-[10px] py-0 h-4.5">
                                  {asset.assetTag}
                                </Badge>
                                <span className="text-muted-foreground" title={asset.category}>
                                  {getCategoryIcon(asset.category)}
                                </span>
                              </div>
                              <span className="text-xs font-bold text-foreground tabular-nums font-mono">
                                ${asset.purchaseCost.toLocaleString()}
                              </span>
                            </div>

                            {/* Hardware Model Name */}
                            <div>
                              <h4 className="text-xs font-bold text-foreground leading-snug group-hover:text-primary transition-colors">
                                {asset.modelName}
                              </h4>
                              <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1 truncate font-mono">
                                {asset.assignedTo ? (
                                  <>
                                    <User className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                                    <span className="truncate">{asset.assignedTo} ({asset.department})</span>
                                  </>
                                ) : (
                                  <>
                                    <MapPin className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                                    <span className="truncate">
                                      {asset.storageLocation || asset.location || asset.subStatus}
                                    </span>
                                  </>
                                )}
                              </p>
                            </div>

                            {/* Clean Status & Warning Badges */}
                            <div className="flex flex-wrap items-center gap-1 pt-0.5">
                              <Badge variant="secondary" className="text-[9px] font-mono h-4 py-0 px-1.5 gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                {asset.subStatus}
                              </Badge>

                              {asset.isRedundantPurchaseFlag && (
                                <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[9px] font-mono h-4 py-0 px-1.5 gap-1">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  {asset.redundantUnusedUnitsForModel} Idle
                                </Badge>
                              )}

                              {asset.isGhostOrUnconfirmed && (
                                <Badge variant="outline" className="border-rose-500/40 text-rose-300 text-[9px] font-mono h-4 py-0 px-1.5 gap-1">
                                  <ShieldAlert className="w-2.5 h-2.5" />
                                  {asset.verificationStatus.replace("_", " ")}
                                </Badge>
                              )}

                              {!asset.isGhostOrUnconfirmed && !asset.isRedundantPurchaseFlag && asset.warrantyFlag === "expiring_soon" && asset.stage !== "decommission" && (
                                <Badge variant="outline" className="border-indigo-500/40 text-indigo-300 text-[9px] font-mono h-4 py-0 px-1.5">
                                  🛡️ {asset.daysToWarrantyExpiry}d
                                </Badge>
                              )}

                              {!asset.isGhostOrUnconfirmed && !asset.isRedundantPurchaseFlag && asset.eolFlag === "approaching_eol" && asset.stage !== "decommission" && (
                                <Badge variant="outline" className="border-purple-500/40 text-purple-300 text-[9px] font-mono h-4 py-0 px-1.5">
                                  ⏳ EOL {asset.daysToEol}d
                                </Badge>
                              )}
                            </div>

                            {/* Card Footer: Book Value & Quick Advance */}
                            {nextStage && (
                              <div
                                className="pt-2 border-t border-border flex items-center justify-between"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="text-[10px] text-muted-foreground tabular-nums font-mono">
                                  Book: ${asset.bookValue.toLocaleString()}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  onClick={() =>
                                    setTransitionModalState({
                                      open: true,
                                      mode: "transition",
                                      asset,
                                      initialTargetStage: nextStage,
                                    })
                                  }
                                  className="h-5 px-1.5 text-[10px] font-mono text-primary hover:text-foreground gap-0.5"
                                >
                                  <span>
                                    {asset.isUnusedStock
                                      ? "Deploy"
                                      : `To ${LIFECYCLE_STAGES[nextStage].shortLabel}`}
                                  </span>
                                  <ArrowRight className="w-2.5 h-2.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : activeTab === "table" ? (
          /* ================================================================= */
          /* VIEW 2: SMART ASSET REGISTER TABLE (With Sorting & Multi-Select)   */
          /* ================================================================= */
          <div className="bg-card/70 rounded-lg border border-border shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-secondary/60 text-muted-foreground border-b border-border font-mono">
                    <th className="py-2.5 px-3 w-9 text-center">
                      <input
                        type="checkbox"
                        checked={
                          selectedAssetIds.size ===
                            sortedAndFilteredAssets.length &&
                          sortedAndFilteredAssets.length > 0
                        }
                        onChange={toggleSelectAll}
                        className="rounded border-input text-primary focus:ring-primary w-3.5 h-3.5 cursor-pointer accent-primary"
                        title="Select All Filtered"
                      />
                    </th>
                    <th
                      onClick={() => handleSort("tag")}
                      className="py-2.5 px-3 font-semibold cursor-pointer hover:text-foreground select-none"
                    >
                      <div className="flex items-center gap-1">
                        <span>Tag & S/N</span>
                        {sortField === "tag" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="w-3 h-3 text-primary" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-primary" />
                          )
                        ) : (
                          <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("model")}
                      className="py-2.5 px-3 font-semibold cursor-pointer hover:text-foreground select-none"
                    >
                      <div className="flex items-center gap-1">
                        <span>Hardware Model</span>
                        {sortField === "model" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="w-3 h-3 text-primary" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-primary" />
                          )
                        ) : (
                          <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("stage")}
                      className="py-2.5 px-3 font-semibold cursor-pointer hover:text-foreground select-none"
                    >
                      <div className="flex items-center gap-1">
                        <span>Lifecycle Stage</span>
                        {sortField === "stage" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="w-3 h-3 text-primary" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-primary" />
                          )
                        ) : (
                          <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("custodian")}
                      className="py-2.5 px-3 font-semibold cursor-pointer hover:text-foreground select-none"
                    >
                      <div className="flex items-center gap-1">
                        <span>Custodian & Dept</span>
                        {sortField === "custodian" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="w-3 h-3 text-primary" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-primary" />
                          )
                        ) : (
                          <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("cost")}
                      className="py-2.5 px-3 font-semibold text-right cursor-pointer hover:text-foreground select-none"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Cost / Book</span>
                        {sortField === "cost" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="w-3 h-3 text-primary" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-primary" />
                          )
                        ) : (
                          <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("warranty")}
                      className="py-2.5 px-3 font-semibold cursor-pointer hover:text-foreground select-none"
                    >
                      <div className="flex items-center gap-1">
                        <span>Warranty & EOL</span>
                        {sortField === "warranty" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="w-3 h-3 text-primary" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-primary" />
                          )
                        ) : (
                          <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />
                        )}
                      </div>
                    </th>
                    <th className="py-2.5 px-3 font-semibold">Verification & Risk</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedAndFilteredAssets.map((asset) => {
                    const nextStage =
                      LIFECYCLE_STAGES[asset.stage].allowedNextStages[0];
                    const isSelected = selectedAssetIds.has(asset.id);

                    return (
                      <tr
                        key={asset.id}
                        onClick={() => setSelectedAssetId(asset.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-primary/10 hover:bg-primary/15"
                            : "hover:bg-muted/40"
                        }`}
                      >
                        <td
                          className="py-2.5 px-3 w-9 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectAsset(asset.id)}
                            className="rounded border-input text-primary focus:ring-primary w-3.5 h-3.5 cursor-pointer accent-primary"
                          />
                        </td>

                        <td className="py-2.5 px-3 font-mono">
                          <div className="font-bold text-foreground">
                            {asset.assetTag}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {asset.serialNumber || "No S/N"}
                          </div>
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="font-bold text-foreground flex items-center gap-1.5">
                            <span className="text-muted-foreground">
                              {getCategoryIcon(asset.category)}
                            </span>
                            <span>{asset.modelName}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {asset.category} • {asset.vendor}
                          </div>
                        </td>

                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[10px] font-bold border ${getStageBadgeStyle(
                              asset.stage
                            )}`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            {LIFECYCLE_STAGES[asset.stage].label}
                          </span>
                          <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                            {asset.subStatus}
                          </div>
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-foreground text-xs">
                            {asset.assignedTo || "Unassigned"}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {asset.department} • {asset.location || asset.storageLocation}
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-right font-mono">
                          <div className="font-bold text-foreground tabular-nums">
                            ${asset.purchaseCost.toLocaleString()}
                          </div>
                          <div className="text-[10px] text-primary tabular-nums font-medium">
                            Book: ${asset.bookValue.toLocaleString()}
                          </div>
                        </td>

                        <td className="py-2.5 px-3 space-y-1 font-mono">
                          <div>
                            {asset.daysToWarrantyExpiry !== null && (
                              <Badge
                                variant="outline"
                                className={`text-[9px] h-4 py-0 px-1.5 ${
                                  asset.warrantyFlag === "expired"
                                    ? "text-muted-foreground"
                                    : asset.warrantyFlag === "expiring_soon"
                                    ? "border-amber-500/40 text-amber-300"
                                    : "border-emerald-500/40 text-emerald-300"
                                }`}
                              >
                                {asset.daysToWarrantyExpiry < 0
                                  ? "Expired"
                                  : `${asset.daysToWarrantyExpiry}d warranty`}
                              </Badge>
                            )}
                          </div>
                          <div>
                            {asset.daysToEol !== null && (
                              <span className="text-[9px] text-muted-foreground">
                                EOL: {asset.daysToEol < 0 ? `Past (${Math.abs(asset.daysToEol)}d)` : `${asset.daysToEol}d`}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-2.5 px-3">
                          {asset.isGhostOrUnconfirmed ? (
                            <Badge variant="outline" className="border-rose-500/40 text-rose-300 text-[10px] font-mono h-5 gap-1">
                              <ShieldAlert className="w-2.5 h-2.5" />
                              <span>{asset.verificationStatus.replace("_", " ")}</span>
                            </Badge>
                          ) : asset.isRedundantPurchaseFlag ? (
                            <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px] font-mono h-5 gap-1">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              <span>{asset.redundantUnusedUnitsForModel} idle</span>
                            </Badge>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-400 font-mono text-[10px]">
                              <ShieldCheck className="w-3 h-3" /> Verified
                            </span>
                          )}
                        </td>

                        <td
                          className="py-2.5 px-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              onClick={() =>
                                setLabelPrintModalState({
                                  open: true,
                                  assets: [asset],
                                })
                              }
                              title="Print QR / Barcode Tag"
                              variant="ghost"
                              size="icon-xs"
                              className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            >
                              <Printer className="w-3 h-3" />
                            </Button>

                            <Button
                              onClick={() =>
                                setEditAssetModalState({
                                  open: true,
                                  asset,
                                })
                              }
                              title="Edit specifications"
                              variant="ghost"
                              size="icon-xs"
                              className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            >
                              <Edit3 className="w-3 h-3" />
                            </Button>

                            {nextStage && (
                              <Button
                                onClick={() =>
                                  setTransitionModalState({
                                    open: true,
                                    mode: "transition",
                                    asset,
                                    initialTargetStage: nextStage,
                                  })
                                }
                                variant="outline"
                                size="xs"
                                className="font-mono text-xs gap-1 h-6 px-2"
                              >
                                <span>{LIFECYCLE_STAGES[nextStage].shortLabel}</span>
                                <ArrowRight className="w-2.5 h-2.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ================================================================= */
          /* VIEW 3: FINANCE LIFECYCLE REPORT & EXPORT                         */
          /* ================================================================= */
          summary && <FinanceReportView assets={assets} summary={summary} />
        )}
      </main>

      {/* Floating Bulk Operations Toolbar */}
      {selectedAssetIds.size > 0 && activeTab === "table" && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-card/95 backdrop-blur-md text-foreground px-4 py-2.5 rounded-xl shadow-2xl border-2 border-primary/50 flex flex-wrap items-center gap-2 animate-in slide-in-from-bottom duration-200 font-mono text-xs">
          <div className="flex items-center gap-2 pr-2.5 border-r border-border">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="font-bold text-foreground">
              {selectedAssetIds.size} Selected
            </span>
          </div>

          <Button
            onClick={() => {
              const selectedAssets = assets.filter((a) =>
                selectedAssetIds.has(a.id)
              );
              setLabelPrintModalState({ open: true, assets: selectedAssets });
            }}
            variant="outline"
            size="xs"
            className="gap-1.5 h-7 font-mono border-primary/40 text-primary hover:bg-primary/10"
          >
            <Printer className="w-3 h-3" />
            <span>Print {selectedAssetIds.size} Labels</span>
          </Button>

          <Button
            onClick={() => {
              handleBulkAction({
                bulkType: "verify",
                assetIds: Array.from(selectedAssetIds),
                location: "HQ - Verified in Bulk",
              });
            }}
            variant="outline"
            size="xs"
            className="gap-1.5 h-7 font-mono border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>Verify Custody</span>
          </Button>

          <Button
            onClick={() => {
              const selectedAssets = assets.filter((a) =>
                selectedAssetIds.has(a.id)
              );
              const headers = [
                "Asset Tag",
                "Serial Number",
                "Model",
                "Category",
                "Stage",
                "Custodian",
                "Cost",
                "Book Value",
              ];
              const rows = selectedAssets.map((a) => [
                a.assetTag,
                `"${a.serialNumber}"`,
                `"${a.modelName}"`,
                a.category,
                a.stage,
                `"${a.assignedTo}"`,
                a.purchaseCost,
                a.bookValue,
              ]);
              const csv = [
                headers.join(","),
                ...rows.map((r) => r.join(",")),
              ].join("\r\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `Selected_Assets_${selectedAssets.length}.csv`;
              link.click();
              URL.revokeObjectURL(url);
              showToast(`Exported ${selectedAssets.length} selected assets.`);
            }}
            variant="outline"
            size="xs"
            className="gap-1.5 h-7 font-mono text-muted-foreground hover:text-foreground"
          >
            <Download className="w-3 h-3" />
            <span>Export Selected</span>
          </Button>

          <Button
            onClick={() => {
              if (
                confirm(
                  `Delete ${selectedAssetIds.size} asset records? This action cannot be undone.`
                )
              ) {
                handleBulkAction({
                  bulkType: "delete",
                  assetIds: Array.from(selectedAssetIds),
                });
              }
            }}
            variant="ghost"
            size="xs"
            className="text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 h-7 font-mono"
          >
            <Trash2 className="w-3 h-3" />
            <span>Delete</span>
          </Button>

          <button
            onClick={() => setSelectedAssetIds(new Set())}
            className="text-muted-foreground hover:text-foreground pl-1.5 text-xs"
            title="Deselect all"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Modals & Drawers */}
      {transitionModalState.open && (
        <StageTransitionModal
          mode={transitionModalState.mode}
          asset={transitionModalState.asset}
          initialTargetStage={transitionModalState.initialTargetStage}
          allAssets={assets}
          onClose={() =>
            setTransitionModalState({ open: false, mode: "create" })
          }
          onCreateAsset={handleCreateAsset}
          onTransitionAsset={handleTransitionAsset}
          onSelectExistingAssetToDeploy={(existingUnused) => {
            setTransitionModalState({
              open: true,
              mode: "transition",
              asset: existingUnused,
              initialTargetStage: "deployment",
            });
          }}
        />
      )}

      {selectedAsset && (
        <AssetDetailDrawer
          asset={selectedAsset}
          events={events}
          onClose={() => setSelectedAssetId(null)}
          onOpenTransitionModal={(ast, targetStage) => {
            setTransitionModalState({
              open: true,
              mode: "transition",
              asset: ast,
              initialTargetStage: targetStage,
            });
          }}
          onVerifyCustody={handleVerifyCustody}
          onDeleteAsset={handleDeleteAsset}
          onEditAsset={(ast) =>
            setEditAssetModalState({ open: true, asset: ast })
          }
          onPrintLabel={(ast) =>
            setLabelPrintModalState({ open: true, assets: [ast] })
          }
        />
      )}

      {csvModalOpen && (
        <CsvImportModal
          sampleCsv={sampleCsv}
          existingAssets={assets}
          onClose={() => setCsvModalOpen(false)}
          onImportCsv={handleImportCsv}
        />
      )}

      {auditScannerOpen && (
        <PhysicalAuditScannerModal
          allAssets={assets}
          onClose={() => setAuditScannerOpen(false)}
          onVerifyAsset={handleVerifyCustody}
          onOpenAssetDetail={(id) => {
            setSelectedAssetId(id);
            setAuditScannerOpen(false);
          }}
        />
      )}

      {activityLogOpen && (
        <FleetActivityLogModal
          events={events}
          assets={assets}
          onClose={() => setActivityLogOpen(false)}
          onOpenAssetDetail={(id) => {
            setSelectedAssetId(id);
            setActivityLogOpen(false);
          }}
        />
      )}

      {labelPrintModalState.open && (
        <AssetLabelPrintModal
          assets={labelPrintModalState.assets}
          onClose={() => setLabelPrintModalState({ open: false, assets: [] })}
        />
      )}

      {editAssetModalState.open && editAssetModalState.asset && (
        <EditAssetModal
          asset={editAssetModalState.asset}
          onClose={() => setEditAssetModalState({ open: false, asset: null })}
          onSave={handleUpdateAssetDetails}
        />
      )}

      {shortcutsModalOpen && (
        <KeyboardShortcutsModal onClose={() => setShortcutsModalOpen(false)} />
      )}
    </div>
  );
}
