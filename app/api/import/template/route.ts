import { NextResponse } from "next/server";
import { buildImportTemplate } from "@/lib/importTemplate";

/**
 * Stream the bulk-import XLSX template to the user. No auth required —
 * the template is fixed content (no org-scoped data); applying the
 * filled-in template requires an authenticated upload via /api/import.
 */
export async function GET() {
  const buf = buildImportTemplate();
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="portviz-import-template.xlsx"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
