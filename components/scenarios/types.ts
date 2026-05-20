import type { ScenarioSnapshot } from "@/lib/scenarioSnapshot";

/**
 * Shape returned by `demising.listSchemes`. Snapshot data is jsonb in
 * the DB; cast to ScenarioSnapshot via scenarioSnapshotSchema.parse()
 * before use.
 */
export interface SchemeRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_scenario: boolean;
  mode: string | null;
  snapshot_data: ScenarioSnapshot | null;
  linked_prospect_ids: string[] | null;
  created_at: string;
  updated_at: string;
}
