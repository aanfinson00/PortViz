import { NextResponse } from "next/server";
import { buildLeasingProspectTemplate } from "@/lib/leasingProspectTemplate";

/**
 * Stream the leasing-prospect XLSX template. No auth required — the
 * template is fixed content with no org-scoped data.
 */
export async function GET() {
  const buf = buildLeasingProspectTemplate();
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="portviz-leasing-pipeline-template.xlsx"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
