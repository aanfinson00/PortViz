import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Append an entry to the audit log. Failures are swallowed (logged via
 * console) so an audit-write hiccup never blocks the underlying mutation
 * — if the lease saved but we couldn't record the event, the lease is
 * still saved. RLS ensures org-scoping on the insert side.
 *
 * Payload is free-form jsonb; routers typically pass `{ patch }` for
 * updates or `{ snapshot }` for creates/deletes.
 */
export async function logEvent(
  supabase: SupabaseClient,
  args: {
    orgId: string;
    actorId?: string | null;
    entityType: string;
    entityId: string;
    kind: "created" | "updated" | "deleted" | string;
    payload?: Record<string, unknown> | null;
  },
): Promise<void> {
  const { error } = await supabase.from("event").insert({
    org_id: args.orgId,
    actor_id: args.actorId ?? null,
    entity_type: args.entityType,
    entity_id: args.entityId,
    kind: args.kind,
    payload: args.payload ?? null,
  });
  if (error) {
    // Don't throw: an audit-log gap is not worth failing the user's action.
    // The 'event' table being missing (migration 0008 not applied yet)
    // surfaces as a 42P01 / PGRST205 here; surface to console so devs can
    // notice but keep the mutation path green.
    console.warn("[audit] failed to record event", {
      entityType: args.entityType,
      entityId: args.entityId,
      kind: args.kind,
      error: error.message,
    });
  }
}
