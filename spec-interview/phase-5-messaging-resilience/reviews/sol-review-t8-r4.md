**Verdict: revision required — 1 Medium, 1 Low; no High findings.**

1. **Medium — Malformed nested acknowledgement fields still delete durable content and can crash the feed.**  
   [outbox-outcome.ts:70](/E:/projects/virtual-office/src/lib/messaging/outbox/outbox-outcome.ts:70) checks only that `reactions` is an array. An otherwise valid, correlated 201 containing `reactions: [{ emoji: {}, userId: "<UUID>", timestamp: "<ISO timestamp>" }]` passes. [messaging-api.ts:38](/E:/projects/virtual-office/src/lib/messaging-api.ts:38) checks property presence, preserving the object-valued emoji. Confirmation deletes the outbox item; [ReactionChips.tsx:102](/E:/projects/virtual-office/src/components/messaging/ReactionChips.tsx:102) then renders that object and throws. If the malformed response never represented a commit, the send is lost.

   The raw spread also preserves unchecked fields: `stars: {}` crashes `.some()` even on a text message; attachment and mention shapes remain unchecked. **Smallest fix:** validate nested supported fields before confirmation and construct a validated `Message` without spreading unchecked metadata. Keep malformed responses unknown. Extend the malformed-ack E2E case.

2. **Low — Diagnostic capture can replace the original D1 assertion failure.**  
   [durable-outbox.spec.ts:505](/E:/projects/virtual-office/__tests__/api/playwright/messaging-phase5/durable-outbox.spec.ts:505) calls `serverLog.linesSince()` inside `finally` without protection. That reader throws when the log disappears or becomes unreadable, replacing an assertion’s error and preventing annotation creation. The recipient evaluation is already protected. **Smallest fix:** make server-log capture best effort, retain partial timings, and preserve the original failure.

The relaxed correlation itself is sound under T2/T4: sender/conversation mismatches are excluded, changed submitted compositions receive 409, and unchanged replays correctly render the current stored row. Missing content, malformed reply targets, invalid timestamps, and unknown type/status values remain refused. The new parent-deletion test exercises response-only confirmation; the retained reverted-classifier failure establishes non-vacuity.

Evidence confirms **three 36/36 runs**, **51/51 regression**, zero retries/flakes/skips, and matching restoration hashes. D1 arrivals span **4.829–7.674 seconds**, with summed client gaps **51–194 ms**. The quoted server share of “85–90%” is not uniform: application time represents **80.1–87.6%** through recipient arrival or **86.3–93.1%** through the last response.

Typecheck, touched-file lint, and diff checks pass. No files changed, database accessed, browser started, or dev server started.