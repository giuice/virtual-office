Implementation Plan - Story 3.16: Knock to Enter Workflow
Request Access to restricted spaces by "knocking". This involves client-side state management, realtime signaling, and UI notifications.

User Review Required
IMPORTANT

Realtime Strategy: We will use Supabase Realtime Broadcast on a per-space channel (space:{spaceId}).

Requester publishes KNOCK_REQUEST to space:{targetSpaceId}.
Occupants must be subscribed to space:{currentSpaceId} to receive it.
Constraint: We must ensure 
ModernFloorPlan
 or a top-level provider manages the subscription to the occupied space to listen for incoming knocks.
Proposed Changes
Core Logic [Component: Hooks]
[NEW] src/hooks/useKnock.ts
Purpose: Manage knock state machine (idle, pending, approved, denied, cooldown).
State: status, cooldownRemaining.
Actions: knock(spaceId), cancel(), reset().
Logic: Handles the 60s cooldown and 30s timeout.
[NEW] src/hooks/realtime/useKnockSignaling.ts
Purpose: Handle Supabase Realtime signals.
Methods:
sendKnockRequest(spaceId, userProfile)
sendKnockResponse(spaceId, requesterId, decision)
useKnockListener(spaceId, onKnockRequest, onKnockResponse)
Should automatically subscribe to space:{currentSpaceId} for occupants.
UI Components [Component: Floor Plan]
[MODIFY] 
src/components/floor-plan/modern/ModernFloorPlan.tsx
Changes:
Use useKnock and useKnockSignaling.
Implement handleKnock function.
Pass onKnock to 
ModernSpaceCard
.
Display KnockToast when incoming request is received.
Handle auto-join upon APPROVED response.
[MODIFY] 
src/components/floor-plan/modern/ModernSpaceCard.tsx
Changes:
Accept onKnock prop.
Pass onKnock to 
SpaceDetailPanel
.
[NEW] src/components/floor-plan/modern/KnockToast.tsx
Purpose: Custom toast component for sonner.
Props: requesterName, onApprove, onDeny.
UI: "User X is knocking", with Approve/Deny buttons.
Types [Component: Types]
Add KnockStatus type (idle, knocking, approved, denied).
Add KnockPayload and KnockResponsePayload interfaces.
Verification Plan
Automated Tests
Unit Tests (src/hooks/useKnock.test.ts):

Test state transitions (idle -> knocking).
Test timeout (30s).
Test cooldown (60s) after denial.
Test approval handling.
UI Tests (src/components/floor-plan/modern/KnockToast.test.tsx):

Test rendering of requester name.
Test click handlers for Approve/Deny.
Manual Verification
Setup: Open two browser windows (User A and User B).
Scenario 1: Successful Entry
User A enters a private space.
User B clicks "Knock" on that space.
User A sees "User B is knocking" toast.
User A clicks "Approve".
User B gets "Access Granted" toast and automatically joins.
Scenario 2: Denial & Cooldown
User A enters space.
User B knocks.
User A clicks "Deny".
User B gets "Access Denied" toast.
User B tries to knock again immediately -> Button disabled/Cooldown active.
Scenario 3: Timeout
User B knocks. User A does nothing.
After 30s, User B knocking state resets to idle (or specific timeout state).