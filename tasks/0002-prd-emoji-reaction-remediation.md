# Emoji Reaction Interaction Remediation PRD

## 1. Introduction / Overview
Emoji reactions in the messaging drawer regressed during Story 4A.2: hovering still reveals the trigger, but selecting an emoji no longer toggles reactions or renders reaction chips. Click events are being swallowed by the popover guard that implements the click-stop standard, leaving users without a quick acknowledgement workflow. This PRD captures the remediation scope required to restore the original acceptance criteria while preserving accessibility, telemetry, and realtime fidelity. Assumptions below are derived from Story 4A.2 and existing company guidelines because no additional clarifications were provided.

## 2. Goals
1. Ensure the emoji picker trigger and popover reliably dispatch selection events on both pointer and keyboard interaction.
2. Display aggregated reaction chips beneath each message, reflecting the current user’s selection state and up-to-date counts.
3. Maintain click-stop compliance so reactions do not hijack navigation for surrounding components such as space cards.
4. Provide regression-safe coverage (unit tests plus happy-path manual checks) to prevent recurrence.
5. Preserve telemetry hooks that power future Epic 4B analytics.

## 3. User Stories
- As a team member collaborating in messaging, I want to add emoji reactions without typing so that I can acknowledge updates quickly.
- As the original message author, I want to see who has reacted and how counts change in real time so that I can gauge sentiment.
- As a keyboard-first user, I want the emoji picker and chips to be fully reachable and dismissible with standard keys so that I can react efficiently without a mouse.

## 4. Functional Requirements
1. **FR1 – Reaction trigger**: Hovering a message shows a keyboard-focusable trigger that opens the picker without shifting layout. Trigger must obey `data-avatar-interactive` guard and stop propagation on activation.
2. **FR2 – Emoji picker selection**: Emoji buttons inside the popover must fire `onEmojiSelect(emoji)` on click or key activation, close the popover, and reset search. Events must not be swallowed by portal-level stopPropagation logic.
3. **FR3 – Search and frequently-used**: Provide "Frequently Used" shortcuts and filtered "All Emojis" search with instant substring matching.
4. **FR4 – Reaction toggling**: Selecting an emoji calls the messaging context toggle flow (optimistic cache update, API POST `/api/messages/react`, Supabase repository toggle). Selecting the same emoji again removes the current user’s reaction.
5. **FR5 – Reaction chips**: Render chips beneath the message showing emoji, count, and selection state. Chips must aggregate by emoji, sort by most recent interaction then codepoint, show tooltips, and support toggling via click.
6. **FR6 – Realtime propagation**: Reaction updates broadcast through Supabase Realtime and merge into existing TanStack Query caches without breaking pagination or thread expansion.
7. **FR7 – Telemetry & error handling**: Capture `debugLogger.messaging` events for popover open/close and toggle outcomes. Surface API failures via Sonner toast and rollback optimistic updates.
8. **FR8 – Accessibility & UX**: Focus returns to the trigger after closing the picker. Escape, outside click, or selection closes the popover, and focus is trapped while open. All interactive elements provide `aria-label`s.
9. **FR9 – Testing**: Cover emoji selection, propagation guard behaviour, and reaction chip toggling with Vitest/Testing Library. Manual verification checklist covers hover affordance, keyboard flow, optimistic rollback, and realtime sync on two sessions.

## 5. Non-Goals (Out of Scope)
- Mobile-specific layout adjustments or dedicated touch UX enhancements.
- Expanding the emoji dataset beyond the existing static list or introducing custom categories.
- Modifying Supabase schema or reaction table indexes (assumes current unique constraint stays).
- Building reaction leaderboards, analytics dashboards, or notification fan-out.
- Replacing Radix/shadcn primitives with alternative libraries (e.g., DaisyUI) in this iteration.

## 6. Design Considerations
- Reuse the existing `MessageActionBar` hover affordance and maintain absolute positioning to avoid layout thrash.
- Apply Tailwind styles consistent with the current design system (rounded chips, accent hover states, focus rings).
- Respect the click-stop standard by marking interactive children with `data-avatar-interactive` and guarding parents; rely on component-level event stopping instead of additional wrappers to keep DOM small.
- Ensure the picker width (w-80) matches surrounding popovers and remains accessible on smaller viewports.

## 7. Technical Considerations
- Adjust popover event handling so portal-level guards skip elements flagged with `data-emoji-button`, preventing React 19’s delegated events from being suppressed.
- Add per-button handlers for click, pointer down, and key down to explicitly stop propagation after processing the emoji selection.
- Update unit tests to mock `debugLogger.messaging` with the full method surface to avoid runtime TypeErrors under Vitest.
- Keep optimistic updates in `useMessages` aligned with reaction payload shape, and ensure realtime reconciliation does not duplicate or drop reactions.
- Validate that ReactionChips continue to stop propagation and respect current user highlighting.
- Maintain SSR compatibility by avoiding direct `window` access outside effects.

## 8. Success Metrics
- Emoji picker Vitest suite passes (including selection and propagation guard tests) with no unhandled TypeErrors.
- Reaction chips Vitest suite passes and reflects correct aggregation logic.
- `npm run type-check` completes without errors.
- Manual QA checklist confirms emoji selection toggles chips, picker closes, and no unintended navigation occurs in the messaging drawer.
- Debug logs show `[MSG:emoji-picker]` open/close and `useMessages.addReaction` toggle events when instrumentation is enabled.

## 9. Open Points & Decisions
1. **Realtime reliability** – Live Supabase fan-out is acceptable for this release; reconnect replay can wait for a later resilience story.
2. **End-to-end coverage** – Skip new Playwright specs; rely on Vitest plus manual QA until a leaner E2E plan is chartered.
3. **Telemetry scope** – No new analytics requirements beyond existing `debugLogger.messaging` events.
