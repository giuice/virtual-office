# Migrations pendentes online — Phase 5 (messaging resilience)

Target online: `vhabpcoyypobgasacsko`. Nothing below is applied online before T23 (explicit owner authorization).
Rollout (owner decision D14, 2026-10-09): apply all rows in order, read back the catalog, then the owner deploys the Phase 5 app immediately (short window accepted for the hosted build).
States: written → applied locally → applied online → app deployed against it.

| Version | File | Task | Local | Online | Rollback recorded |
|---|---|---|---|---|---|
| 20261007031057 | supabase/migrations/20261007031057_read_state_membership_guard_and_unread_counts_acl.sql | T1 | applied | applied online 2026-10-10 (T23) | header + TRACK T1 |
| 20261007095045 | supabase/migrations/20261007095045_message_send_attempt_fencing.sql | T2 | applied | applied online 2026-10-10 (T23) | header (self-contained) + TRACK T2 |
| 20261007114454 | supabase/migrations/20261007114454_message_create_budgets_insert_quota.sql | T3 | applied | applied online 2026-10-10 (T23) | header (app first, then SQL) + TRACK T3 |
| 20261007153119 | supabase/migrations/20261007153119_message_mentions_and_conversation_roster.sql | T4 | applied | applied online 2026-10-10 (T23) | header (app first, then SQL; mention rows lost) + TRACK T4 |
| 20261007184118 | supabase/migrations/20261007184118_conversation_membership_integrity.sql | T28 | applied | applied online 2026-10-10 (T23) | header (app first, then SQL; restores D9 gap, forgets revocations) + TRACK T28 |
| 20261007224737 | supabase/migrations/20261007224737_conversation_typing_private_topic.sql | T5 | applied | applied online 2026-10-10 (T23) | header + TRACK T5 |
| 20261008012709 | supabase/migrations/20261008012709_rate_limit_window_serialization.sql | T6 | applied | applied online 2026-10-10 (T23) | header (SQL only; undo before T3) + TRACK T6 |
