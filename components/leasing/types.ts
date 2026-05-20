/**
 * Shared shape returned by api.leasingProspect.list. Kept in one place so
 * every leasing-tracker component can import a single canonical type.
 */
export interface ProspectListItem {
  id: string;
  code: string | null;
  name: string;
  stage: string;
  source: string | null;
  project_id: string | null;
  building_id: string | null;
  space_id: string | null;
  broker_company: string | null;
  broker_name: string | null;
  broker_email: string | null;
  broker_phone: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  requested_sf: number | null;
  target_commencement: string | null;
  term_months: number | null;
  asking_rent_psf: number | null;
  proposed_rent_psf: number | null;
  ti_allowance_psf: number | null;
  free_rent_months: number | null;
  probability_pct: number | null;
  last_activity_date: string | null;
  next_action: string | null;
  next_action_date: string | null;
  lost_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  project: { id: string; code: string; name: string } | null;
  building: { id: string; code: string; name: string | null } | null;
  space: { id: string; code: string } | null;
}
