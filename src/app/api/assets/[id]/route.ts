import { NextRequest, NextResponse } from "next/server";
import {
  deleteAssetById,
  getDatabaseEngineStatus,
  listAllAssets,
  listLifecycleEvents,
  transitionAssetStage,
  updateAssetDetails,
  verifyAssetCustody,
} from "@/lib/db";
import { enrichAssetsAndAnalyzeLeaks } from "@/lib/lifecycle-machine";

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

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();

    if (body.action === "update_details") {
      await updateAssetDetails(id, body);
    } else if (body.action === "verify") {
      await verifyAssetCustody(id, body);
    } else {
      await transitionAssetStage(id, body);
    }

    const [allRaw, events] = await Promise.all([
      listAllAssets(),
      listLifecycleEvents(),
    ]);
    const { enrichedAssets, summary } = enrichAssetsAndAnalyzeLeaks(allRaw);

    return NextResponse.json({
      assets: enrichedAssets,
      summary,
      events,
      dbEngine: getDatabaseEngineStatus(),
    });
  } catch (err) {
    console.error("PATCH /api/assets/[id] error:", err);
    return NextResponse.json(
      { error: formatApiError(err, "Failed to update asset") },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await deleteAssetById(id);

    const [allRaw, events] = await Promise.all([
      listAllAssets(),
      listLifecycleEvents(),
    ]);
    const { enrichedAssets, summary } = enrichAssetsAndAnalyzeLeaks(allRaw);

    return NextResponse.json({
      assets: enrichedAssets,
      summary,
      events,
      dbEngine: getDatabaseEngineStatus(),
    });
  } catch (err) {
    console.error("DELETE /api/assets/[id] error:", err);
    return NextResponse.json(
      { error: formatApiError(err, "Failed to delete asset") },
      { status: 500 }
    );
  }
}
