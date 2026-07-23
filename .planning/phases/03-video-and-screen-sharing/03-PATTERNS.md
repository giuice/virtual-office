# Phase 3: Spatial Audio and Screen Sharing - Pattern Map

**Mapped:** 2026-07-22
**Files analyzed:** 21 planned new/modified files
**Analogs found:** 19 / 21

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `.planning/ROADMAP.md` | config | transform | `.planning/REQUIREMENTS.md` | role-match |
| `.planning/REQUIREMENTS.md` | config | transform | `.planning/ROADMAP.md` | role-match |
| `package.json` and lockfile | config | batch | `package.json` | exact |
| `supabase/migrations/<timestamp>_screen_share_lease_and_media_realtime.sql` | migration | CRUD | `supabase/migrations/20260718204506_phase6_private_company_presence.sql` | role-match |
| `src/lib/webrtc/screen-share-contract.ts` | utility | transform | `src/lib/presence/knock-contract.ts` | role-match |
| `src/app/api/spaces/[spaceId]/screen-share/claim/route.ts` | route | request-response | `src/app/api/spaces/knock/request/route.ts` | role-match |
| `src/app/api/spaces/[spaceId]/screen-share/release/route.ts` | route | request-response | `src/app/api/spaces/knock/request/route.ts` | role-match |
| `src/app/api/spaces/[spaceId]/screen-share/active/route.ts` | route | request-response | `src/app/api/spaces/knock/pending/route.ts` | role-match |
| `src/repositories/screen-share-lease-repository.ts` (only if route boundary needs it) | repository | CRUD | `src/repositories/implementations/supabase/SupabaseSpaceRepository.ts` | partial |
| `src/lib/webrtc/WebRTCManager.ts` | service | streaming | itself | exact extension |
| `src/contexts/AudioContext.tsx` | provider | event-driven | itself | exact extension |
| `src/hooks/realtime/useAudioSignaling.ts` | hook | pub-sub | itself | exact extension |
| `src/components/floor-plan/ScreenShareControls.tsx` | component | request-response | `src/components/floor-plan/SpaceAudioControls.tsx` | role-match |
| `src/components/floor-plan/FloorPlanPresentationStage.tsx` | component | streaming | `src/components/floor-plan/SpaceAudioControls.tsx` | partial |
| `src/components/floor-plan/FloorPlanToolbar.tsx` | component | request-response | itself | exact extension |
| `src/components/floor-plan/floor-plan.tsx` | component | event-driven | itself | exact extension |
| `__tests__/webrtc-manager.test.ts` | test | streaming | `__tests__/audio-signaling.test.tsx` | partial |
| `__tests__/screen-share-context.test.tsx` | test | event-driven | `__tests__/audio-context.test.tsx` | role-match |
| `__tests__/floor-plan-presentation-stage.test.tsx` | test | streaming | `__tests__/audio-context.test.tsx` | partial |
| `__tests__/presence-db/screen-share-lease.test.ts` | test | CRUD | `__tests__/presence-db/phase6-realtime.test.ts` | partial |
| `__tests__/presence-db/screen-share-realtime-policy.test.ts` | test | pub-sub | `__tests__/presence-db/phase6-realtime.test.ts` | exact |

## Pattern Assignments

### `src/lib/webrtc/WebRTCManager.ts` (service, streaming)

**Analog:** same file; extend the single room-scoped manager rather than create a call subsystem.

**Imports and typed event boundary** (`src/lib/webrtc/WebRTCManager.ts:14-37`):
```ts
import { getIceServers, ROOM_LIMITS } from './ice-config';
import { VoiceActivityDetector } from '@/lib/audio/VoiceActivityDetector';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface WebRTCManagerEvents {
  onPeerConnected: (userId: string) => void;
  onPeerDisconnected: (userId: string) => void;
  onPeerSpeaking: (userId: string, isSpeaking: boolean) => void;
  onError: (error: Error) => void;
}
```

**Existing listen-only and explicit-capture pattern** (`:60-86`): `initializeLocalStream()` is only invoked by the provider action, obtains audio with browser media APIs, starts muted, adds tracks to existing peers, reports via `onError`, then rethrows. Keep display capture in a separate `startScreenShare(stream, shareId)` path; it must not call this microphone initializer.

**Peer lifecycle and teardown pattern** (`:245-300`, `:389-473`): create one `RTCPeerConnection` per peer with `getIceServers()`, attach existing tracks, route `ontrack`, send ICE through the assigned channel, and remove every connection, track, DOM media element, VAD, interval, and channel reference during cleanup. Replace manual offer creation (`:92-128`, `:163-177`) with a complete per-peer perfect-negotiation state before display tracks are added or removed.

**Remote media split requirement:** Current `handleRemoteTrack` (`:303-338`) unconditionally creates an `<audio>` element and VAD. Preserve that audio path, but route `event.track.kind === 'video'` into a distinct remote-display map/event for the React stage; never feed a display stream to `audioEl`.

---

### `src/contexts/AudioContext.tsx` (provider, event-driven)

**Analog:** same file.

**Room ownership / stale callback fence** (`src/contexts/AudioContext.tsx:56-95`, `:97-167`):
```ts
const webrtcManager = ownedWebrtcManager &&
  ownedWebrtcManager.spaceId === spaceId &&
  ownedWebrtcManager.userId === currentUserId
  ? ownedWebrtcManager.manager
  : null;

if (managerRef.current !== manager) return;
...
return () => {
  manager.cleanup();
  updateOwnedWebrtcManager(null);
  managerRef.current = null;
  updateIsMutedState(true);
  updateIsAudioEnabled(false);
};
```
Expose share state/actions from this same provider, fence all manager events by identity, and stop/release display media in this cleanup on current-space change. The stage must receive no state from an old manager.

**Gesture, state, and browser-error treatment** (`:169-225`): async action sets loading/error first, calls the manager only from the UI gesture, discriminates `DOMException.name`, returns `boolean`, and clears loading in `finally`. Apply the same structure for `getDisplayMedia`, including `NotAllowedError`, `InvalidStateError`, `NotFoundError`, `NotReadableError`, `AbortError`, conflict, and track `ended` release.

**Invariant:** sharing must leave `isMuted`, `isAudioEnabled`, and microphone tracks untouched (`:192-202`).

---

### `src/hooks/realtime/useAudioSignaling.ts` (hook, pub-sub)

**Analog:** same file.

**Channel identity and stale-channel guard** (`src/hooks/realtime/useAudioSignaling.ts:123-147`):
```ts
const channel = supabase.channel(channelName, { config: { ... } });
let cancelled = false;
channelRef.current = channel;
const isCurrentChannel = () => !cancelled && channelRef.current === channel;
const runCurrentHandler = (handler: () => Promise<void>) => {
  if (!isCurrentChannel()) return;
  void handler().catch((error: unknown) => {
    if (isCurrentChannel()) console.error('[AudioSignaling] Signaling handler failed:', error);
  });
};
```
Change the existing `room:audio:${spaceId}` channel to the private company-and-space topic only after its RLS migration exists. Add `companyId` and the active Presence session identity to the hook/provider boundary; all subscriptions and callbacks remain scoped to them.

**Subscribe then track/handshake pattern** (`:172-205`): assign the channel to the manager, `track` the scoped metadata, recheck cancellation after awaits, then handshake. Parse every Broadcast payload using the new Zod contract before calling the manager; TypeScript payload annotations alone are not validation.

**Exact cleanup** (`:207-220`): clear manager channel/ref only if it is the current channel, then call `supabase.removeChannel(channel)`. Retain and extend this fence for old-space callbacks.

---

### `src/lib/webrtc/screen-share-contract.ts` (utility, transform)

**Analog:** `src/lib/presence/knock-contract.ts`.

**Schema/type convention** (`src/lib/presence/knock-contract.ts:1-8`, `:26-60`):
```ts
import { z } from 'zod';

export const knockRequestBodySchema = z.object({
  sessionId: z.string().uuid(),
  spaceId: z.string().uuid(),
  requestId: z.string().uuid(),
});
export type KnockRpcResult = z.infer<typeof knockRpcResultSchema>;
```
Define UUID-scoped claim/release/active result schemas and discriminated public result/error codes here. Reuse them for API bodies and untrusted Realtime `handshake`/SDP/ICE/presenter hints. Do not cast external payloads.

**Public-response filtering** (`:80-89`): follow `toPublicKnockRpcResult` if the RPC result includes presence session fences, access revisions, or other server-only fields.

---

### screen-share API routes (route, request-response)

**Files:** `claim/route.ts`, `release/route.ts`, `active/route.ts`.

**Closest analog:** `src/app/api/spaces/knock/request/route.ts`.

**Authorization, validation, and RPC structure** (`src/app/api/spaces/knock/request/route.ts:71-150`):
```ts
const auth = await requireVerifiedPresenceAuth();
if (!auth.ok) {
  return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
}
const body = await request.json().catch(() => null);
const parsedBody = knockRequestBodySchema.safeParse(body);
if (!parsedBody.success) {
  return NextResponse.json({ error: knockErrorMessage('INVALID_REQUEST'), code: 'INVALID_REQUEST' }, { status: 400 });
}
const result = await auth.admin.rpc('create_knock_request_observed', rpcArguments);
```
Derive app user, company, and verified auth-session server-side. The claim/release RPC must receive the app user ID from `auth.identity.appUserId`, exact auth session ID, and validated presence session ID; never accept a client-selected presenter or company as authority. Claim must lock/revalidate current qualifying occupancy, company, space, and session fence atomically. Release must require owner + `shareId` and be idempotent. Active is a read/reconciliation endpoint, not a client cache authority.

**Response/error/observability pattern** (`:79-104`, `:131-162`): create one correlation ID, emit structural codes without sensitive payloads, map typed conflicts to status codes, include `Retry-After` only for classified retryable work, and return sanitized 500/503 errors.

**Repository option:** Only add `src/repositories/screen-share-lease-repository.ts` if routes otherwise repeat cohesive data access. Construct it from the verified server Supabase client in the route. No direct repository analog was found for this RPC-centric Presence boundary; the preferred analog is the route above, not a thin wrapper.

---

### `supabase/migrations/<timestamp>_screen_share_lease_and_media_realtime.sql` (migration, CRUD)

**Analog:** `supabase/migrations/20260718204506_phase6_private_company_presence.sql`.

**Transactional policy/readback shape** (`:1-5`, `:47-85`, `:87-131`):
```sql
begin;

drop policy if exists phase6_company_presence_receive on realtime.messages;
create policy phase6_company_presence_receive
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'presence'
  and (select realtime.topic()) = 'company:' || private.current_presence_company_id()::text || ':presence'
  and private.is_presence_auth_session_unfenced()
);
...
commit;
```
Use an atomic lease table/RPC keyed by `space_id`, short expiry/heartbeat, owner app-user ID, `share_id`, and auth/presence-session fences. RLS/policies must map `auth.uid()` through `users.supabase_uid`, never compare `users.id` directly to `auth.uid()`. For the new private media topic, add only exact Broadcast/Presence policy operations needed by the channel and finish with catalog/RPC/grant/policy readback that fails the migration if incomplete.

Do not apply this migration to any online target during implementation without explicit target authorization. The private client channel cannot deploy as a required contract before this migration has been applied and read back on that target.

---

### `src/components/floor-plan/ScreenShareControls.tsx` (component, request-response)

**Analog:** `src/components/floor-plan/SpaceAudioControls.tsx`.

**Imports, tooltip, and compact action pattern** (`src/components/floor-plan/SpaceAudioControls.tsx:16-45`, `:105-130`):
```tsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon" onClick={handleEnableAudio} disabled={isInitializing}>
        <Mic className="size-4 text-muted-foreground" />
      </Button>
    </TooltipTrigger>
    <TooltipContent><p>Entrar no áudio</p></TooltipContent>
  </Tooltip>
</TooltipProvider>
```
Use an explicit click handler to open the display picker; provide loading, busy-presenter, permission/cancellation, and retry states. Match the existing button/tooltip/accessibility conventions. Sharing control must not initialize, mute, or unmute audio.

---

### `src/components/floor-plan/FloorPlanPresentationStage.tsx` (component, streaming)

**Analog:** partial match with `SpaceAudioControls.tsx`; no existing remote-video React stage exists.

Use a client component with an owned `HTMLVideoElement` ref and `autoPlay`, `playsInline`, and muted local preview only when appropriate. Consume the canonical presenter/share state from the provider/authorized active reconciliation, and attach only the remote display stream selected by that canonical `shareId`. Keep expand/collapse state local to the viewer (`useReducerState` is the local state convention in the floor-plan), restore the stable layout when stream/lease ends, and do not write viewer preferences to Presence, Broadcast, or the database.

---

### `src/components/floor-plan/FloorPlanToolbar.tsx` and `floor-plan.tsx` (components, request-response/event-driven)

**Toolbar analog:** `src/components/floor-plan/FloorPlanToolbar.tsx:3-19`, `:63-86`.
```tsx
{selectedSpace && (
  <>
    <SpaceAudioControls />
    <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={onOpenSelectedChat}>
      <MessageSquare className="size-4" />
      Chat in Room
    </Button>
  </>
)}
```
Place `ScreenShareControls` beside `SpaceAudioControls`, gated by the authoritative `currentSpaceId`, not merely visual `selectedSpace`. If the button is rendered within a clickable space/card in a later layout, add `data-space-action` and stop the parent card navigation protocol.

**Floor-plan lifecycle analog:** `src/components/floor-plan/floor-plan.tsx:148-151`, `:394-465`.
```tsx
const currentSpaceId = currentUserPresence?.isOccupyingCurrentSpace
  ? currentUserPresence.currentSpaceId ?? undefined
  : undefined;

return <AudioProvider spaceId={currentSpaceId} userId={currentUserProfile?.id}>
  ...
</AudioProvider>;
```
Mount the stage under this same provider and derive media participation only from the authoritative Presence snapshot's qualifying occupancy. Do not add another placement writer, call `/api/users/location`, or treat Realtime media metadata as authority. A confirmed move naturally unmounts the provider and must fully release the previous media lease/tracks/channel before new-space state can commit.

---

### Tests (test)

**Provider/context analog:** `__tests__/audio-context.test.tsx:79-141`. Mock manager construction, render a probe through the provider, rerender from room A to room B, then assert old manager cleanup and ignored late callbacks. Add display-specific variants for denial/cancel, conflict, `track.ended`, presenter departure, and no microphone side effect.

**Realtime hook analog:** `__tests__/audio-signaling.test.tsx:71-93`, `:127-177`. Use deferred promises and captured channel handlers to prove cleanup prevents late handshake/display events from the old room. Add invalid-payload tests that prove schemas reject malformed SDP/ICE/presenter data before manager calls.

**Real DB policy analog:** `__tests__/presence-db/phase6-realtime.test.ts:29-65`, `:68-207`. Use `PresenceFixtures`, isolated random company/users/sessions/topics, explicit `request.jwt.claims` and `realtime.topic`, transaction rollback, and assertions for allowed own scope plus denied cross-company, invalid-session, revoked-session, and wrong-extension paths. A mocked test cannot establish lease concurrency, RLS, or Realtime authorization.

**Manager test gap:** No direct unit analog for fake `RTCPeerConnection`; create `__tests__/webrtc-manager.test.ts` with a focused fake that proves perfect-negotiation collision handling, ignored ICE for ignored offers, add/remove display sender, a peer joining during a share, remote audio/video separation, and complete cleanup.

---

### Planning/config files

**Scope documents:** Update `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md` together: retain VID-01, VID-02, VID-04; mark basic VID-03 optional; defer VID-05–VID-10 and mandatory nine-person video. These are scope-contract edits, not application behavior.

**Dependency manifest:** `package.json:38-75` is the exact dependency ordering/style analog. Declare direct production `zod` at the researched pinned version and update the lockfile through npm; do not update React, Next, or Supabase as part of this phase.

## Shared Patterns

### Presence authority and identity
**Sources:** `.agents/skills/presence-safety/references/state-model.md:3-20,24-31`; `src/components/floor-plan/floor-plan.tsx:148-151`.

The database snapshot/RPC is the authority for company, current qualifying occupancy, eligibility, and the one-presenter lease. Broadcast and Presence may carry signaling/invalidation hints only; they never grant access, choose a presenter, or change placement. Scope every request/channel/async completion by company ID and application user ID, fence old callbacks, and derive auth identity through `users.supabase_uid`.

### Server authentication, external validation, and errors
**Sources:** `src/app/api/spaces/knock/request/route.ts:107-150`; `src/lib/presence/knock-contract.ts:1-8,80-110`.

Routes use verified server auth, Zod `safeParse` at the request boundary, typed RPC result parsing, public-field filtering, explicit status mapping, correlation/structural observability, and sanitized internal failures. The same Zod boundary is required for Broadcast payloads before WebRTC processing.

### Realtime lifecycle
**Source:** `src/hooks/realtime/useAudioSignaling.ts:123-220`.

Use one private company/space media channel with exact cleanup via `removeChannel`; a generation/ref guard prevents old space events from updating a new manager. RLS authorizes the topic, but local teardown remains immediate on space/auth/company change. Reconcile active presentation through the authorized endpoint after subscribe/reconnect; never infer canonical state from a `SUBSCRIBED` callback or a Broadcast event alone.

### Database/rollout safety
**Sources:** `CLAUDE.md:131-163`; `.agents/skills/presence-safety/references/testing.md:13-24`.

This phase requires a local migration plus Supabase/RLS review. Online target is not authorized by this planning work. Before application code depends on the private channel/lease, apply the migration to the explicitly authorized target, read back functions/grants/RLS/realtime policies there, and run a real multi-user smoke test. Existing P2P audio must remain listen-only until an explicit microphone gesture.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/components/floor-plan/FloorPlanPresentationStage.tsx` | component | streaming | No existing React remote-video/stage component; follow the provider and compact-control conventions above. |
| `__tests__/webrtc-manager.test.ts` | test | streaming | No existing fake-RTCPeerConnection test; create a focused browser-API fake rather than copying an unrelated test. |

## Metadata

**Analog search scope:** `src/lib/webrtc`, `src/contexts`, `src/hooks/realtime`, `src/components/floor-plan`, `src/app/api/presence`, `src/app/api/spaces`, `src/lib/presence`, `supabase/migrations`, and `__tests__`.
**Files scanned:** 15 source, migration, and test analogs.
**Pattern extraction date:** 2026-07-22.
