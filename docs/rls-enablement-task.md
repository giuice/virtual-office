# TASK: Enable RLS on core tables (X-01) — PLATFORM CRITICAL

**Opened:** 2026-06-10 (from messaging audit §6, X-01)
**Status:** Pending — verified, not remediated
**Priority:** P0 — exploitable today with the public anon key shipped in the JS bundle

## Runtime evidence (2026-06-10)

Anonymous REST calls (anon key only, **no user session**):

| Test | Result |
|------|--------|
| `GET /rest/v1/users?select=email,status,role,current_space_id` | **200 + data** — all user emails, presence, roles, locations leak |
| `GET /rest/v1/spaces?select=id` | **200 + data** |
| `PATCH /rest/v1/users?id=eq.<uuid>` | **204 — anonymous WRITE permitted** |
| `GET` on `companies`, `invitations`, `announcements` | 200 + `[]` (tables may be empty — assume readable until proven otherwise) |

## Affected tables (per `migrations/database-structure.md`, `rls_enabled: false`)

`users`, `companies`, `spaces`, `announcements`, `invitations` (contain tokens!),
`meeting_notes`, `meeting_note_action_items`, `space_members`,
`space_presence_log`, `space_reservations`

## Remediation plan (separate track from messaging fixes)

1. **Consult `/presence-safety` skill BEFORE writing any policy on `users` or `spaces`** — presence flows (location updates, sendBeacon) assume server-side authority; policies must not break the service-role routes.
2. Enable RLS table by table: `ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY;` — service-role routes keep working (service role bypasses RLS), so the safe first step is *enable with minimal read policies* and verify each app flow.
3. Policy sketch per table (refine during implementation):
   - `users`: SELECT for authenticated users in the same company; UPDATE only own row (`supabase_uid = auth.uid()::text`).
   - `companies`: SELECT for members; UPDATE admin-only.
   - `spaces`, `space_members`, `space_reservations`, `space_presence_log`: SELECT same-company; mutations via service-role routes only (no client policies needed).
   - `invitations`: NO anon/auth SELECT (tokens) — service-role only.
   - `announcements`, `meeting_notes`, `meeting_note_action_items`: SELECT same-company.
4. After each table: re-run the anonymous curl probes above (must return 401/empty) + smoke-test presence (avatars, space join/leave) and messaging.
5. Re-run `mcp_supabase_get_advisors` security lint at the end (MCP currently lacks `SUPABASE_ACCESS_TOKEN` — fix token first).

## Related

- X-02 (messaging audit): `update_own_messages` policy lacks `WITH CHECK` — tighten while touching RLS.
- L-09: realtime publication references renamed tables `message_pins`/`message_stars`.
