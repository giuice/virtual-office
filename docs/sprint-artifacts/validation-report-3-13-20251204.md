# Validation Report

**Document:** docs/sprint-artifacts/3-13-real-time-presence-animation.md
**Checklist:** .bmad/bmm/workflows/4-implementation/create-story/checklist.md
**Date:** 2025-12-04T19:55:00-03:00

## Summary
- Overall: 8/14 passed (57%)
- Critical Issues: 3
- Enhancement Opportunities: 4

## Section Results

### Source Document Analysis
Pass Rate: 2/3 (67%)

✓ **Epics Requirements Extracted**
Evidence: Lines 13-44 correctly capture acceptance criteria from epics.md with source references.

⚠ **UX Spec Integration – PARTIAL**
Evidence: References `docs/ux-space-grid-v2.html` (L86) but misses key UX spec details:
- Missing: UX spec L271 mandates `prefers-reduced-motion` support with "subtle opacity changes" only
- Missing: UX spec L197 specifies "animates transitions" for AvatarConstellation
Impact: Dev agent may not implement accessibility requirement.

✓ **Architecture Alignment**
Evidence: Correctly identifies CSS-first approach and existing component structure.

### Previous Story Intelligence
Pass Rate: 1/2 (50%)

✓ **Story 3.3 Context Referenced**
Evidence: L56-64 acknowledges UserAvatarPresence.tsx and ModernSpaceCard.tsx patterns.

⚠ **Missing Learnings from Story 3.4 – PARTIAL**
Evidence: Story 3.4 established beacon animations with `@keyframes vo-beacon-pulse` in tokens.css (L338-341). Story 3.4 also added reduced motion support (L374-380). These patterns should be explicitly referenced as a template.
Impact: Developer may recreate instead of extending existing keyframe patterns.

### File Discovery & Paths
Pass Rate: 2/5 (40%)

✗ **Missing Exact File Paths with Line Numbers – FAIL**
Evidence: Story mentions files but lacks precise locations:
- `UserAvatarPresence.tsx` is at `src/components/floor-plan/UserAvatarPresence.tsx`
- `ModernSpaceCard.tsx` is at `src/components/floor-plan/modern/ModernSpaceCard.tsx`
- `tokens.css` is at `src/styles/themes/tokens.css`
Impact: Developer wastes tokens discovering file locations.

✗ **Missing Existing Animation Tokens Reference – FAIL**
Evidence: tokens.css already defines animation infrastructure (L8-11):
```css
--vo-transition-speed: 0.4s;
--vo-ease-elastic: cubic-bezier(0.34, 1.56, 0.64, 1);
```
And avatar tokens (L387-394):
```css
--vo-avatar-hover-lift: -3px;
--vo-avatar-hover-scale: 1.1;
```
Impact: Developer may define duplicate tokens.

✗ **Missing `tailwindcss-animate` Usage Pattern – FAIL**
Evidence: Project uses `animate-in fade-in` pattern across 13+ files (FullBadge.tsx, SpaceDetailPanel.tsx, CallNotification.tsx). Story mentions this but doesn't show concrete usage example.
Impact: Developer unsure how to apply existing animation utilities.

✓ **Test File Location Pattern**
Evidence: Story correctly references test creation in Tasks section.

⚠ **Missing Test File Convention – PARTIAL**
Evidence: Should specify test file `__tests__/floor-plan/UserAvatarPresence.test.tsx` or pattern from Story 3.4.

### Exit Animation Strategy
Pass Rate: 0/2 (0%)

✗ **Exit Animation Handling – FAIL**
Evidence: L61-64 acknowledges the problem but provides no concrete solution:
> "If exit animation is too complex... prioritize Enter animation"

The project uses Radix/Dialog patterns that support exit animations. Example from SpaceDetailPanel.tsx uses `data-state="closed"` (tokens.css L471-473):
```css
.space-detail-panel[data-state="closed"] {
  animation: vo-detail-panel-exit var(--vo-detail-panel-animation-duration)...
}
```
Impact: Developer may skip exit animations entirely when a pattern exists.

✗ **Supabase Realtime Event Handling – FAIL**
Evidence: Story doesn't mention how presence_sync events trigger animations. ModernSpaceCard receives realtime updates but story doesn't specify integration point.
Impact: Developer may not understand where to hook animation triggers.

### LLM Optimization
Pass Rate: 3/4 (75%)

✓ **Scannable Structure**
Evidence: Clear headers, AC hierarchy, task breakdown.

✓ **Actionable Instructions**
Evidence: Tasks are specific with subtasks.

⚠ **Token Efficiency – PARTIAL**
Evidence: L93-95 Architecture Decisions section is verbose. Fallback strategies should be in Dev Notes, not duplicated.

✓ **No Ambiguity on Core Requirements**
Evidence: Animation durations and curves are precise (300ms, ease-out, etc.).

## Failed Items

1. **Missing Exact File Paths** – Add full paths with line number references
2. **Missing tailwindcss-animate Pattern** – Show concrete usage example
3. **Exit Animation Strategy Absent** – Provide `data-state` pattern from existing code
4. **Realtime Event Integration Missing** – Explain where animation triggers hook in

## Recommendations

### 1. Must Fix: File Paths & Existing Tokens
Add to Dev Notes:
- `src/components/floor-plan/UserAvatarPresence.tsx` (lines 71-148 render method)
- `src/styles/themes/tokens.css` (lines 8-11 animation tokens, 387-394 avatar tokens, 751-762 speaking pulse keyframe)
- `src/components/floor-plan/modern/ModernSpaceCard.tsx` (avatar render integration point)

### 2. Must Fix: Exit Animation Pattern
Replace vague fallback with concrete pattern:
```tsx
// Use AnimatePresence-like CSS pattern with data-state
<div data-state={isExiting ? 'closed' : 'open'} className="animate-in fade-in zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out">
```

### 3. Must Fix: Reduced Motion Support
Add explicit requirement from UX spec:
- L271: "Reduced motion setting disables beacon pulses and swaps avatar animations for subtle opacity changes"
- Reference existing pattern in tokens.css L374-380

### 4. Should Add: tailwindcss-animate Example
```tsx
className="animate-in fade-in-0 zoom-in-95 duration-300 ease-out"
```

### 5. Should Add: Realtime Hook Integration
Specify that ModernSpaceCard's useRealtimeUpdates hook receives presence changes – animation state should derive from comparing previous vs current occupantIds array.

### 6. Consider: Existing Keyframe Reuse
vo-avatar-speaking-pulse (L752-762) already exists – ensure new animations follow same naming convention `vo-avatar-*`.
