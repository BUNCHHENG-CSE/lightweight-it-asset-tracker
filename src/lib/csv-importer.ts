import {
  Asset,
  AssetCategory,
  LifecycleStage,
  VerificationStatus,
} from "./types";
import { LIFECYCLE_STAGES, normalizeModelKey } from "./lifecycle-machine";

export interface ParsedCsvRowPreview {
  rowIndex: number;
  assetTag: string;
  modelName: string;
  normalizedModelKey: string;
  category: AssetCategory;
  serialNumber: string;
  stage: LifecycleStage;
  subStatus: string;
  assignedTo: string;
  department: string;
  location: string;
  purchaseDate: string;
  purchaseCost: number;
  warrantyExpiryDate: string;
  eolDate: string;
  poNumber: string;
  verificationStatus: VerificationStatus;
  anomalyNote: string;
  redundancyWarning: string | null;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function inferCategory(rawCat: string, modelName: string): AssetCategory {
  const combined = `${rawCat} ${modelName}`.toLowerCase();
  if (
    combined.includes("monitor") ||
    combined.includes("ultrasharp") ||
    combined.includes("display")
  ) {
    return "Monitor";
  }
  if (
    combined.includes("iphone") ||
    combined.includes("ipad") ||
    combined.includes("phone") ||
    combined.includes("tablet") ||
    combined.includes("galaxy")
  ) {
    return "Phone / Tablet";
  }
  if (
    combined.includes("server") ||
    combined.includes("switch") ||
    combined.includes("meraki") ||
    combined.includes("poweredge") ||
    combined.includes("firewall") ||
    combined.includes("network") ||
    combined.includes("unifi")
  ) {
    return "Server / Network";
  }
  if (
    combined.includes("dock") ||
    combined.includes("caldigit") ||
    combined.includes("peripheral") ||
    combined.includes("keyboard")
  ) {
    return "Dock / Peripheral";
  }
  return "Laptop";
}

function inferStageAndSubStatus(
  rawStatus: string,
  assignedTo: string
): { stage: LifecycleStage; subStatus: string } {
  const s = (rawStatus || "").toLowerCase();
  if (s.includes("order") || s.includes("purchas") || s.includes("po ")) {
    return { stage: "procurement", subStatus: "Ordered" };
  }
  if (
    s.includes("stock") ||
    s.includes("unused") ||
    s.includes("new in box") ||
    (s.includes("closet") && !assignedTo)
  ) {
    return { stage: "procurement", subStatus: "In Stock - Unused" };
  }
  if (s.includes("repair") || s.includes("rma") || s.includes("broken") || s.includes("maint")) {
    return { stage: "maintenance", subStatus: "Under Repair - RMA" };
  }
  if (
    s.includes("retire") ||
    s.includes("decomm") ||
    s.includes("dispos") ||
    s.includes("wiped") ||
    s.includes("sold")
  ) {
    return { stage: "decommission", subStatus: "Retired - Data Wiped" };
  }
  if (
    s.includes("idle") ||
    s.includes("extra") ||
    s.includes("closet") ||
    s.includes("offboard") ||
    s.includes("reclaim") ||
    s.includes("optim")
  ) {
    return {
      stage: "optimization",
      subStatus: assignedTo
        ? "Offboarded - Awaiting Return"
        : "Idle - Ready to Reallocate",
    };
  }
  if (s.includes("deploy") || s.includes("assign") || s.includes("active") || assignedTo) {
    return { stage: "deployment", subStatus: "Active - Assigned" };
  }
  return {
    stage: "procurement",
    subStatus: LIFECYCLE_STAGES.procurement.defaultSubStatus,
  };
}

function parseCost(rawCost: string): number {
  if (!rawCost) return 0;
  const cleaned = rawCost.replace(/[^0-9.]/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

export function parseAndAnalyzeCsv(
  csvText: string,
  existingAssets: Asset[] = []
): ParsedCsvRowPreview[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());

  const findCol = (keywords: string[]): number => {
    return headers.findIndex((h) => keywords.some((kw) => h.includes(kw)));
  };

  const colTag = findCol(["asset tag", "tag", "asset id", "id"]);
  const colModel = findCol(["model", "item", "device", "product", "name"]);
  const colCategory = findCol(["category", "type", "kind"]);
  const colSerial = findCol(["serial", "s/n", "sn"]);
  const colStatus = findCol(["status", "stage", "state"]);
  const colAssigned = findCol(["who", "assigned", "owner", "user", "employee", "custodian"]);
  const colDept = findCol(["dept", "department", "team"]);
  const colLocation = findCol(["location", "office", "notes", "where"]);
  const colPurchaseDate = findCol(["purchase date", "bought", "order date", "date"]);
  const colCost = findCol(["cost", "price", "value", "amount"]);
  const colWarranty = findCol(["warranty", "support end"]);
  const colEol = findCol(["eol", "end of life", "refresh"]);
  const colPo = findCol(["po", "invoice", "order #"]);

  // Build map of unused inventory counts by normalized model key
  const unusedByModel = new Map<string, number>();
  for (const a of existingAssets) {
    const isUnused =
      (a.stage === "procurement" && a.subStatus !== "Ordered") ||
      (a.stage === "optimization" &&
        !a.subStatus.toLowerCase().includes("awaiting return"));
    if (isUnused) {
      const k = a.normalizedModelKey || normalizeModelKey(a.modelName);
      unusedByModel.set(k, (unusedByModel.get(k) || 0) + 1);
    }
  }

  const previews: ParsedCsvRowPreview[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length === 0 || cols.every((c) => !c)) continue;

    const getVal = (idx: number) => (idx >= 0 && idx < cols.length ? cols[idx].trim() : "");

    const rawTag = getVal(colTag) || `CSV-${2000 + i}`;
    const rawModel = getVal(colModel) || "Unspecified IT Asset";
    const normalizedKey = normalizeModelKey(rawModel);
    const rawCategory = getVal(colCategory);
    const category = inferCategory(rawCategory, rawModel);
    const serialNumber = getVal(colSerial);
    const rawStatus = getVal(colStatus);
    const assignedTo = getVal(colAssigned);
    const department = getVal(colDept) || (assignedTo ? "General" : "Unassigned (IT Stock)");
    const location = getVal(colLocation) || "HQ";
    const purchaseDate = getVal(colPurchaseDate) || new Date().toISOString().slice(0, 10);
    const purchaseCost = parseCost(getVal(colCost));
    const warrantyExpiryDate = getVal(colWarranty);
    const eolDate = getVal(colEol);
    const poNumber = getVal(colPo);

    const { stage, subStatus } = inferStageAndSubStatus(rawStatus, assignedTo);

    // Detect spreadsheet anomalies (contradictions, missing data, unlocated)
    let verificationStatus: VerificationStatus = "verified";
    const anomalies: string[] = [];

    const lowerStatus = rawStatus.toLowerCase();
    const lowerAssigned = assignedTo.toLowerCase();
    const lowerLoc = location.toLowerCase();

    if (
      (lowerStatus.includes("closet") || lowerStatus.includes("idle") || lowerStatus.includes("stock")) &&
      assignedTo &&
      !lowerAssigned.includes("unassigned")
    ) {
      verificationStatus = "contradictory";
      anomalies.push(
        `Contradictory spreadsheet row: Status says '${rawStatus}' but Assigned To lists '${assignedTo}'.`
      );
    }

    if (
      lowerAssigned.includes("left co") ||
      lowerAssigned.includes("offboard") ||
      lowerLoc.includes("never shipped")
    ) {
      verificationStatus = "contradictory";
      anomalies.push(
        `Offboarded custodian alert: Assigned to '${assignedTo}' with unresolved return status.`
      );
    }

    if (!serialNumber || lowerAssigned.includes("unknown")) {
      if (verificationStatus === "verified") {
        verificationStatus = "missing_data";
      }
      anomalies.push(
        !serialNumber && lowerAssigned.includes("unknown")
          ? "Missing Serial Number AND Unknown custodian in spreadsheet."
          : !serialNumber
          ? "Missing Serial Number in spreadsheet row."
          : `Unidentified custodian ('${assignedTo}').`
      );
    }

    // Check redundancy against existing inventory
    const existingUnused = unusedByModel.get(normalizedKey) || 0;
    let redundancyWarning: string | null = null;
    if (stage === "procurement" && subStatus === "Ordered" && existingUnused > 0) {
      redundancyWarning = `Redundant purchase alert: You already own ${existingUnused} unused unit(s) of this model in inventory!`;
    } else if (
      (stage === "procurement" || stage === "optimization") &&
      existingUnused >= 1
    ) {
      redundancyWarning = `Adds to ${existingUnused} existing unused unit(s) of this model (${existingUnused + 1} total idle).`;
      unusedByModel.set(normalizedKey, existingUnused + 1);
    }

    previews.push({
      rowIndex: i,
      assetTag: rawTag,
      modelName: rawModel,
      normalizedModelKey: normalizedKey,
      category,
      serialNumber: serialNumber || `MISSING-SN-${rawTag}`,
      stage,
      subStatus,
      assignedTo,
      department,
      location,
      purchaseDate,
      purchaseCost,
      warrantyExpiryDate,
      eolDate,
      poNumber,
      verificationStatus,
      anomalyNote: anomalies.join(" "),
      redundancyWarning,
    });
  }

  return previews;
}
