# Product Requirements Document (PRD) for Virtual Office App

## App Overview
The virtual office app is a digital workspace designed to enhance collaboration for remote and hybrid teams by simulating a physical office environment. It provides an interactive, user-friendly platform for seamless connection, communication, and collaboration. Key features include an interactive virtual office layout with configurable spaces (rooms), user avatars with status indicators, real-time messaging, meeting tools, and administrative controls. The design leverages TailwindCSS and Shadcn/UI for a modern, approachable interface.

**Target Audience:** Remote workers, hybrid teams, and organizations seeking efficient digital collaboration tools.

---

## Database & Data Storage
The database is crucial for supporting real-time features, user management, space configuration, messaging, and AI capabilities. It ensures data persistence, security, and company-based access control using Supabase.

### Database Implementation
- **Current Implementation: Supabase (PostgreSQL)**
  - A Backend-as-a-Service platform providing a PostgreSQL database, authentication, real-time subscriptions, and storage.
  - Integrated via the `@supabase/supabase-js` client library.
  - Leverages Repository Pattern for data access abstraction.

### Table Structure (Supabase Schema)
- **Tables:**
  - **`companies`**: Stores organization data (`id`, `name`, `admin_ids`, `created_at`, `settings`).
  - **`users`**: Manages user profiles (`id`, `firebase_uid` (legacy/optional), `company_id`, `email`, `display_name`, `avatar_url`, `status`, `preferences`, `role`, `last_active`).
  - **`spaces`**: Tracks virtual spaces/rooms (`id`, `company_id`, `name`, `type`, `status`, `capacity`, `features`, `position`, `user_ids`, `description`, `access_control`, `created_by`, `is_template`).
  - **`space_reservations`**: Manages booking of spaces (`id`, `space_id`, `user_id`, `start_time`, `end_time`, `purpose`).
  - **`conversations`**: Represents chat threads (`id`, `type`, `participants`, `last_activity`, `name`, `is_archived` (deprecated), `unread_count`, `room_id`, `visibility`, `participants_fingerprint`).
  - **`conversation_preferences`**: Per-user conversation settings (`id`, `conversation_id`, `user_id`, `is_pinned`, `pinned_order`, `is_starred`, `is_archived`, `notifications_enabled`, `created_at`, `updated_at`).
  - **`messages`**: Stores chat messages (`id`, `conversation_id`, `sender_id`, `content`, `timestamp`, `type`, `status`, `reply_to_id`, `is_edited`).
  - **`message_attachments`**: Stores message file attachments (`id`, `message_id`, `name`, `type`, `size`, `url`, `duration`, `waveform_data`, `transcription`).
  - **`message_reactions`**: Tracks reactions to messages (`id`, `message_id`, `user_id`, `emoji`).
  - **`message_read_receipts`**: Tracks message read status per user (`id`, `message_id`, `user_id`, `read_at`).
  - **`message_pins`**: User-specific pinned messages (`id`, `message_id`, `user_id`, `pinned_at`).
  - **`message_stars`**: User-specific starred/bookmarked messages (`id`, `message_id`, `user_id`, `starred_at`).
  - **`announcements`**: Holds company-wide posts (`id`, `company_id`, `title`, `content`, `posted_by`, `timestamp`, `expiration`, `priority`).
  - **`meeting_notes`**: Archives meeting details (`id`, `room_id`, `title`, `meeting_date`, `transcript`, `summary`, `generated_by`, `edited_by`).
  - **`meeting_note_action_items`**: Tracks tasks from meetings (`id`, `note_id`, `description`, `assignee_id`, `due_date`, `completed`).
  - **`invitations`**: Manages user invitations to companies (`token`, `email`, `company_id`, `role`, `expires_at`, `status`).
  - **`space_members`**: Manages explicit space membership (`id`, `space_id`, `user_id`, `role`, `joined_at`).
  - **`space_presence_log`**: Tracks space entry/exit for analytics (`id`, `space_id`, `user_id`, `entered_at`, `exited_at`, `session_type`, `context`).

### Security and Access Control
- **Space-Level Access Control**
  - Explicit membership tracking via `space_members` table
  - Role-based permissions (member, admin, director)
  - "Knock to Enter" workflow for restricted spaces
  - Cross-space calling capability
  
- **Message Visibility**
  - Public messages visible to all space members
  - Private messages for specific participants
  - Direct messages between two users
  
- **Supabase RLS Policies**
  - Fine-grained access control at row level
  - Automatic filtering based on user roles and space membership
  - Secure message visibility enforcement

- **Supabase Authentication** for user login and session management.
- **Supabase Row Level Security (RLS)** policies for fine-grained data access control.
- **Repository Pattern** enforces data access rules within the application logic.
- API routes protected via middleware and session checks.

### Analytics & Monitoring
- **Presence Tracking**
  - Detailed entry/exit logging
  - Session duration analysis
  - Interaction patterns
  - Meeting analytics

---

## Core Features

### Implemented Features
- **User Authentication and Security**
  - Login via Email/Password (Supabase Auth).
  - Secure session management.
  - Role-based access (Admin/Member).
- **Company Management**
  - Company creation and settings.
  - User invitation system.
  - Member management.
- **Virtual Office Layout & Navigation**
  - Interactive floor plan using Konva.
  - Draggable spaces, zoom/pan.
  - Real-time user presence indicators on the floor plan.
- **Space (Room) Management**
  - Creation, editing, deletion of spaces.
  - Space templates.
  - Space reservation system.
- **Real-Time Communication**
  - Text-based chat within spaces and direct messages.
  - Message threads and replies.
  - Message reactions with emoji support.
  - File attachments including voice notes with metadata (duration, waveform, transcription).
  - Read receipts and message status tracking.
  - Per-user message pinning and starring.
  - Per-user conversation preferences (pin/star/archive/notifications).
  - Grouped conversation views (DMs vs. rooms).
  - DM deduplication via participant fingerprinting.
  - Real-time updates via Supabase Realtime / Socket.IO.
- **User Profiles**
  - Profile display with avatar, name, status.
  - Status indicators (online, away, etc.).

### In Progress / Planned Features
- **Unified Messaging System:** (In Progress) Enhanced messaging with unified drawer UX, per-user preferences, message pins/stars, read receipts, voice notes, offline reliability.
- **Meeting Notes System:** (In Progress) AI-generated notes, summaries, action items.
- **Announcement System:** (In Progress) Company-wide announcements with priority.
- **Enhanced Communication Tools:** (Planned) Video conferencing, screen sharing, virtual whiteboard.
- **Administrative Dashboard:** (Planned) Usage analytics, user monitoring, system health.

### AI-Powered Features (Planned/Near-Term)

1. **Real-Time Translation & Transcription**
   - Live speech-to-text and translation saved in `messages` table.
   - Integration with meeting notes and chat messages.

2. **AI-Based Meeting Notes**
   - Auto-capture and store notes in `meeting_notes` table.
   - Generate structured summaries and action items.

3. **AI-Generated Summaries & Recaps**
   - Summarize transcripts and discussions.
   - Store in `meeting_notes.summary` field.

4. **Task Suggestions and Reminders**
   - Detect tasks from messages and meetings.
   - Store in `meeting_note_action_items` table.
   - Integrate with user calendars.

5. **Intelligent Presence & Schedule Alerts**
   - Monitor `users.status` and activity patterns.
   - Provide smart availability predictions.

6. **Personal AI Assistant for Users**
   - Context-aware assistance using data from:
     - `messages` (conversation history)
     - `meeting_notes` (meeting content)
     - `announcements` (company updates)

7. **AI-Powered Search and Memory**
   - Semantic search across:
     - `messages.content`
     - `meeting_notes.transcript/summary`
     - `announcements.content`

### Future AI Enhancements (Long-Term)

1. **Participant Sentiment Analysis**
   - Analyze `messages` and `meeting_notes` for emotional tone.
   - Provide insights on team dynamics.

2. **AI Receptionist / Assistant in Rooms**
   - Virtual assistant for space management.
   - Integrates with `spaces` and `users` tables.

3. **Dynamic Room Adjustments**
   - Suggest space configurations based on usage patterns.
   - Leverages `space_reservations` and `spaces` data.

4. **AI Coaching and Feedback**
   - Provide participation feedback using:
     - `messages` (communication patterns)
     - `meeting_notes` (engagement metrics)

---

# Planning

## Step 1: Define Epics (Revised for Supabase & Current Progress)

### Epic 1: Core Infrastructure & Supabase Migration (Completed)
- **Focus:** Set up Next.js, Tailwind, Supabase; migrate data model; implement Repository Pattern.
- **Status:** Done.

### Epic 2: Authentication & Company Management (Completed)
- **Focus:** Integrate Supabase Auth, implement company creation, invitations, member management.
- **Status:** Done.

### Epic 3: Interactive Floor Plan & Space Management (Completed)
- **Focus:** Build interactive canvas, implement space CRUD, reservations, real-time occupancy.
- **Status:** Done.

### Epic 4: Real-Time Messaging System (Completed - Enhancements In Progress)
- **Focus:** Implement chat, threads, reactions, attachments using Supabase Realtime / Socket.IO.
- **Status:** Core features complete. Unified messaging system enhancements in progress (see Epic 4.1).

### Epic 4.1: Unified Messaging System Enhancements (In Progress)
- **Focus:** Enhance messaging with per-user preferences, unified drawer UX, advanced features.
- **Status:** In Progress (Tasks 1.1-1.4 complete, Tasks 2.0-5.0 in progress).
- **User Stories:**
  - As a user, I want to pin/star conversations for quick access.
  - As a user, I want to archive conversations without affecting others.
  - As a user, I want to see DMs and rooms grouped separately.
  - As a user, I want to pin/star individual messages for reference.
  - As a user, I want read receipts to know when my messages are seen.
  - As a user, I want to send voice notes with visual waveforms.
  - As a user, I want reliable messaging even when offline.
- **Completed Tasks:**
  - Task 1.1: Audit messaging gaps (types, repositories, schema)
  - Task 1.2: Extend conversation repository for grouped queries and preferences
  - Task 1.3: Update conversation API routes for per-user preferences
  - Task 1.4: Extend message repository for pins/stars/read receipts
- **In Progress Tasks:**
  - Task 2.0: Unified drawer UX and conversation surfacing
  - Task 3.0: Timeline and composer feature parity
  - Task 4.0: Realtime resilience and offline reliability
  - Task 5.0: Analytics, notifications, and observability

### Epic 5: Meeting Notes System (In Progress)
- **Focus:** Develop meeting note creation, editing, AI summaries, action items.
- **User Stories:**
  - As a user, I want meeting notes automatically generated and summarized.
  - As a participant, I want action items tracked from meetings.
- **Sample Tasks:**
  - Build UI for notes display and editing.
  - Integrate transcription service (placeholder).
  - Implement action item tracking linked to users.
  - Develop AI summary generation (placeholder/future).

### Epic 6: Announcement System (In Progress)
- **Focus:** Implement company-wide announcements with priority levels.
- **User Stories:**
  - As an admin, I want to post important updates to the entire company.
  - As a user, I want to see relevant announcements.
- **Sample Tasks:**
  - Create UI for posting and viewing announcements.
  - Implement backend logic for storing and retrieving announcements via repository.
  - Add priority levels and filtering.

### Epic 7: AI-Powered Communication Enhancements (Planned)
- **Focus:** Implement AI features for enhanced collaboration.
- **User Stories:**
  - As a user, I want real-time meeting transcriptions and translations.
  - As a team, we want AI-generated meeting summaries and action items.
  - As a participant, I want an AI assistant to help find information.
- **Sample Tasks:**
  - Research/select AI services for transcription/summarization.
  - Integrate AI services with messaging and meeting systems.
  - Develop AI assistant interface.
  - Implement semantic search across messages and notes.

### Epic 8: Enhanced Communication Tools (Planned)
- **Focus:** Integrate video conferencing, screen sharing, whiteboard.
- **User Stories:**
  - As a team, we want seamless video calls and screen sharing within spaces.
  - As collaborators, we want a virtual whiteboard for brainstorming.
- **Sample Tasks:**
  - Research/select WebRTC or third-party video solution.
  - Integrate video/audio streams into space components.
  - Implement screen sharing functionality.
  - Develop or integrate a virtual whiteboard component.

### Epic 9: Administrative Dashboard & Analytics (Planned)
- **Focus:** Provide admins with tools for monitoring and managing the platform.
- **User Stories:**
  - As an admin, I want to see usage statistics and user activity.
  - As an admin, I want tools to manage users and spaces effectively.
- **Sample Tasks:**
  - Design dashboard UI.
  - Implement data aggregation for analytics (user counts, space usage, message volume).
  - Build user management interface.
  - Add system health monitoring.

---

## Step 2: Detailed Planning & Sprint Setup (Revised)

### Environment Setup (Completed)
- **Task 0.1:** Initialize Next.js project with TypeScript.
- **Task 0.2:** Install Tailwind CSS and Shadcn UI.
- **Task 0.3:** Set up ESLint, Prettier, and Git repository.
- **Task 0.4:** Configure Supabase client and environment variables.
- **Task 0.5:** Implement Repository Pattern structure.

### Recent Sprints (Completed)
- **Sprints 1-X:** Focused on Supabase migration, core feature implementation (Auth, Company, Floor Plan, Spaces, Messaging).

### Current/Upcoming Sprints (Example Focus)

#### Sprint Y: Unified Messaging System Enhancements (Current Focus)
- **Focus:** Epic 4.1
- **Sample Tasks:**
  - Complete unified messaging drawer with grouped conversations.
  - Implement per-user conversation preferences (pin/star/archive).
  - Add message pins and stars with UI affordances.
  - Implement read receipts and status tracking.
  - Add voice note support with waveform visualization.
  - Enhance realtime resilience with offline queue and retry logic.
  - Add messaging analytics and notification improvements.
  - Expand test coverage for new messaging features.

#### Sprint Y+1: Meeting Notes & Announcements
- **Focus:** Epics 5 & 6
- **Sample Tasks:**
  - Complete Meeting Notes UI and basic functionality.
  - Implement Announcement creation and display.
  - Add action item tracking.
  - Implement announcement priority.
  - Refine related repository methods and API routes.

#### Sprint Y+1: AI Features Foundation
- **Focus:** Epic 7 (Initial AI Implementation)
- **Sample Tasks:**
  - Research and select AI services for transcription/summarization.
  - Implement basic AI meeting note generation.
  - Add AI-powered search prototype.
  - Develop initial AI assistant interface.

#### Sprint Y+2: Communication Tools Integration
- **Focus:** Epic 8 (Video/Screen Share)
- **Sample Tasks:**
  - Integrate selected video conferencing solution.
  - Add screen sharing capabilities to spaces.
  - Test real-time audio/video performance.
  - Update UI to accommodate new communication controls.

#### Sprint Y+3: Admin Dashboard & Advanced AI
- **Focus:** Epics 9 & 7 (Advanced)
- **Sample Tasks:**
  - Design initial dashboard layout.
  - Implement basic usage data collection.
  - Enhance AI features with sentiment analysis.
  - Add advanced search capabilities.

---

## Non-Functional Requirements (Ongoing)
- **Performance:** Optimize queries, leverage caching (React Query), minimize bundle size.
- **Security:** Enforce Supabase RLS, validate inputs, protect API routes.
- **Accessibility:** Adhere to WCAG 2.1 Level AA guidelines.
- **Scalability:** Design database schema and queries for growth; monitor Supabase usage.
- **Maintainability:** Follow coding standards, use Repository Pattern, write clear code, add tests.

---

## Final Notes
- **Technology Choices:** Leverage Supabase features (Auth, DB, Realtime) effectively. Utilize Next.js App Router and Server Components where appropriate.
- **AI Integration:** Carefully evaluate AI services for cost, quality, and privacy considerations.
- **User Experience:** Prioritize intuitive UI/UX, especially for AI features and interactive elements.
- **Testing:** Implement comprehensive testing for AI features to ensure accuracy and reliability.
