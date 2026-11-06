"use client";

import React from "react";
import { Keyboard, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

const SHORTCUTS = [
  { key: "/", desc: "Focus global search filter" },
  { key: "N", desc: "Procure new asset (Open Stage 1 form)" },
  { key: "B", desc: "Open Physical Audit & Barcode Scanner" },
  { key: "L", desc: "Open Global Fleet Activity Log" },
  { key: "F", desc: "Switch between 5-Stage Board and Finance Report" },
  { key: "Esc", desc: "Close any modal, drawer, or clear search" },
  { key: "?", desc: "Display this keyboard shortcuts cheat sheet" },
];

export default function KeyboardShortcutsModal({
  onClose,
}: KeyboardShortcutsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-card w-full max-w-md rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden font-mono">
        <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">
                Power User Keyboard Shortcuts
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Speed up fleet management and physical audits.
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

        <div className="p-4 space-y-2">
          {SHORTCUTS.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between p-2 rounded bg-secondary/30 border border-border text-xs"
            >
              <span className="text-muted-foreground">{s.desc}</span>
              <kbd className="px-2 py-0.5 rounded bg-muted border border-border text-xs font-bold text-foreground">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-border bg-card flex justify-end">
          <Button onClick={onClose} variant="outline" size="sm" className="font-mono text-xs">
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
