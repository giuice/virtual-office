## Relevant Files

- `src/components/messaging/message-item.tsx` - Hover action bar that renders the emoji trigger and routes toggle callbacks.
- `src/components/messaging/EmojiPicker.tsx` - Picker UI requiring event propagation fixes, focus management, and telemetry hooks.
- `src/components/messaging/ReactionChips.tsx` - Aggregated chip display that must preserve stopPropagation and selection state.
- `src/hooks/mutations/useMessageReactions.ts` - Mutation hook coordinating optimistic updates, toast rollback, and duplicate guarding.
- `src/hooks/useMessages.ts` - Conversation query source handling optimistic reaction toggles and cache reconciliation.
- `src/hooks/realtime/useMessageSubscription.ts` - Supabase listener merging INSERT/DELETE payloads into cached pages.
- `src/lib/messaging-api.ts` - Client wrapper for `/api/messages/react` ensuring correct payload and debug telemetry.
- `src/app/api/messages/react/route.ts` - Server handler validating auth, toggling reactions, and surfacing repository errors.
- `src/repositories/implementations/supabase/SupabaseMessageRepository.ts` - Persistence layer enforcing onConflict upserts and reaction deletes.
- `__tests__/messaging/reaction-chips.test.tsx` - Existing Vitest coverage to extend for propagation and aggregation regressions.
- `__tests__/messaging/emoji-picker.test.tsx` - New Vitest suite covering picker trigger, keyboard flow, and selection events.

### Notes

- Run `npm run test -- --runInBand __tests__/messaging/reaction-chips.test.tsx __tests__/messaging/emoji-picker.test.tsx` to validate unit coverage.
- Run `npm run type-check` after implementation to ensure strict TypeScript compliance.
- Manual QA: verify hover trigger, emoji selection toggle, optimistic rollback on failure, and realtime sync across two sessions.
- Manual QA checklist (documented 2024-03-18):
  - [ ] Two logged-in sessions reflect reaction add/remove in realtime.
  - [ ] Hover/focus reveals emoji trigger without moving layout.
  - [ ] Failed reaction toggle shows retry toast and rolls back state.
- Latest validation (2024-03-18):
  - `npm run test:messaging-reactions`
  - `npm run type-check`

## Tasks

- [ ] 1.0 Restore emoji reaction trigger visibility, guarding, and popover event flow
- [x] 1.1 Review `message-item.tsx` hover action guard to ensure the emoji trigger renders on hover/focus without layout shift.
  - [x] 1.2 Update trigger button to stop propagation on click/keydown while keeping focusability and `data-avatar-interactive`.
  - [x] 1.3 Refine `EmojiPicker` popover handlers so pointer/click/key events from emoji buttons bypass the portal guard while other events stop bubbling.
  - [x] 1.4 Confirm popover close returns focus to the trigger and respects the click-stop contract in surrounding message cards.
- [ ] 2.0 Re-enable emoji selection pipeline (search, frequently used, toggle callbacks)
  - [x] 2.1 Wire picker selection to `useMessageReactions.toggleReaction` (or the existing onReaction callback) so emojis toggle on pointer and keyboard activation.
  - [x] 2.2 Ensure frequently used buttons and filtered search list share the same event handler and reset search state after selection.
  - [x] 2.3 Verify picker closes on selection, escape, or outside click and clears query state on close/open cycles.
  - [x] 2.4 Instrument selection with `debugLogger.messaging` events for `opened`, `closed`, and `emoji-selected`.
- [ ] 3.0 Repair reaction aggregation, optimistic updates, and realtime reconciliation
  - [x] 3.1 Audit `ReactionChips` aggregation to preserve per-emoji counts, current user highlighting, and time-based ordering.
  - [x] 3.2 Align optimistic cache updates in `useMessageReactions`/`useMessages` so toggles add/remove the current user’s reaction without duplication.
  - [x] 3.3 Ensure `/api/messages/react` and `messagingApi.toggleReaction` return the correct action for telemetry and rollback logic.
  - [x] 3.4 Confirm `useMessageSubscription` merges realtime INSERT/DELETE events into all cached pages without breaking pagination.
- [ ] 4.0 Reinforce telemetry, error handling, and user feedback surfaces
  - [x] 4.1 Add or update `debugLogger.messaging` traces for popover open/close, optimistic start/success, and realtime reaction events.
  - [x] 4.2 Propagate API errors to Sonner toast with retry affordance and roll back optimistic updates on failure.
  - [x] 4.3 Guard against missing logger mocks in tests to avoid runtime TypeErrors under Vitest.
- [x] 5.0 Deliver accessibility, testing, and manual QA coverage per PRD
  - [x] 5.1 Add a new `__tests__/messaging/emoji-picker.test.tsx` suite covering trigger focus, keyboard navigation, selection, and guard behaviour.
  - [x] 5.2 Extend `reaction-chips` tests to verify stopPropagation, aggregation order, and current-user styling regressions.
  - [x] 5.3 Document manual QA checklist steps (two-session realtime, optimistic rollback, hover affordance) in task notes or existing QA doc.
  - [x] 5.4 Run `npm run type-check` and targeted Vitest suites, recording outcomes for handoff.
