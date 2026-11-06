"use client";

import React, { useState } from "react";
import {
  Edit3,
  X,
  Save,
  Laptop,
  Monitor,
  Smartphone,
  Server,
  HardDrive,
  DollarSign,
  Calendar,
  User,
  MapPin,
  Building,
} from "lucide-react";
import { AssetCategory, AssetEnriched, AssetUpdatePayload } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface EditAssetModalProps {
  asset: AssetEnriched;
  onClose: () => void;
  onSave: (assetId: string, updates: AssetUpdatePayload) => Promise<void>;
}

const CATEGORIES: AssetCategory[] = [
  "Laptop",
  "Monitor",
  "Phone / Tablet",
  "Server / Network",
  "Dock / Peripheral",
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
  "Executive",
  "Unassigned (IT Stock)",
];

export default function EditAssetModal({
  asset,
  onClose,
  onSave,
}: EditAssetModalProps) {
  const [modelName, setModelName] = useState(asset.modelName);
  const [category, setCategory] = useState<AssetCategory>(asset.category);
  const [vendor, setVendor] = useState(asset.vendor || "");
  const [serialNumber, setSerialNumber] = useState(asset.serialNumber || "");
  const [poNumber, setPoNumber] = useState(asset.poNumber || "");
  const [purchaseCost, setPurchaseCost] = useState(
    asset.purchaseCost ? String(asset.purchaseCost) : "0"
  );
  const [purchaseDate, setPurchaseDate] = useState(asset.purchaseDate || "");
  const [warrantyExpiryDate, setWarrantyExpiryDate] = useState(
    asset.warrantyExpiryDate || ""
  );
  const [eolDate, setEolDate] = useState(asset.eolDate || "");

  // Custodian & Location
  const [assignedTo, setAssignedTo] = useState(asset.assignedTo || "");
  const [assignedEmail, setAssignedEmail] = useState(asset.assignedEmail || "");
  const [department, setDepartment] = useState(asset.department || "Engineering");
  const [location, setLocation] = useState(asset.location || "HQ");
  const [condition, setCondition] = useState(asset.condition || "Good");
  const [subStatus, setSubStatus] = useState(asset.subStatus || "");
  const [editNotes, setEditNotes] = useState("");

  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(asset.id, {
        modelName: modelName.trim(),
        category,
        vendor: vendor.trim(),
        serialNumber: serialNumber.trim(),
        poNumber: poNumber.trim(),
        purchaseCost: parseFloat(purchaseCost) || 0,
        purchaseDate,
        warrantyExpiryDate,
        eolDate,
        assignedTo: assignedTo.trim(),
        assignedEmail: assignedEmail.trim(),
        department,
        location: location.trim(),
        condition,
        subStatus: subStatus.trim(),
        editNotes: editNotes.trim() || "Updated hardware specifications & metadata.",
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-card w-full max-w-2xl max-h-[90vh] rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden font-mono text-xs">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-foreground">
                  Edit Asset Specifications
                </h2>
                <Badge variant="outline" className="font-mono text-[10px] py-0 h-4.5">
                  {asset.assetTag}
                </Badge>
              </div>
              <p className="text-muted-foreground text-[11px] mt-0.5">
                Update model name, serial number, procurement cost, or custodian assignments.
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Section 1: Hardware Identification */}
          <div className="space-y-3">
            <h3 className="font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-1.5 border-b border-border pb-1">
              <span>1. Hardware Identification</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">
                  Model Name *
                </label>
                <Input
                  required
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="e.g. MacBook Pro 14 (M3 Pro)"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as AssetCategory)}
                  className="w-full rounded-md border border-input bg-input/20 px-2 py-1 text-xs font-mono text-foreground focus:outline-none h-8"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">
                  Serial Number (S/N)
                </label>
                <Input
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  placeholder="e.g. C02G1234MD6R"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">
                  Vendor / Supplier
                </label>
                <Input
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder="e.g. Apple Business, CDW"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Financial & Warranty Information */}
          <div className="space-y-3">
            <h3 className="font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-1.5 border-b border-border pb-1">
              <span>2. Procurement & Warranty</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">
                  Purchase Cost ($)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={purchaseCost}
                  onChange={(e) => setPurchaseCost(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">
                  PO / Invoice Number
                </label>
                <Input
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="e.g. PO-8831"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">
                  Purchase Date
                </label>
                <Input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">
                  Warranty Expiry Date
                </label>
                <Input
                  type="date"
                  value={warrantyExpiryDate}
                  onChange={(e) => setWarrantyExpiryDate(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">
                  End-of-Life (EOL) Date
                </label>
                <Input
                  type="date"
                  value={eolDate}
                  onChange={(e) => setEolDate(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">
                  Hardware Condition
                </label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full rounded-md border border-input bg-input/20 px-2 py-1 text-xs font-mono text-foreground focus:outline-none h-8"
                >
                  <option value="New">New / In Box</option>
                  <option value="Good">Good / Standard</option>
                  <option value="Fair">Fair / Cosmetic Wear</option>
                  <option value="Needs Repair">Needs Repair / Damaged</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Custody & Location */}
          <div className="space-y-3">
            <h3 className="font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-1.5 border-b border-border pb-1">
              <span>3. Custody & Location</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">
                  Assigned Custodian (Name)
                </label>
                <Input
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  placeholder="e.g. Alex Rivera (or leave blank for IT Stock)"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">
                  Assigned Email
                </label>
                <Input
                  type="email"
                  value={assignedEmail}
                  onChange={(e) => setAssignedEmail(e.target.value)}
                  placeholder="e.g. alex@vanguardlabs.com"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">
                  Department
                </label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full rounded-md border border-input bg-input/20 px-2 py-1 text-xs font-mono text-foreground focus:outline-none h-8"
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">
                  Location / Desk
                </label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. HQ - Floor 3 / Remote - Austin"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-muted-foreground text-[11px] block mb-1">
                  Sub-Status / Internal Notes
                </label>
                <Input
                  value={subStatus}
                  onChange={(e) => setSubStatus(e.target.value)}
                  placeholder="e.g. Active Daily Driver, In IT Cage, Staged for Onboarding"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-muted-foreground text-[11px] block mb-1">
                  Audit Log Note (Reason for Change)
                </label>
                <Input
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="e.g. Corrected S/N typo, reassigned custodian to incoming engineer"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              size="sm"
              className="font-mono text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="font-mono text-xs gap-1.5 bg-primary text-primary-foreground shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? "Saving Changes..." : "Save Specifications"}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
