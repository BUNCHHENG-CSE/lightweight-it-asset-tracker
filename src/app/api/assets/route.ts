import { NextRequest, NextResponse } from "next/server";
import {
  bulkCreateAssets,
  bulkDeleteAssets,
  bulkTransitionAssets,
  bulkVerifyAssets,
  createNewAsset,
  getDatabaseEngineStatus,
  listAllAssets,
  listLifecycleEvents,
  seedDatabase,
} from "@/lib/db";
import { enrichAssetsAndAnalyzeLeaks } from "@/lib/lifecycle-machine";
import { parseAndAnalyzeCsv } from "@/lib/csv-importer";
import { SAMPLE_MESSY_SPREADSHEET_CSV } from "@/lib/seed-data";

export const dynamic = "force-dynamic";

function formatApiError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof AggregateError !== "undefined" && err instanceof AggregateError) {
    const msgs = err.errors
      ?.map((e) => (e instanceof Error ? e.message : String(e)))
      .filter(Boolean);
    if (msgs && msgs.length > 0) return msgs.join("; ");
  }
  return fallback;
}

export async function GET() {
  try {
    const [rawAssets, events] = await Promise.all([
      listAllAssets(),
      listLifecycleEvents(),
    ]);
    const { enrichedAssets, summary } = enrichAssetsAndAnalyzeLeaks(rawAssets);
    return NextResponse.json({
      assets: enrichedAssets,
      summary,
      events,
      sampleCsv: SAMPLE_MESSY_SPREADSHEET_CSV,
      dbEngine: getDatabaseEngineStatus(),
    });
  } catch (err) {
    console.error("GET /api/assets error:", err);
    return NextResponse.json(
      { error: formatApiError(err, "Failed to load assets") },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Handle reset to demo seed data
    if (body.action === "reset_demo") {
      await seedDatabase();
      const [rawAssets, events] = await Promise.all([
        listAllAssets(),
        listLifecycleEvents(),
      ]);
      const { enrichedAssets, summary } = enrichAssetsAndAnalyzeLeaks(rawAssets);
      return NextResponse.json({
        assets: enrichedAssets,
        summary,
        events,
        dbEngine: getDatabaseEngineStatus(),
      });
    }

    // Handle CSV batch import ("Spreadsheet Escape") inside a single ACID transaction
    if (body.action === "import_csv") {
      const csvText = String(body.csvText || "");
      const existing = await listAllAssets();
      const rows = parseAndAnalyzeCsv(csvText, existing);

      const imported = await bulkCreateAssets(
        rows.map((row) => ({
          assetTag: row.assetTag,
          modelName: row.modelName,
          category: row.category,
          serialNumber: row.serialNumber,
          stage: row.stage,
          subStatus: row.subStatus,
          assignedTo: row.assignedTo,
          department: row.department,
          location: row.location,
          purchaseDate: row.purchaseDate,
          purchaseCost: row.purchaseCost,
          warrantyExpiryDate: row.warrantyExpiryDate,
          eolDate: row.eolDate,
          poNumber: row.poNumber,
          verificationStatus: row.verificationStatus,
          anomalyNote: row.anomalyNote,
          importedFromCsv: true,
        }))
      );

      const [allRaw, events] = await Promise.all([
        listAllAssets(),
        listLifecycleEvents(),
      ]);
      const { enrichedAssets, summary } = enrichAssetsAndAnalyzeLeaks(allRaw);

      return NextResponse.json({
        importedCount: imported.length,
        assets: enrichedAssets,
        summary,
        events,
        dbEngine: getDatabaseEngineStatus(),
      });
    }

    // Handle bulk multi-asset operations (Batch Transitions, Verification, Decommission)
    if (body.action === "bulk_action") {
      const assetIds: string[] = Array.isArray(body.assetIds)
        ? body.assetIds
        : [];
      const bulkType = body.bulkType; // "transition" | "verify" | "delete"
      if (assetIds.length === 0) {
        return NextResponse.json(
          { error: "No asset IDs provided" },
          { status: 400 }
        );
      }

      if (bulkType === "delete") {
        await bulkDeleteAssets(assetIds);
      } else if (bulkType === "verify") {
        await bulkVerifyAssets(assetIds, {
          location: body.location,
          actor: body.actor,
          notes: body.notes,
        });
      } else if (bulkType === "transition") {
        await bulkTransitionAssets(
          assetIds,
          body.transitionPayload || { targetStage: body.targetStage }
        );
      }

      const [allRaw, events] = await Promise.all([
        listAllAssets(),
        listLifecycleEvents(),
      ]);
      const { enrichedAssets, summary } = enrichAssetsAndAnalyzeLeaks(allRaw);

      return NextResponse.json({
        success: true,
        affectedCount: assetIds.length,
        assets: enrichedAssets,
        summary,
        events,
        dbEngine: getDatabaseEngineStatus(),
      });
    }

    // Standard single asset creation (Procurement or direct entry)
    if (!body.modelName) {
      return NextResponse.json(
        { error: "modelName is required" },
        { status: 400 }
      );
    }

    const created = await createNewAsset(body);
    const [allRaw, events] = await Promise.all([
      listAllAssets(),
      listLifecycleEvents(),
    ]);
    const { enrichedAssets, summary } = enrichAssetsAndAnalyzeLeaks(allRaw);

    return NextResponse.json({
      created,
      assets: enrichedAssets,
      summary,
      events,
      dbEngine: getDatabaseEngineStatus(),
    });
  } catch (err) {
    console.error("POST /api/assets error:", err);
    return NextResponse.json(
      { error: formatApiError(err, "Failed to process request") },
      { status: 500 }
    );
  }
}
