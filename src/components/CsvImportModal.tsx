"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { AssetEnriched } from "@/lib/types";
import { parseAndAnalyzeCsv } from "@/lib/csv-importer";
import { LIFECYCLE_STAGES } from "@/lib/lifecycle-machine";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface CsvImportModalProps {
  sampleCsv: string;
  existingAssets: AssetEnriched[];
  onClose: () => void;
  onImportCsv: (csvText: string) => Promise<void>;
}

export default function CsvImportModal({
  sampleCsv,
  existingAssets,
  onClose,
  onImportCsv,
}: CsvImportModalProps) {
  const [csvText, setCsvText] = useState<string>(sampleCsv);
  const [importing, setImporting] = useState(false);

  const previews = useMemo(
    () => parseAndAnalyzeCsv(csvText, existingAssets),
    [csvText, existingAssets]
  );

  const anomalyRowsCount = previews.filter(
    (p) => p.verificationStatus !== "verified"
  ).length;
  const redundantRowsCount = previews.filter(
    (p) => p.redundancyWarning !== null
  ).length;
  const totalImportValue = previews.reduce(
    (sum, p) => sum + (Number(p.purchaseCost) || 0),
    0
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = String(ev.target?.result || "");
      setCsvText(content);
    };
    reader.readAsText(file);
  };

  const handleDownloadSampleCsv = () => {
    const blob = new Blob([sampleCsv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "IT_Inventory_MASTER_Messy_Spreadsheet_Sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirmImport = async () => {
    if (previews.length === 0) return;
    setImporting(true);
    try {
      await onImportCsv(csvText);
      onClose();
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-card rounded-xl shadow-2xl border border-border w-full max-w-5xl overflow-hidden my-6 text-card-foreground">
        {/* Header */}
        <div className="bg-muted/40 border-b border-border px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-mono">
              <FileSpreadsheet className="w-4 h-4" />
              <span>Zero-Re-Entry Spreadsheet Migration</span>
            </div>
            <h2 className="text-lg font-bold text-foreground mt-0.5">
              Migrate from Fragile IT Spreadsheets (Auto-Maps Columns & Flags Contradictions)
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

        <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Upload / Sample Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/30 p-4 rounded-xl border border-border">
            <div className="space-y-0.5">
              <div className="text-sm font-semibold text-foreground">
                Drop or Select Your Existing IT Asset Spreadsheet (.CSV)
              </div>
              <p className="text-xs text-muted-foreground">
                Automatically maps messy column headers, normalizes hardware models, and flags ghost/contradictory rows.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium transition shadow-xs">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload CSV File</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCsvText(sampleCsv)}
                className="gap-1.5 font-mono text-xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>Load Sample Spreadsheet</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadSampleCsv}
                className="gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Sample .CSV</span>
              </Button>
            </div>
          </div>

          {/* Raw CSV Editor (collapsible / editable) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 font-mono">
              Raw CSV Content (Editable Before Import)
            </label>
            <textarea
              rows={5}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="w-full rounded-xl border border-input bg-background p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Paste CSV rows here..."
            />
          </div>

          {/* Pre-Flight Diagnostic Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl border border-border bg-card">
              <div className="text-xs text-muted-foreground">Rows Ready to Migrate</div>
              <div className="text-xl font-bold text-foreground mt-1 tabular-nums">
                {previews.length} assets
              </div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                Zero manual re-entry required
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-border bg-card">
              <div className="text-xs text-muted-foreground">Total Imported Value</div>
              <div className="text-xl font-bold text-foreground mt-1 tabular-nums">
                ${totalImportValue.toLocaleString()}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Auto-mapped to 5 stages
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10">
              <div className="text-xs text-rose-600 dark:text-rose-400 font-semibold">
                Contradictions / Missing Data
              </div>
              <div className="text-xl font-bold text-rose-700 dark:text-rose-200 mt-1 tabular-nums">
                {anomalyRowsCount} flagged
              </div>
              <div className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">
                Tagged for custody verification
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10">
              <div className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
                Duplicate Model Alerts
              </div>
              <div className="text-xl font-bold text-amber-700 dark:text-amber-200 mt-1 tabular-nums">
                {redundantRowsCount} flagged
              </div>
              <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                Matches existing unused stock
              </div>
            </div>
          </div>

          {/* Pre-Flight Preview Table */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono">
              Pre-Flight Lifecycle Mapping & Hygiene Analysis ({previews.length} rows)
            </h3>
            <div className="rounded-xl border border-border overflow-x-auto bg-card">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground border-b border-border">
                    <th className="py-2.5 px-3 font-semibold">Tag</th>
                    <th className="py-2.5 px-3 font-semibold">Model & S/N</th>
                    <th className="py-2.5 px-3 font-semibold">Mapped Stage</th>
                    <th className="py-2.5 px-3 font-semibold">Custodian / Dept</th>
                    <th className="py-2.5 px-3 font-semibold">Cost</th>
                    <th className="py-2.5 px-3 font-semibold">Detected Leaks & Hygiene</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {previews.map((row) => (
                    <tr key={row.rowIndex} className="hover:bg-muted/40 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-foreground">
                        {row.assetTag}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-foreground">
                          {row.modelName}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {row.category} • {row.serialNumber}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant="outline" className="text-[11px] font-mono">
                          {LIFECYCLE_STAGES[row.stage].label}
                        </Badge>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {row.subStatus}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-foreground">
                          {row.assignedTo || "Unassigned"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {row.department} • {row.location}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-foreground tabular-nums">
                        ${row.purchaseCost.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 space-y-1">
                        {row.verificationStatus === "verified" &&
                          !row.redundancyWarning && (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Clean record
                            </span>
                          )}
                        {row.anomalyNote && (
                          <div className="flex items-start gap-1 text-rose-700 dark:text-rose-300 bg-rose-500/15 px-2 py-0.5 rounded-md border border-rose-500/30 text-[11px]">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>{row.anomalyNote}</span>
                          </div>
                        )}
                        {row.redundancyWarning && (
                          <div className="flex items-start gap-1 text-amber-700 dark:text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-md border border-amber-500/30 text-[11px]">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>{row.redundancyWarning}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-border">
            <div className="text-xs text-muted-foreground">
              Contradictory or incomplete rows will be imported with an{" "}
              <strong className="text-rose-600 dark:text-rose-400 font-semibold">Unconfirmed Custody</strong> flag so you can resolve them without losing data.
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
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
                type="button"
                disabled={importing || previews.length === 0}
                onClick={handleConfirmImport}
                size="sm"
                className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs shadow-xs"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>
                  {importing
                    ? "Migrating Spreadsheet..."
                    : `Import ${previews.length} Assets`}
                </span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
