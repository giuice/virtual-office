-- Phase 3 reviewed open-log repair script.
-- This is NOT a migration. Phase 10 authors the final CLI migration after
-- staging review and cutover rehearsal approval.

-- 1. Review every row the repair would close before running the UPDATE.
with repair_time as materialized (
  select clock_timestamp() as repaired_at
),
ranked_open_rows as (
  select
    spl.id,
    spl.user_id,
    spl.space_id,
    spl.entered_at,
    u.current_space_id,
    row_number() over (
      partition by spl.user_id
      order by spl.entered_at desc, spl.id desc
    ) as row_rank
  from public.space_presence_log spl
  join public.users u on u.id = spl.user_id
  where spl.exited_at is null
)
select
  ranked.id,
  ranked.user_id,
  ranked.space_id,
  ranked.current_space_id,
  ranked.entered_at,
  ranked.row_rank,
  repair_time.repaired_at,
  greatest(repair_time.repaired_at, ranked.entered_at) as proposed_exited_at,
  case
    when ranked.row_rank > 1 then 'duplicate-open-row'
    when ranked.space_id is distinct from ranked.current_space_id then 'mismatched-current-placement'
  end as repair_reason
from ranked_open_rows ranked
cross join repair_time
where ranked.row_rank > 1
  or ranked.space_id is distinct from ranked.current_space_id
order by ranked.user_id, ranked.row_rank, ranked.entered_at desc, ranked.id desc;

-- 2. Execute only after reviewing the SELECT output above.
with repair_time as materialized (
  select clock_timestamp() as repaired_at
),
ranked_open_rows as (
  select
    spl.id,
    spl.user_id,
    spl.space_id,
    spl.entered_at,
    u.current_space_id,
    row_number() over (
      partition by spl.user_id
      order by spl.entered_at desc, spl.id desc
    ) as row_rank
  from public.space_presence_log spl
  join public.users u on u.id = spl.user_id
  where spl.exited_at is null
)
update public.space_presence_log spl
set exited_at = greatest(repair_time.repaired_at, ranked.entered_at)
from ranked_open_rows ranked
cross join repair_time
where spl.id = ranked.id
  and (
    ranked.row_rank > 1
    or ranked.space_id is distinct from ranked.current_space_id
  );

-- 3. Post-repair verification. Both result sets must be empty before index creation.
select
  spl.user_id,
  count(*) as open_rows
from public.space_presence_log spl
where spl.exited_at is null
group by spl.user_id
having count(*) > 1
order by spl.user_id;

select
  spl.id,
  spl.user_id,
  spl.space_id,
  u.current_space_id,
  spl.entered_at
from public.space_presence_log spl
join public.users u on u.id = spl.user_id
where spl.exited_at is null
  and spl.space_id is distinct from u.current_space_id
order by spl.user_id, spl.entered_at desc, spl.id desc;

select count(*) as open_rows
from public.space_presence_log
where exited_at is null;

-- Phase-10-only unique index DDL. Keep commented until the final cutover
-- migration owns the reviewed repair + index sequence.
-- create unique index ux_space_presence_log_one_open_per_user
-- on public.space_presence_log (user_id)
-- where exited_at is null;
