# Requirements: Virtual Office

**Defined:** 2026-02-23
**Core Value:** When a user logs in, they instantly see where colleagues are, what's happening in each room, and can walk into any space to talk -- the end-to-end spatial office loop must work flawlessly.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Stabilization

- [ ] **STAB-01**: Floor plan space cards render at correct size matching v3 design spec (`docs/ux-space-grid-v3.html`)
- [ ] **STAB-02**: Auth login and signup flows work without errors on current branch
- [ ] **STAB-03**: Knock to Enter (Story 3-16) channel timeout issue is verified fixed or resolved
- [ ] **STAB-04**: Avatar components consolidated from 11 to 2 canonical (EnhancedAvatarV2, UploadableAvatar)

### Floor Plan Completion

- [ ] **FLOR-01**: User can request access to restricted spaces via "Knock to Enter" workflow with approval/denial by any occupant (Story 3-16)
- [ ] **FLOR-02**: Offline users automatically removed from space display within 5 seconds, with fade-out animation and presence log update (Story 3-17)
- [ ] **FLOR-03**: Admin can assign default spaces to users; first-time users placed in company default space (Story 3-18)
- [ ] **FLOR-04**: User reconnecting within 5-minute grace period auto-rejoins their last space (Story 3-18)

### Messaging Timeline

- [ ] **MSG-01**: User can see read receipts on sent messages showing who read and when (Story 4A.4)
- [ ] **MSG-02**: User can drag files into composer to attach them with upload progress and inline preview (Stories 4A.7-8)
- [ ] **MSG-03**: User can record and send voice notes with waveform visualization and playback (Story 4A.9)
- [ ] **MSG-04**: User can filter message feed to show only starred messages (Story 4A.11)

### Messaging Resilience

- [ ] **RESIL-01**: User's messages queue locally when offline and send automatically on reconnect (Story 4B.1)
- [ ] **RESIL-02**: Supabase Realtime reconnects with exponential backoff and resumes subscriptions (Story 4B.2)
- [ ] **RESIL-03**: Polling fallback fetches missed messages when Realtime is unavailable >30s (Story 4B.3)
- [ ] **RESIL-04**: User can see typing indicators when others are composing messages (Story 4B.4)
- [ ] **RESIL-05**: Read receipts sync across multiple devices in real-time (Story 4B.5)
- [ ] **RESIL-06**: Messaging analytics events tracked for latency, engagement, and health monitoring (Story 4B.6)
- [ ] **RESIL-07**: User receives desktop notifications for DMs and @mentions when app is in background (Story 4B.7)

### Meeting Notes

- [ ] **MEET-01**: User can create meeting notes for a space with title, date, participants, and rich text content (Story 5.1)
- [ ] **MEET-02**: User can add action items with assignee, due date, and completion status to meeting notes (Story 5.2)
- [ ] **MEET-03**: User can view, edit, and delete past meeting notes with version history (Story 5.3)
- [ ] **MEET-04**: User can upload external meeting transcripts (.txt, .vtt, .srt) for AI processing (Story 5.4)
- [ ] **MEET-05**: AI generates concise summary from uploaded transcript with key points, decisions, and next steps (Story 5.5)
- [ ] **MEET-06**: AI extracts action items from transcript with suggested assignees (Story 5.6)
- [ ] **MEET-07**: User can search across all meeting notes by title, content, summary, and action items (Story 5.7)
- [ ] **MEET-08**: User receives notifications when assigned action items and reminders before due dates (Story 5.8)

### Announcements

- [ ] **ANNC-01**: Admin can post company-wide announcements with priority (urgent/normal/low) and optional expiration date (Story 6.1)
- [ ] **ANNC-02**: User sees announcements prominently with banner for urgent items, read/unread tracking (Story 6.2)
- [ ] **ANNC-03**: User can filter announcements by priority, date range, and search by keyword (Story 6.3)
- [ ] **ANNC-04**: Admin can edit or delete announcements with audit trail (Story 6.4)
- [ ] **ANNC-05**: User receives desktop and email notifications for urgent announcements (Story 6.5)
- [ ] **ANNC-06**: Admin can see read count, percentage, and unread user list per announcement (Story 6.6)

### Video & Screen Sharing

- [ ] **VID-01**: WebRTC signaling infrastructure established via Supabase Realtime with STUN/TURN (Story 8.1)
- [ ] **VID-02**: User can start audio-only calls in a space with mute/unmute and speaker indicators (Story 8.2)
- [ ] **VID-03**: User can enable video during calls with grid layout up to 9 participants and spotlight mode (Story 8.3)
- [ ] **VID-04**: User can share their screen during calls with select window/tab/entire screen (Story 8.4)
- [ ] **VID-05**: Team can use shared whiteboard for real-time brainstorming with drawing tools and PNG export (Story 8.5)
- [ ] **VID-06**: Meeting organizer can record calls (audio + video + screen) saved to Supabase Storage (Story 8.6)
- [ ] **VID-07**: User can blur background or use virtual backgrounds during video calls (Story 8.7)
- [ ] **VID-08**: User can see connection quality indicators (green/yellow/red) with latency and packet loss details (Story 8.8)
- [ ] **VID-09**: User can pop out call to picture-in-picture window for multitasking (Story 8.9)
- [ ] **VID-10**: User can schedule calls via Google Calendar/Outlook integration with auto-reminders (Story 8.10)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Floor Plan

- **FLOR-05**: Mobile responsive floor plan with touch gestures and bottom sheet pattern (Story 3-14)

### Messaging

- **MSG-05**: User can scroll up through message history infinitely with auto-loading (Story 4A.5)
- **MSG-06**: Message feed auto-scrolls to new messages with "New Messages" floating button (Story 4A.6)
- **MSG-07**: User can search within conversations for specific messages with highlighting (Story 4A.10)

### AI Features (Epic 7)

- **AI-01**: Unified AI service layer with OpenAI and Anthropic implementations (Story 7.1)
- **AI-02**: Real-time meeting transcription via Whisper API (Story 7.2)
- **AI-03**: Semantic search across messages using embeddings + pgvector (Story 7.3)
- **AI-04**: AI summarization of unread conversation messages (Story 7.4)
- **AI-05**: AI meeting recaps with agenda, decisions, action items (Story 7.5)
- **AI-06**: Task and reminder extraction from messages (Story 7.6)
- **AI-07**: Smart availability predictions from presence history (Story 7.7)
- **AI-08**: Context-aware AI assistant chat with RAG (Story 7.8)
- **AI-09**: AI translation for global teams (Story 7.9)
- **AI-10**: AI-powered search suggestions (Story 7.10)
- **AI-11**: AI cost monitoring dashboard and limits (Story 7.11)
- **AI-12**: AI feature opt-out for privacy (Story 7.12)

### Admin Dashboard (Epic 9)

- **ADMIN-01**: Admin dashboard home with key metrics and trends (Story 9.1)
- **ADMIN-02**: Presence report generation with date range and CSV export (Story 9.2)
- **ADMIN-03**: Space utilization analytics with heatmaps (Story 9.3)
- **ADMIN-04**: User activity timeline view (Story 9.4)
- **ADMIN-05**: Team collaboration patterns network graph (Story 9.5)
- **ADMIN-06**: Message analytics with peak times and response times (Story 9.6)
- **ADMIN-07**: Compliance audit export with encrypted option (Story 9.7)
- **ADMIN-08**: Custom report builder with drag-and-drop metrics (Story 9.8)
- **ADMIN-09**: Real-time monitoring view with live activity feed (Story 9.9)
- **ADMIN-10**: Performance and health metrics dashboard (Story 9.10)
- **ADMIN-11**: User management tools with bulk actions (Story 9.11)
- **ADMIN-12**: Data retention and privacy controls for GDPR (Story 9.12)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mobile native apps (iOS/Android) | Web-only for now; mobile responsive in v2 |
| SSO/SAML enterprise auth | Email/password + OAuth sufficient for v1 |
| Calendar integrations | Deferred except basic in Epic 8B Story 8.10 |
| Custom branding/white-labeling | Enterprise feature for future |
| On-premise deployment | Cloud-only (Supabase hosted) |
| End-to-end encryption | Standard Supabase encryption only |
| Multi-language UI | English only |
| Project management integration | Not solving that problem |
| Sentiment analysis, AI coaching | Phase 3+ |
| Custom workflow automation | Future |
| Legacy browser support | Not supported |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| STAB-01 | Phase 1 | Pending |
| STAB-02 | Phase 1 | Pending |
| STAB-03 | Phase 1 | Pending |
| STAB-04 | Phase 1 | Pending |
| FLOR-01 | Phase 2 | Pending |
| FLOR-02 | Phase 2 | Pending |
| FLOR-03 | Phase 2 | Pending |
| FLOR-04 | Phase 2 | Pending |
| VID-01 | Phase 3 | Pending |
| VID-02 | Phase 3 | Pending |
| VID-03 | Phase 3 | Pending |
| VID-04 | Phase 3 | Pending |
| VID-05 | Phase 3 | Pending |
| VID-06 | Phase 3 | Pending |
| VID-07 | Phase 3 | Pending |
| VID-08 | Phase 3 | Pending |
| VID-09 | Phase 3 | Pending |
| VID-10 | Phase 3 | Pending |
| MSG-01 | Phase 4 | Pending |
| MSG-02 | Phase 4 | Pending |
| MSG-03 | Phase 4 | Pending |
| MSG-04 | Phase 4 | Pending |
| RESIL-01 | Phase 5 | Pending |
| RESIL-02 | Phase 5 | Pending |
| RESIL-03 | Phase 5 | Pending |
| RESIL-04 | Phase 5 | Pending |
| RESIL-05 | Phase 5 | Pending |
| RESIL-06 | Phase 5 | Pending |
| RESIL-07 | Phase 5 | Pending |
| MEET-01 | Phase 6 | Pending |
| MEET-02 | Phase 6 | Pending |
| MEET-03 | Phase 6 | Pending |
| MEET-04 | Phase 6 | Pending |
| MEET-05 | Phase 6 | Pending |
| MEET-06 | Phase 6 | Pending |
| MEET-07 | Phase 6 | Pending |
| MEET-08 | Phase 6 | Pending |
| ANNC-01 | Phase 7 | Pending |
| ANNC-02 | Phase 7 | Pending |
| ANNC-03 | Phase 7 | Pending |
| ANNC-04 | Phase 7 | Pending |
| ANNC-05 | Phase 7 | Pending |
| ANNC-06 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 41 total
- Mapped to phases: 41
- Unmapped: 0

---
*Requirements defined: 2026-02-23*
*Last updated: 2026-02-23 after phase reorder*
