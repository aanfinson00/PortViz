-- Tier 1 lease economics: type, stepped rent schedule, options, renewals.
--
-- lease_type      : NNN / modified gross / gross / absolute_net / percentage /
--                   other. Plain text validated in app code so the value set
--                   can iterate without enum migrations.
-- rent_schedule   : array of { fromMonth, toMonth, baseRentPsf, notes? }
--                   describing stepped rent. When null, the lease's existing
--                   base_rent_psf + escalation_pct compute the rate.
-- options         : array of { kind, noticeMonths?, termMonths?, rentBasis?,
--                   feePsf?, effectiveYear?, notes? } describing renewals /
--                   expansion / ROFR / ROFO / early termination clauses.
-- parent_lease_id : reference to a prior lease this one is a renewal /
--                   extension of. Lets us walk the lease history chain.
--                   on delete set null so deleting an old lease doesn't
--                   cascade-orphan its renewal chain.

alter table public.lease
  add column if not exists lease_type text,
  add column if not exists rent_schedule jsonb,
  add column if not exists options jsonb,
  add column if not exists parent_lease_id uuid
    references public.lease (id) on delete set null;

create index if not exists lease_parent_lease_idx
  on public.lease (parent_lease_id)
  where parent_lease_id is not null;
