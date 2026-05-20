/**
 * Generate the leasing-prospect import XLSX template. One Prospects sheet
 * with the columns the parser expects, an Instructions sheet up front
 * explaining the pipeline stages and field meanings, and a Stages sheet
 * documenting the allowed enum values.
 *
 * Designed so a broker can also use this template offline as a working
 * Excel pipeline — every row maps 1:1 to a leasing_prospect record.
 */

import * as XLSX from "xlsx";

const PROSPECT_HEADERS = [
  "code",
  "name",
  "stage",
  "source",
  "project_code",
  "building_code",
  "space_code",
  "broker_company",
  "broker_name",
  "broker_email",
  "broker_phone",
  "contact_name",
  "contact_email",
  "contact_phone",
  "requested_sf",
  "target_commencement",
  "term_months",
  "asking_rent_psf",
  "proposed_rent_psf",
  "ti_allowance_psf",
  "free_rent_months",
  "probability_pct",
  "last_activity_date",
  "next_action",
  "next_action_date",
  "lost_reason",
  "notes",
];

const PROSPECT_HINTS = [
  "optional short ID",
  "Required — prospect company name",
  "prospect | tour | rfp | proposal | loi | lease_out | executed | dead | on_hold",
  "cold_call | tenant_broker | cooperating_broker | marketing | referral | existing_tenant | website | other",
  "must match a Project.code (optional)",
  "must match a Building.code in that project (optional)",
  "must match a Space.code in that building (optional)",
  "tenant rep brokerage",
  "tenant rep name",
  "tenant rep email",
  "tenant rep phone",
  "direct prospect contact name",
  "direct prospect contact email",
  "direct prospect contact phone",
  "requested square feet",
  "YYYY-MM-DD",
  "lease term in months",
  "$/SF/yr",
  "$/SF/yr",
  "$/SF",
  "months",
  "0-100",
  "YYYY-MM-DD",
  "e.g. 'Send proposal by 5/30'",
  "YYYY-MM-DD",
  "only fill when stage = dead",
  "free-form",
];

const PROSPECT_EXAMPLE: Array<string | number | boolean> = [
  "P001",
  "Acme Logistics Inc.",
  "tour",
  "tenant_broker",
  "ACME",
  "A",
  "101",
  "CBRE",
  "Jane Smith",
  "jane.smith@cbre.com",
  "(214) 555-0123",
  "",
  "",
  "",
  50000,
  "2026-09-01",
  60,
  9.5,
  8.75,
  6.0,
  3.0,
  25,
  "2026-05-15",
  "Send proposal by 5/30",
  "2026-05-30",
  "",
  "Toured 5/15 — likes truck court depth, asking about additional dock doors.",
];

const INSTRUCTIONS: string[][] = [
  ["PortViz leasing pipeline — fill out the Prospects sheet, then upload at /app/leasing"],
  [],
  ["How it works"],
  [
    "Each row in the Prospects sheet becomes a deal in your pipeline. Re-uploading the same file is safe — rows with a matching `code` are updated in place; rows without a code are inserted fresh.",
  ],
  [
    "We validate every row first. If anything's wrong (bad stage value, malformed date, etc.) you get a per-row error report and nothing is written. If everything passes, every row is applied.",
  ],
  [],
  ["Pipeline stages"],
  [
    "prospect — identified lead, no contact yet",
  ],
  [
    "tour — tour scheduled or completed",
  ],
  [
    "rfp — request-for-proposal issued (either side)",
  ],
  [
    "proposal — proposal / unsolicited proposal sent",
  ],
  [
    "loi — letter of intent in negotiation",
  ],
  [
    "lease_out — lease document out for signature",
  ],
  [
    "executed — lease signed (convert to a real lease record in PortViz)",
  ],
  [
    "dead — lost deal (fill in lost_reason)",
  ],
  [
    "on_hold — paused / parked",
  ],
  [],
  ["Property linking (optional)"],
  [
    "If you know which property a prospect is targeting, fill in project_code (must match an existing PortViz project), and optionally building_code + space_code. Leave blank for prospects that are still shopping.",
  ],
  [],
  ["Rules"],
  ["- name is required. Everything else is optional."],
  ["- stage defaults to 'prospect' if blank."],
  ["- Dates: YYYY-MM-DD."],
  ["- Numbers: bare numbers, no $ or commas. (50000 not $50,000)"],
  ["- code is unique within your org and is the upsert key on re-upload."],
];

const STAGE_REFERENCE: string[][] = [
  ["Stage", "Typical probability", "What it means"],
  ["prospect", "10%", "Identified lead, no engagement yet"],
  ["tour", "25%", "Tour scheduled or completed"],
  ["rfp", "40%", "Request-for-proposal issued"],
  ["proposal", "55%", "Proposal / unsolicited proposal sent"],
  ["loi", "75%", "Letter of intent in negotiation"],
  ["lease_out", "90%", "Lease document out for signature"],
  ["executed", "100%", "Lease signed — convert to a real lease"],
  ["dead", "0%", "Lost (record lost_reason)"],
  ["on_hold", "15%", "Paused / parked"],
];

export function buildLeasingProspectTemplate(): Uint8Array {
  const wb = XLSX.utils.book_new();

  const instructions = XLSX.utils.aoa_to_sheet(INSTRUCTIONS);
  instructions["!cols"] = [{ wch: 110 }];
  XLSX.utils.book_append_sheet(wb, instructions, "Instructions");

  const prospects = XLSX.utils.aoa_to_sheet([
    PROSPECT_HEADERS,
    PROSPECT_HINTS,
    PROSPECT_EXAMPLE,
  ]);
  prospects["!cols"] = PROSPECT_HEADERS.map(() => ({ wch: 20 }));
  prospects["!freeze"] = { xSplit: 0, ySplit: 1 } as never;
  XLSX.utils.book_append_sheet(wb, prospects, "Prospects");

  const stages = XLSX.utils.aoa_to_sheet(STAGE_REFERENCE);
  stages["!cols"] = [{ wch: 14 }, { wch: 22 }, { wch: 64 }];
  XLSX.utils.book_append_sheet(wb, stages, "Stages");

  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Uint8Array(buffer);
}

export const LEASING_PROSPECT_HEADERS = PROSPECT_HEADERS;
