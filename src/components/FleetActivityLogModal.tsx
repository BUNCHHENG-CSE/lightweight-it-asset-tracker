"use client";

import React, { useState, useMemo } from "react";
import {
  History,
  X,
  Search,
  Filter,
  Download,
  Calendar,
  User,
  DollarSign,
  Tag,
  CheckCircle2,
  Wrench,
  Trash2,
  ShieldCheck,
  PackagePlus,
  ArrowRight,
} from "lucide-react";
import { AssetEnriched, LifecycleEvent, LifecycleStage } from "@/lib/types";
import { LIFECYCLE_STAGES } from "@/lib/lifecycle-machine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface FleetActivityLogModalProps {
  events: LifecycleEvent[];
  assets: AssetEnriched[];
  onClose: () => void;
  onOpenAssetDetail: (assetId: string) => void;
}

export default function FleetActivityLogModal({
  events,
  assets,
  onClose,
  onOpenAssetDetail,
}: FleetActivityLogModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");

  const assetMap = useMemo(() => {
    return new Map<string, AssetEnriched>(assets.map((a) => [a.id, a]));
  }, [assets]);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (stageFilter !== "all" && e.toStage !== stageFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const ast = assetMap.get(e.assetId);
        const hay = `${e.actionTitle} ${e.actor} ${e.notes} ${e.toStage} ${
          ast ? `${ast.assetTag} ${ast.modelName} ${ast.assignedTo}` : ""
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [events, stageFilter, searchQuery, assetMap]);

  const handleExportCsv = () => {
    const headers = [
      "Timestamp",
      "Asset Tag",
      "Hardware Model",
      "From Stage",
      "To Stage",
      "Action",
      "Actor",
      "Cost Impact ($)",
      "Notes",
    ];

    const rows = filteredEvents.map((e) => {
      const ast = assetMap.get(e.assetId);
      return [
        `"${e.createdAt}"`,
        `"${ast?.assetTag || e.assetId}"`,
        `"${(ast?.modelName || "").replace(/"/g, '""')}"`,
        `"${e.fromStage || ""}"`,
        `"${e.toStage}"`,
        `"${e.actionTitle.replace(/"/g, '""')}"`,
        `"${e.actor.replace(/"/g, '""')}"`,
        e.costImpact,
        `"${e.notes.replace(/"/g, '""')}"`,
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Fleet-Activity-Audit-Log-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getStageIcon = (stage: LifecycleStage) => {
    switch (stage) {
      case "procurement":
        return <PackagePlus className="w-3.5 h-3.5 text-sky-400" />;
      case "deployment":
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      case "maintenance":
        return <Wrench className="w-3.5 h-3.5 text-amber-400" />;
      case "optimization":
        return <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />;
      case "decommission":
        return <Trash2 className="w-3.5 h-3.5 text-rose-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-card w-full max-w-4xl max-h-[90vh] rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden font-mono">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <History className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-foreground">
                  Global Fleet Audit Trail & Activity Log
                </h2>
                <Badge variant="outline" className="font-mono text-[10px] py-0 h-4.5">
                  {filteredEvents.length} Events
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Full chronological ledger of all lifecycle transitions, custody verifications, repairs, and decommissions.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleExportCsv}
              variant="outline"
              size="sm"
              className="gap-1.5 font-mono text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </Button>
            <Button
              onClick={onClose}
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="p-3 bg-secondary/20 border-b border-border flex flex-wrap items-center justify-between gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              type="text"
              placeholder="Search actions, asset tags, actors, notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 h-8 text-xs font-mono"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="rounded-md border border-input bg-input/20 px-2 py-1 text-xs font-mono text-foreground focus:outline-none h-8"
            >
              <option value="all">All Stages</option>
              <option value="procurement">Stage 1: Procurement</option>
              <option value="deployment">Stage 2: Deployment</option>
              <option value="maintenance">Stage 3: Maintenance</option>
              <option value="optimization">Stage 4: Optimization</option>
              <option value="decommission">Stage 5: Decommission</option>
            </select>
          </div>
        </div>

        {/* Events Table / List */}
        <div className="overflow-y-auto flex-1 p-4 space-y-2.5 divide-y divide-border/60">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-xs">
              No activity matching your search filters.
            </div>
          ) : (
            filteredEvents.map((evt) => {
              const ast = assetMap.get(evt.assetId);
              const isCostDelta = Number(evt.costImpact) !== 0;

              return (
                <div
                  key={evt.id}
                  className="pt-2.5 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs hover:bg-muted/30 p-2 rounded transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 rounded bg-secondary border border-border mt-0.5">
                      {getStageIcon(evt.toStage)}
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-foreground">
                          {evt.actionTitle}
                        </span>
                        {ast && (
                          <button
                            onClick={() => onOpenAssetDetail(ast.id)}
                            className="font-bold text-primary hover:underline text-[11px] bg-secondary px-1.5 py-0.5 rounded border border-border flex items-center gap-1"
                          >
                            <Tag className="w-2.5 h-2.5" />
                            <span>{ast.assetTag}</span>
                            <span className="text-muted-foreground font-normal">
                              ({ast.modelName.slice(0, 20)})
                            </span>
                          </button>
                        )}
                        <Badge
                          variant="secondary"
                          className="font-mono text-[9px] py-0 h-4"
                        >
                          {LIFECYCLE_STAGES[evt.toStage]?.shortLabel || evt.toStage}
                        </Badge>
                      </div>

                      <div className="text-muted-foreground text-[11px]">
                        {evt.notes}
                      </div>

                      <div className="text-[10px] text-muted-foreground flex items-center gap-2 pt-0.5">
                        <span className="flex items-center gap-1">
                          <User className="w-2.5 h-2.5" />
                          <span>{evt.actor}</span>
                        </span>
                        <span>•</span>
                        <span>{new Date(evt.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {isCostDelta && (
                    <div className="text-right shrink-0">
                      <span
                        className={`font-mono text-xs font-bold ${
                          Number(evt.costImpact) > 0
                            ? "text-rose-400"
                            : "text-emerald-400"
                        }`}
                      >
                        {Number(evt.costImpact) > 0 ? "+" : ""}$
                        {Math.abs(Number(evt.costImpact)).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-card flex items-center justify-between text-xs text-muted-foreground">
          <span>Immutable write-only audit trail</span>
          <Button onClick={onClose} variant="outline" size="sm" className="font-mono text-xs">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
