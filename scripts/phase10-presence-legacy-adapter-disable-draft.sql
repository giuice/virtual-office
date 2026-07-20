-- PHASE 10 DRAFT -- DO NOT APPLY BEFORE THE FIRST ACCEPTED SEVEN-DAY ARTIFACT.
-- Run with: psql ... -v cutover_id='<the active runtime cutover UUID>' -f <this file>

\set ON_ERROR_STOP on

begin;

-- postgres owns/locks users. The definer assertion takes SHARE on both private
-- audit tables on this same backend; direct postgres access remains revoked.
lock table public.users in access exclusive mode;

select public.disable_legacy_presence_adapter(:'cutover_id'::uuid)
    as adapter_disable_result;

select
    mode,
    cutover_id,
    changed_at,
    changed_by,
    legacy_adapter_enabled,
    legacy_adapter_disabled_at
from private.presence_runtime_control
where singleton_id;

commit;
