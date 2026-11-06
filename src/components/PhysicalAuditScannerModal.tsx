"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Barcode,
  CheckCircle2,
  AlertTriangle,
  Search,
  MapPin,
  User,
  ShieldCheck,
  ShieldAlert,
  X,
  Laptop,
  Monitor,
  HardDrive,
  RefreshCw,
  QrCode,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { AssetEnriched } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LIFECYCLE_STAGES } from "@/lib/lifecycle-machine";

interface PhysicalAuditScannerModalProps {
  allAssets: AssetEnriched[];
  onClose: () => void;
  onVerifyAsset: (
    assetId: string,
    updates: {
      location?: string;
      assignedTo?: string;
      serialNumber?: string;
      resolutionNote?: string;
    }
  ) => Promise<void>;
  onOpenAssetDetail: (assetId: string) => void;
}

export default function PhysicalAuditScannerModal({
  allAssets,
  onClose,
  onVerifyAsset,
  onOpenAssetDetail,
}: PhysicalAuditScannerModalProps) {
  const [scanInput, setScanInput] = useState("");
  const [matchedAsset, setMatchedAsset] = useState<AssetEnriched | null>(null);
  const [selectedLocation, setSelectedLocation] = useState("HQ - Floor 3 Storage");
  const [customLocation, setCustomLocation] = useState("");
  const [auditLog, setAuditLog] = useState<{
    id: string;
    tag: string;
    model: string;
    time: string;
    location: string;
  }[]>([]);
  const [verifying, setVerifying] = useState(false);
  const [successPing, setSuccessPing] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearchOrScan = (query: string) => {
    const q = query.trim().toUpperCase();
    if (!q) {
      setMatchedAsset(null);
      return;
    }

    // Match exact tag, or serial, or contains tag
    const found =
      allAssets.find((a) => a.assetTag.toUpperCase() === q) ||
      allAssets.find((a) => a.serialNumber.toUpperCase() === q) ||
      allAssets.find((a) => a.assetTag.toUpperCase().includes(q)) ||
      null;

    setMatchedAsset(found);
  };

  const handleConfirmVerification = async () => {
    if (!matchedAsset) return;
    setVerifying(true);
    const locationToUse = customLocation.trim() || selectedLocation;

    try {
      await onVerifyAsset(matchedAsset.id, {
        location: locationToUse,
        resolutionNote: `Physical Audit: Tag scanned & verified at ${locationToUse}.`,
      });

      // Add to session log
      setAuditLog((prev) => [
        {
          id: matchedAsset.id,
          tag: matchedAsset.assetTag,
          model: matchedAsset.modelName,
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
          location: locationToUse,
        },
        ...prev,
      ]);

      setSuccessPing(true);
      setTimeout(() => setSuccessPing(false), 2000);

      // Reset input for next scan
      setScanInput("");
      setMatchedAsset(null);
      inputRef.current?.focus();
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-card w-full max-w-2xl rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden font-mono">
        {/* Modal Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Barcode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-foreground">
                  Physical Audit & Rapid Scanner
                </h2>
                <Badge
                  variant="outline"
                  className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] py-0 h-4.5"
                >
                  Live Audit Mode
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Scan barcode or type Asset Tag / Serial Number to instantly verify physical custody.
              </p>
            </div>
          </div>

          <Button
            onClick={onClose}
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Audit Form Body */}
        <div className="p-5 space-y-4">
          {/* Audit Location Selector */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-secondary/30 p-2.5 rounded-lg border border-border text-xs">
            <span className="text-muted-foreground shrink-0 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              <span>Current Audit Location:</span>
            </span>
            <select
              value={selectedLocation}
              onChange={(e) => {
                setSelectedLocation(e.target.value);
                setCustomLocation("");
              }}
              className="flex-1 bg-background border border-input rounded px-2.5 py-1 text-xs text-foreground focus:outline-none"
            >
              <option value="HQ - Floor 3 Storage">HQ - Floor 3 Storage Cage</option>
              <option value="HQ - IT Closet B">HQ - IT Closet B</option>
              <option value="HQ - Executive Suites">HQ - Executive Suites</option>
              <option value="Austin Lab - Server Room">Austin Lab - Server Room</option>
              <option value="London Office - Desk Cluster A">London Office - Desk Cluster A</option>
              <option value="custom">+ Custom Location...</option>
            </select>

            {selectedLocation === "custom" && (
              <Input
                type="text"
                placeholder="Enter custom location..."
                value={customLocation}
                onChange={(e) => setCustomLocation(e.target.value)}
                className="h-7 text-xs w-48"
              />
            )}
          </div>

          {/* Barcode Scanner Input */}
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Search className="w-4 h-4" />
            </div>
            <Input
              ref={inputRef}
              type="text"
              value={scanInput}
              onChange={(e) => {
                setScanInput(e.target.value);
                handleSearchOrScan(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matchedAsset) {
                  e.preventDefault();
                  handleConfirmVerification();
                }
              }}
              placeholder="Scan Barcode / Type AST-2024-XXX or Serial Number..."
              className="pl-9 pr-24 h-11 text-sm font-mono border-primary/40 focus:border-primary shadow-xs"
            />
            {scanInput && (
              <button
                onClick={() => {
                  setScanInput("");
                  setMatchedAsset(null);
                  inputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
              >
                Clear
              </button>
            )}
          </div>

          {/* Scanned Result Card */}
          {matchedAsset ? (
            <div className="bg-card rounded-lg border-2 border-primary/50 p-4 space-y-3 shadow-md animate-in zoom-in-95 duration-150">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black text-foreground">
                      {matchedAsset.assetTag}
                    </span>
                    <Badge
                      variant="outline"
                      className="border-primary/40 text-primary font-mono text-[10px]"
                    >
                      {LIFECYCLE_STAGES[matchedAsset.stage].shortLabel}
                    </Badge>
                    {matchedAsset.isGhostOrUnconfirmed && (
                      <Badge
                        variant="outline"
                        className="border-rose-500 text-rose-400 font-mono text-[10px]"
                      >
                        Ghost / Unverified
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs font-semibold text-foreground mt-0.5">
                    {matchedAsset.modelName}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    S/N: {matchedAsset.serialNumber || "None"} • {matchedAsset.vendor}
                  </div>
                </div>

                <Button
                  onClick={() => onOpenAssetDetail(matchedAsset.id)}
                  variant="ghost"
                  size="xs"
                  className="text-xs text-primary gap-1"
                >
                  <span>Open Details</span>
                  <ArrowRight className="w-3 h-3" />
                </Button>
              </div>

              {/* Current Recorded Custody vs New Location */}
              <div className="grid grid-cols-2 gap-2 text-xs bg-secondary/40 p-2.5 rounded border border-border">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                    Current Custodian
                  </span>
                  <div className="font-bold text-foreground">
                    {matchedAsset.assignedTo || "Unassigned (IT Stock)"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {matchedAsset.department}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                    Recorded Location
                  </span>
                  <div className="font-bold text-foreground">
                    {matchedAsset.location || matchedAsset.storageLocation || "Unknown"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Last Verified: {matchedAsset.lastVerifiedDate || "Never"}
                  </div>
                </div>
              </div>

              {/* Action Button: Confirm Physical Verification */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  onClick={handleConfirmVerification}
                  disabled={verifying}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-mono gap-1.5 shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {verifying
                      ? "Verifying..."
                      : `Confirm Physical Presence at ${customLocation || selectedLocation}`}
                  </span>
                </Button>
              </div>
            </div>
          ) : scanInput ? (
            <div className="p-6 text-center rounded-lg border border-dashed border-rose-500/40 bg-rose-500/5 text-xs text-rose-400 space-y-1">
              <AlertTriangle className="w-5 h-5 mx-auto text-rose-400 mb-1" />
              <div className="font-bold">No asset matches &quot;{scanInput}&quot;</div>
              <div className="text-muted-foreground text-[11px]">
                Verify the asset tag label or check if this device was never entered into inventory.
              </div>
            </div>
          ) : (
            <div className="p-8 text-center rounded-lg border border-dashed border-border bg-secondary/20 text-xs text-muted-foreground space-y-1">
              <QrCode className="w-8 h-8 mx-auto text-muted-foreground/60 mb-2" />
              <div className="font-bold text-foreground">Scanner Ready</div>
              <div>Point your USB barcode scanner or type any tag above.</div>
            </div>
          )}

          {/* Session Audit Counter & Log */}
          {auditLog.length > 0 && (
            <div className="border-t border-border pt-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Verified in this Audit Session ({auditLog.length})</span>
                </span>
                {successPing && (
                  <Badge variant="outline" className="border-emerald-500 text-emerald-400 animate-pulse text-[10px]">
                    +1 Verified!
                  </Badge>
                )}
              </div>

              <div className="max-h-36 overflow-y-auto space-y-1.5 text-xs">
                {auditLog.map((log, i) => (
                  <div
                    key={`${log.id}-${i}`}
                    className="flex items-center justify-between p-2 rounded bg-secondary/50 border border-border text-[11px]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-emerald-400">{log.tag}</span>
                      <span className="text-foreground truncate max-w-[180px]">{log.model}</span>
                    </div>
                    <div className="text-muted-foreground flex items-center gap-2 text-[10px]">
                      <span>{log.location}</span>
                      <span>•</span>
                      <span>{log.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-border bg-secondary/30 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Press <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px]">Enter</kbd> to confirm verification</span>
          </div>
          <Button onClick={onClose} variant="outline" size="sm" className="font-mono text-xs">
            Finish Audit
          </Button>
        </div>
      </div>
    </div>
  );
}
