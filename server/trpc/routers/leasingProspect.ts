import { z } from "zod";
import { logEvent } from "../audit";
import { editorProcedure, orgProcedure, router } from "../init";

/**
 * Leasing prospect tracker. Models deals in the pipeline before they
 * become signed leases — analogous to a stripped-down VTS deals board.
 * See supabase/migrations/0014_leasing_tracker.sql for the schema.
 */

export const PROSPECT_STAGES = [
  "prospect",
  "tour",
  "rfp",
  "proposal",
  "loi",
  "lease_out",
  "executed",
  "dead",
  "on_hold",
] as const;

export const PROSPECT_SOURCES = [
  "cold_call",
  "tenant_broker",
  "cooperating_broker",
  "marketing",
  "referral",
  "existing_tenant",
  "website",
  "other",
] as const;

const stageEnum = z.enum(PROSPECT_STAGES);
const sourceEnum = z.enum(PROSPECT_SOURCES);

const prospectInput = z.object({
  code: z.string().trim().max(40).optional(),
  name: z.string().min(1).max(200),
  projectId: z.string().uuid().nullable().optional(),
  buildingId: z.string().uuid().nullable().optional(),
  spaceId: z.string().uuid().nullable().optional(),
  stage: stageEnum.optional(),
  source: sourceEnum.nullable().optional(),
  brokerCompany: z.string().max(200).nullable().optional(),
  brokerName: z.string().max(200).nullable().optional(),
  brokerEmail: z.string().email().nullable().optional().or(z.literal("")),
  brokerPhone: z.string().max(50).nullable().optional(),
  contactName: z.string().max(200).nullable().optional(),
  contactEmail: z.string().email().nullable().optional().or(z.literal("")),
  contactPhone: z.string().max(50).nullable().optional(),
  requestedSf: z.number().int().min(0).nullable().optional(),
  targetCommencement: z.string().nullable().optional(),
  termMonths: z.number().int().min(0).nullable().optional(),
  askingRentPsf: z.number().min(0).nullable().optional(),
  proposedRentPsf: z.number().min(0).nullable().optional(),
  tiAllowancePsf: z.number().min(0).nullable().optional(),
  freeRentMonths: z.number().min(0).nullable().optional(),
  probabilityPct: z.number().int().min(0).max(100).nullable().optional(),
  lastActivityDate: z.string().nullable().optional(),
  nextAction: z.string().max(500).nullable().optional(),
  nextActionDate: z.string().nullable().optional(),
  lostReason: z.string().max(500).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

const prospectUpdate = prospectInput.partial().extend({
  id: z.string().uuid(),
});

function toDbRow(
  orgId: string,
  input: z.infer<typeof prospectInput>,
): Record<string, unknown> {
  return {
    org_id: orgId,
    code: input.code ?? null,
    name: input.name,
    project_id: input.projectId ?? null,
    building_id: input.buildingId ?? null,
    space_id: input.spaceId ?? null,
    stage: input.stage ?? "prospect",
    source: input.source ?? null,
    broker_company: input.brokerCompany ?? null,
    broker_name: input.brokerName ?? null,
    broker_email: input.brokerEmail || null,
    broker_phone: input.brokerPhone ?? null,
    contact_name: input.contactName ?? null,
    contact_email: input.contactEmail || null,
    contact_phone: input.contactPhone ?? null,
    requested_sf: input.requestedSf ?? null,
    target_commencement: input.targetCommencement || null,
    term_months: input.termMonths ?? null,
    asking_rent_psf: input.askingRentPsf ?? null,
    proposed_rent_psf: input.proposedRentPsf ?? null,
    ti_allowance_psf: input.tiAllowancePsf ?? null,
    free_rent_months: input.freeRentMonths ?? null,
    probability_pct: input.probabilityPct ?? null,
    last_activity_date: input.lastActivityDate || null,
    next_action: input.nextAction ?? null,
    next_action_date: input.nextActionDate || null,
    lost_reason: input.lostReason ?? null,
    notes: input.notes ?? null,
  };
}

export const leasingProspectRouter = router({
  list: orgProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("leasing_prospect")
      .select(
        `id, code, name, stage, source,
         project_id, building_id, space_id,
         broker_company, broker_name, broker_email, broker_phone,
         contact_name, contact_email, contact_phone,
         requested_sf, target_commencement, term_months,
         asking_rent_psf, proposed_rent_psf, ti_allowance_psf, free_rent_months,
         probability_pct, last_activity_date, next_action, next_action_date,
         lost_reason, notes, created_at, updated_at,
         project:project_id (id, code, name),
         building:building_id (id, code, name),
         space:space_id (id, code)`,
      )
      .eq("org_id", ctx.orgId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }),

  byId: orgProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("leasing_prospect")
        .select(
          `*,
           project:project_id (id, code, name),
           building:building_id (id, code, name),
           space:space_id (id, code)`,
        )
        .eq("id", input.id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
      if (error) throw error;
      return data;
    }),

  activity: orgProcedure
    .input(z.object({ prospectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("leasing_prospect_activity")
        .select("*")
        .eq("prospect_id", input.prospectId)
        .eq("org_id", ctx.orgId)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    }),

  create: editorProcedure
    .input(prospectInput)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("leasing_prospect")
        .insert(toDbRow(ctx.orgId, input))
        .select()
        .single();
      if (error) throw error;
      await ctx.supabase.from("leasing_prospect_activity").insert({
        org_id: ctx.orgId,
        prospect_id: data.id,
        actor_id: ctx.user.id,
        kind: "created",
        to_stage: data.stage,
        note: `Created at stage "${data.stage}"`,
      });
      await logEvent(ctx.supabase, {
        orgId: ctx.orgId,
        actorId: ctx.user.id,
        entityType: "leasing_prospect",
        entityId: data.id,
        kind: "created",
        payload: { snapshot: data },
      });
      return data;
    }),

  update: editorProcedure
    .input(prospectUpdate)
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;

      // Fetch existing for stage-transition diffing.
      const { data: prev, error: prevErr } = await ctx.supabase
        .from("leasing_prospect")
        .select("stage")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
      if (prevErr) throw prevErr;
      if (!prev) throw new Error("Prospect not found");

      const patch: Record<string, unknown> = {};
      const row = toDbRow(ctx.orgId, {
        name: "_",
        ...rest,
      } as z.infer<typeof prospectInput>);
      // Only apply keys the caller actually supplied.
      for (const key of Object.keys(rest) as Array<keyof typeof rest>) {
        if (rest[key] === undefined) continue;
        const dbKey = (
          {
            code: "code",
            name: "name",
            projectId: "project_id",
            buildingId: "building_id",
            spaceId: "space_id",
            stage: "stage",
            source: "source",
            brokerCompany: "broker_company",
            brokerName: "broker_name",
            brokerEmail: "broker_email",
            brokerPhone: "broker_phone",
            contactName: "contact_name",
            contactEmail: "contact_email",
            contactPhone: "contact_phone",
            requestedSf: "requested_sf",
            targetCommencement: "target_commencement",
            termMonths: "term_months",
            askingRentPsf: "asking_rent_psf",
            proposedRentPsf: "proposed_rent_psf",
            tiAllowancePsf: "ti_allowance_psf",
            freeRentMonths: "free_rent_months",
            probabilityPct: "probability_pct",
            lastActivityDate: "last_activity_date",
            nextAction: "next_action",
            nextActionDate: "next_action_date",
            lostReason: "lost_reason",
            notes: "notes",
          } as const
        )[key];
        if (dbKey) patch[dbKey] = row[dbKey];
      }

      const { data, error } = await ctx.supabase
        .from("leasing_prospect")
        .update(patch)
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .select()
        .single();
      if (error) throw error;

      // Stage transition? Log the activity row.
      if (rest.stage && rest.stage !== prev.stage) {
        await ctx.supabase.from("leasing_prospect_activity").insert({
          org_id: ctx.orgId,
          prospect_id: id,
          actor_id: ctx.user.id,
          kind: "stage_changed",
          from_stage: prev.stage,
          to_stage: rest.stage,
          note: `Moved from "${prev.stage}" to "${rest.stage}"`,
        });
      }

      await logEvent(ctx.supabase, {
        orgId: ctx.orgId,
        actorId: ctx.user.id,
        entityType: "leasing_prospect",
        entityId: id,
        kind: "updated",
        payload: { patch },
      });
      return data;
    }),

  setStage: editorProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        stage: stageEnum,
        note: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: prev, error: prevErr } = await ctx.supabase
        .from("leasing_prospect")
        .select("stage")
        .eq("id", input.id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
      if (prevErr) throw prevErr;
      if (!prev) throw new Error("Prospect not found");
      if (prev.stage === input.stage) return { ok: true, unchanged: true };

      const { error } = await ctx.supabase
        .from("leasing_prospect")
        .update({
          stage: input.stage,
          last_activity_date: new Date().toISOString().slice(0, 10),
        })
        .eq("id", input.id)
        .eq("org_id", ctx.orgId);
      if (error) throw error;

      await ctx.supabase.from("leasing_prospect_activity").insert({
        org_id: ctx.orgId,
        prospect_id: input.id,
        actor_id: ctx.user.id,
        kind: "stage_changed",
        from_stage: prev.stage,
        to_stage: input.stage,
        note: input.note ?? `Moved from "${prev.stage}" to "${input.stage}"`,
      });
      return { ok: true };
    }),

  addNote: editorProcedure
    .input(
      z.object({
        prospectId: z.string().uuid(),
        note: z.string().min(1).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("leasing_prospect_activity")
        .insert({
          org_id: ctx.orgId,
          prospect_id: input.prospectId,
          actor_id: ctx.user.id,
          kind: "note",
          note: input.note,
        });
      if (error) throw error;
      await ctx.supabase
        .from("leasing_prospect")
        .update({ last_activity_date: new Date().toISOString().slice(0, 10) })
        .eq("id", input.prospectId)
        .eq("org_id", ctx.orgId);
      return { ok: true };
    }),

  delete: editorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("leasing_prospect")
        .delete()
        .eq("id", input.id)
        .eq("org_id", ctx.orgId);
      if (error) throw error;
      await logEvent(ctx.supabase, {
        orgId: ctx.orgId,
        actorId: ctx.user.id,
        entityType: "leasing_prospect",
        entityId: input.id,
        kind: "deleted",
      });
      return { ok: true };
    }),

  summary: orgProcedure.query(async ({ ctx }) => {
    // Pipeline summary: count + weighted SF + weighted base-rent revenue
    // per stage. Used by the page header for at-a-glance pipeline health.
    const { data, error } = await ctx.supabase
      .from("leasing_prospect")
      .select(
        "stage, requested_sf, term_months, proposed_rent_psf, asking_rent_psf, probability_pct",
      )
      .eq("org_id", ctx.orgId);
    if (error) throw error;
    const byStage: Record<
      string,
      { count: number; sf: number; weightedRevenue: number }
    > = {};
    for (const stage of PROSPECT_STAGES) {
      byStage[stage] = { count: 0, sf: 0, weightedRevenue: 0 };
    }
    for (const p of data ?? []) {
      const bucket = byStage[p.stage];
      if (!bucket) continue;
      bucket.count += 1;
      bucket.sf += p.requested_sf ?? 0;
      const rent = (p.proposed_rent_psf ?? p.asking_rent_psf ?? 0) as number;
      const years = (p.term_months ?? 0) / 12;
      const prob = (p.probability_pct ?? defaultProbability(p.stage)) / 100;
      bucket.weightedRevenue +=
        (p.requested_sf ?? 0) * rent * years * prob;
    }
    return byStage;
  }),
});

function defaultProbability(stage: string): number {
  switch (stage) {
    case "prospect":
      return 10;
    case "tour":
      return 25;
    case "rfp":
      return 40;
    case "proposal":
      return 55;
    case "loi":
      return 75;
    case "lease_out":
      return 90;
    case "executed":
      return 100;
    case "dead":
      return 0;
    case "on_hold":
      return 15;
    default:
      return 0;
  }
}
