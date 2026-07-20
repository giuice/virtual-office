-- PHASE 10 DRAFT -- DO NOT APPLY DURING PHASE 6.
-- Breaking presence cutover: revoke browser users UPDATE, normalize persisted
-- availability, and enforce the post-legacy invariant.
--
-- Preconditions:
--   1. An accepted, unedited seven-complete-day audit artifact exists.
--   2. Atomic presence mode is active and the maintenance window is approved.
--   3. This exact transaction is run through the privileged database connection.

\set ON_ERROR_STOP on

begin;

-- Serialize against direct users UPDATE statements and both aggregate receipt
-- writers before rechecking the live gate. The assertion rejects calls made
-- without these locks.
lock table public.users in access exclusive mode;

-- The definer assertion acquires SHARE on both private audit tables on this
-- same backend; postgres intentionally has no direct privileges on them.
select private.assert_presence_legacy_cutover_gate() as locked_gate_pass;

-- Table-level and legacy column-level grants are independent in PostgreSQL;
-- revoke both so no residual browser UPDATE survives the cutover.
revoke update on table public.users from anon, authenticated;
revoke update (
    display_name,
    avatar_url,
    status,
    status_message,
    preferences,
    last_active
) on table public.users from anon, authenticated;

select private.backfill_presence_availability_status() as offline_rows_backfilled;

alter table public.users
    alter column status set default 'online'::public.user_status;

alter table public.users
    add constraint users_persisted_availability_status_check
    check (
        status in (
            'online'::public.user_status,
            'away'::public.user_status,
            'busy'::public.user_status
        )
    );

-- Transaction-local catalog evidence retained with the accepted audit artifact.
select
    pg_catalog.has_table_privilege('anon', 'public.users', 'UPDATE')
        as anon_table_update,
    pg_catalog.has_table_privilege('authenticated', 'public.users', 'UPDATE')
        as authenticated_table_update,
    pg_catalog.has_column_privilege('anon', 'public.users', 'status', 'UPDATE')
        as anon_status_update,
    pg_catalog.has_column_privilege('authenticated', 'public.users', 'status', 'UPDATE')
        as authenticated_status_update,
    (
        select pg_catalog.pg_get_expr(d.adbin, d.adrelid)
        from pg_catalog.pg_attribute as a
        join pg_catalog.pg_attrdef as d
          on d.adrelid = a.attrelid and d.adnum = a.attnum
        where a.attrelid = 'public.users'::pg_catalog.regclass
          and a.attname = 'status'
    ) as status_default,
    (
        select pg_catalog.pg_get_constraintdef(c.oid, true)
        from pg_catalog.pg_constraint as c
        where c.conrelid = 'public.users'::pg_catalog.regclass
          and c.conname = 'users_persisted_availability_status_check'
    ) as availability_constraint,
    (
        select count(*)
        from public.users as u
        where u.status = 'offline'::public.user_status
    ) as remaining_offline_rows;

commit;
