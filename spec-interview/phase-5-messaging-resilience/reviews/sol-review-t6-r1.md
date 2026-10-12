**Verdict: revision required.**

1. **Medium — Output exceeds BR-013’s allowed fields.** [metrics-log.ts:86](E:/projects/virtual-office/src/lib/messaging/metrics-log.ts:86)  
   Every accepted event includes `schema`, which BR-013’s exclusive field list does not authorize. The test’s `LINE_KEYS` repeats this expansion. **Smallest fix:** remove `schema` from emitted lines and adjust log identification and assertions to use the existing event fields.

2. **Medium — Valid delayed retries lose their latency metric.** [metrics-contract.ts:20](E:/projects/virtual-office/src/lib/messaging/metrics-contract.ts:20)  
   FR-009 preserves the original send time without a 30-day retention limit; T19 explicitly measures latency from it. A successful manual retry after 31 days produces `durationMs: 2678400000`, which the sanitizer drops—I reproduced `null`. **Smallest fix:** replace the arbitrary 30-day duration ceiling with a documented safe integer bound covering supported send timestamps, and cover this case in the real-route integration test.

3. **Medium — Limiter initialization failure returns 500 instead of 429.** [route.ts:47](E:/projects/virtual-office/src/app/api/messages/metrics/route.ts:47)  
   If `SUPABASE_SERVICE_ROLE_KEY` is missing, authentication can succeed, but constructing the limiter client throws before `enforceRateLimit`. The outer catch returns 500, contrary to the Standing rules’ transient-429 requirement when the metrics budget cannot be checked. I reproduced the constructor failure. **Smallest fix:** include client construction in the budget-specific failure handling and return `rateLimitUnavailableResponse()`.

4. **Low — The streaming test does not prove early cutoff.** [messaging-metrics-route.test.ts:420](E:/projects/virtual-office/__tests__/messaging-db/messaging-metrics-route.test.ts:420)  
   Reading the entire 4 MB body before rejecting would still pass its sole status assertion. **Smallest fix:** instrument the input stream and assert cancellation plus bounded bytes pulled; also assert that an oversized declared length avoids reading.

5. **Low — The log-volume comment overstates the rolling-minute bound.** [rate-limit.ts:64](E:/projects/virtual-office/src/lib/auth/rate-limit.ts:64)  
   Thirty batches immediately before a fixed-window reset and thirty afterward allow 3,000 lines within a rolling minute. **Smallest fix:** describe 1,500 lines per fixed 60-second bucket and the boundary burst.

Folding the stream into the closed event `type` is compatible with BR-013. SPEC does not prescribe literal reason names, but T19 should document mappings for valid-session 401 responses and lease expiry.

The tests qualify as integration tests: Auth, application-user lookup, RPCs, and counters remain real; only Next’s cookie transport is substituted. Injection probes rejected newline enums and nonfinite numbers, ignored prototype/`toJSON` fields, and normalized `-0`. Received-byte limits and invalid UTF-8 handling behaved as claimed; cancellation returned promptly through Next’s installed request adapter.

Typecheck, touched-file lint, and tracked diff checks passed. Local read-only catalog queries confirmed the boolean limiter and its restricted grants. I did not rerun the DB/E2E suites or build under the read-only constraint. No online database was accessed.