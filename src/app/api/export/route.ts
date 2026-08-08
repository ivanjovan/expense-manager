import { NextResponse } from "next/server";
import { UnauthenticatedError, ForbiddenError } from "@/shared/lib/session";
import { buildExport } from "@/modules/export/server/build-export";
import { writeWorkbook } from "@/modules/export/server/xlsx";
import type { ExportScope } from "@/modules/export/server/export-data";

/**
 * GET /api/export?scope=household|vehicle|account&id=... — SRS §14.2 / §19.
 *
 * A Route Handler rather than a Server Action because the response is a
 * file download; actions can't set Content-Disposition.
 *
 * `scope=household` is the owner-only full backup. The narrower scopes are
 * available to any member, since they only contain records that member can
 * already read in the UI.
 */

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function parseScope(url: URL): ExportScope | null {
  const scope = url.searchParams.get("scope") ?? "household";
  const id = url.searchParams.get("id");

  if (scope === "household") return { kind: "household" };
  if (!id) return null;
  if (scope === "vehicle") return { kind: "vehicle", id };
  if (scope === "account") return { kind: "account", id };
  return null;
}

/**
 * RFC 5987 encoding. Household and vehicle names here are routinely
 * Serbian or Macedonian, and a raw non-ASCII `filename=` is mangled or
 * rejected — so an ASCII fallback is sent alongside the UTF-8 form.
 */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "");
  return `attachment; filename="${ascii}.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}.xlsx`;
}

export async function GET(request: Request) {
  const scope = parseScope(new URL(request.url));
  if (!scope) {
    return errorResponse("invalid_scope", 400);
  }

  try {
    const built = await buildExport(scope);
    if (!built) {
      return errorResponse("not_found", 404);
    }

    const bytes = await writeWorkbook(built.model, built.currency);

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": contentDisposition(built.model.filename),
        "Content-Length": String(bytes.byteLength),
        // A household's full financial history must never sit in a shared
        // cache, and re-requesting should always reflect current data.
        "Cache-Control": "no-store, private",
      },
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return errorResponse("unauthenticated", 401);
    if (error instanceof ForbiddenError) return errorResponse("forbidden", 403);
    console.error("Export failed", {
      scope: scope.kind,
      message: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse("export_failed", 500);
  }
}
