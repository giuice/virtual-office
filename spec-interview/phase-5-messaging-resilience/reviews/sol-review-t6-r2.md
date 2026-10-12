**Verdict: revision required.** One new Medium finding remains.

| r1 finding | Disposition |
|---|---|
| Medium 1 — `schema` field | Fixed. Accepted metric lines contain only BR-013 fields. No other `appVersion` log producers were found. |
| Medium 2 — 30-day ceiling | Fixed for supported timestamps. Probes accepted 31-day durations and 40-day-old events; unsafe and out-of-range numbers were dropped. |
| Medium 3 — limiter construction returns 500 | Fixed. Construction alone is inside the new catch; unrelated authentication and processing errors retain their existing handling. |
| Low 4 — streaming evidence | Fixed. Instrumentation proves cancellation, zero pulls for declared oversize, and bounded consumption of the 4 MB body. |
| Low 5 — rolling-minute wording | Original wording corrected. The new rollover finding below undermines the claimed guarantee. |

1. **Medium — Delayed metrics checks can reopen an exhausted bucket.** [route.ts:58](E:/projects/virtual-office/src/app/api/messages/metrics/route.ts:58), [limiter SQL:633](E:/projects/virtual-office/supabase/migrations/20261007114454_message_create_budgets_insert_quota.sql:633).  
   The local catalog confirms that metrics checks select their bucket using transaction-start `now()` and delete older buckets. An RPC started in exhausted bucket W0 can reach its UPSERT after a W1 check has deleted W0, recreate W0 at count 1, and return `true`. Thirty accepted batches before rollover, thirty afterward, and one delayed batch permit **3,050 metric lines within a rolling minute**. Fresh W1 calls can delete recreated W0 counters again. The T3 serialization protects only `message:create`.  
   **Smallest fix:** serialize metrics checks per application user and calculate the bucket using `clock_timestamp()` after acquiring the lock. Add a local integration regression covering an old transaction resumed after the next bucket is exhausted. A comment-only change cannot close this gap.

2. **Low — The earliest-time comment overclaims what launch timing guarantees.** [metrics-contract.ts:23](E:/projects/virtual-office/src/lib/messaging/metrics-contract.ts:23).  
   SPEC does not establish January 1 as a minimum client timestamp. Launch timing cannot guarantee that a browser’s clock reports a later date. A client with a backward-set clock can submit short, otherwise valid metrics with pre-2026 `occurredAt`; these are dropped whole.  
   **Smallest fix:** describe January 1 as the chosen accepted-clock policy and document that backward-dated events are dropped, rather than claiming such timestamps cannot occur.

3. **Low — Logging descriptions conflate diagnostic output with metric output.** [route.ts:28](E:/projects/virtual-office/src/app/api/messages/metrics/route.ts:28), [route.ts:56](E:/projects/virtual-office/src/app/api/messages/metrics/route.ts:56).  
   Authentication failures emit normal `api_error` diagnostics. Limiter construction failure emits the fixed limiter-unavailable diagnostic **plus** the `api_error` produced by `rateLimitUnavailableResponse()`. Thus “nothing … logged” and the performer’s “logs only” claim are inaccurate. These diagnostics—including the 500 line—lack the metric discriminator and do **not** violate BR-013.  
   **Smallest fix:** say “no metric line” and acknowledge the normal API diagnostic.

Typecheck, touched-file lint, and whitespace checks passed. Read-only body-reader probes confirmed 16,384-byte acceptance, zero-byte declared rejection, multibyte rejection, and cancellation at 20,480 bytes for the 4 MB stream. The rollover finding rests on local catalog readback and execution-order analysis; no mutating database reproduction was run. DB/E2E suites and build were not rerun. No files were changed or online database accessed.