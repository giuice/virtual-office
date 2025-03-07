
# Product Requirements Document (PRD) for Virtual Office App

## App Overview
The virtual office app is a digital workspace designed to enhance collaboration for remote and hybrid teams by simulating a physical office environment. It provides an interactive, user-friendly platform for seamless connection, communication, and collaboration. Key features include a top-down virtual office layout with configurable team rooms, user avatars with status indicators, and a navigation bar for quick access to a global blackboard and user profiles. The design remains minimalist, leveraging light colors and flat design elements for a modern, approachable interface.

**Target Audience:** Remote workers, hybrid teams, and organizations seeking efficient digital collaboration tools.

---

## Database & Data Storage
The database is now a priority to support real-time features, user management, and AI capabilities. It ensures data persistence, security, and company-based access control.

### Database Choice
- **Primary Choice: Firebase Cloud Firestore**
  - A NoSQL, real-time database integrated with Firebase Authentication for scalability and ease of use.

### Schema Design
- **Collections:**
  - **`companies`**: Stores organization data (`companyId`, `name`, `adminIds`, `createdAt`, `settings`).
  - **`users`**: Manages user profiles (`userId`, `companyId`, `email`, `displayName`, `avatarUrl`, `status`, `preferences`, `role`, `lastActive`).
  - **`rooms`**: Tracks team rooms (`roomId`, `companyId`, `name`, `isLocked`, `occupants`, `createdBy`, `createdAt`).
  - **`messages`**: Stores chat and transcripts (`messageId`, `roomId` or `recipientId`, `senderId`, `content`, `timestamp`, `type`).
  - **`announcements`**: Holds global blackboard posts (`announcementId`, `companyId`, `content`, `postedBy`, `timestamp`, `expiration`).
  - **`meetingNotes`**: Archives AI-generated notes (`noteId`, `roomId`, `meetingDate`, `transcript`, `summary`, `actionItems`, `generatedBy`, `editedBy`).

### Security Rules
- Use Firebase Authentication and Firestore security rules to enforce company-based access (e.g., users only access data within their `companyId`).

### Indexes
- Create composite indexes for efficient queries (e.g., `users`: `companyId` + `status`, `messages`: `roomId` + `timestamp`).

---

## Core Features

### Existing Features (MVP)
- **User Authentication and Security**
  - Login via Email/Password or OAuth (Firebase Authentication already implemented).
  - Data encryption and secure session management in place.
- **Virtual Office Layout & Navigation**
  - Top-down interactive floor plan with clickable team rooms.
  - Navigation bar with search and profile access.
- **Team Rooms & Real-Time Communication**
  - Avatars with mic toggle, screen sharing, and calling features.
  - Admin controls to lock/unlock rooms.
- **User Profiles**
  - Basic avatar customization and status indicators.

### Planned Enhancements: AI-Powered Communication & Collaboration
These features leverage the database for storing and retrieving AI-generated content.

#### Near-Term AI Features
1. **Real-Time Translation & Transcription:** Live speech-to-text and translation saved in `messages`.
2. **AI-Based Meeting Notes:** Auto-capture and store notes in `meetingNotes`.
3. **AI-Generated Summaries & Recaps:** Summarize transcripts, saved in `meetingNotes`.
4. **Task Suggestions and Reminders:** Detect tasks from `messages` and store in `meetingNotes`.
5. **Intelligent Presence & Schedule Alerts:** Monitor `users.status` for alerts.
6. **Personal AI Assistant for Users:** Query `messages` and `meetingNotes`.
7. **AI-Powered Search and Memory:** Search across `messages`, `meetingNotes`, and `announcements`.

#### Future AI Enhancements
1. **Participant Sentiment Analysis:** Analyze `messages` and `meetingNotes`.
2. **AI Receptionist / Assistant in Rooms:** Manage `rooms` entry.
3. **Dynamic Room Adjustments:** Suggest changes based on `rooms` data.
4. **AI Coaching and Feedback:** Provide feedback using `messages` and `meetingNotes`.

---

# Planning

## Step 1: Define Epics
The epics are restructured to prioritize database setup and reflect dependencies on data storage, while incorporating existing progress.

### Epic 1: Database Setup and Company Management
- **Focus:** Initialize Firestore, define schemas, and implement company-based access.
- **User Stories:**
  - As a company admin, I want to create and manage my organization’s workspace so my team can collaborate effectively.
  - As a user, I want my data tied to my company for privacy and organization.
- **Sample Tasks:**
  - Initialize Firestore and define collections (`companies`, `users`, `rooms`, etc.).
  - Implement security rules for company-based access.
  - Set up composite indexes for efficient querying.
  - Develop company creation and user invitation flow.
  - Test data isolation between companies.

### Epic 2: User Authentication and Security
- **Focus:** Enhance existing login/logout with database integration for `companies` and `users`.
- **User Stories:**
  - As a user, I want to log in securely and join my company’s workspace.
  - As an admin, I want to manage user roles within my company.
- **Sample Tasks:**
  - Integrate existing authentication with `companies` and `users` collections.
  - Develop role-based access control (admin vs. member).
  - Enhance session management with database persistence.
  - Test authentication flows across companies.

### Epic 3: Virtual Office Layout and Navigation
- **Focus:** Enhance existing layout with data from `rooms` and `users`.
- **User Stories:**
  - As a user, I want to see my company’s office layout and navigate easily.
- **Sample Tasks:**
  - Update floor plan to fetch rooms from `rooms` collection based on `companyId`.
  - Implement real-time updates for room status and occupancy.
  - Enhance search functionality for rooms and users tied to `companyId`.
  - Test navigation bar integration with database.

### Epic 4: Team Rooms and Real-Time Communication
- **Focus:** Expand collaboration features using `rooms` and `messages`.
- **User Stories:**
  - As a team member, I want real-time communication within my company’s rooms.
  - As an admin, I want to control room access.
- **Sample Tasks:**
  - Enhance room UI with user presence data from `users`.
  - Integrate Socket.io with `rooms` and `messages` for real-time sync.
  - Store and retrieve messages in `messages` collection.
  - Test audio/video integration (WebRTC) with database-backed rooms.

### Epic 5: Global Blackboard
- **Focus:** Add announcements stored in `announcements`.
- **User Stories:**
  - As an admin, I want to post company-wide updates.
  - As a user, I want to see announcements from my company.
- **Sample Tasks:**
  - Develop announcements UI.
  - Implement announcement creation for admins, storing in `announcements`.
  - Fetch and display announcements based on `companyId`.
  - Enable real-time updates for new announcements.

### Epic 6: User Profiles
- **Focus:** Enhance profiles with data stored in `users`.
- **User Stories:**
  - As a user, I want to customize my profile within my company’s workspace.
- **Sample Tasks:**
  - Update avatar display and status indicators with `users` collection.
  - Develop profile customization, saving to `users` preferences.
  - Create user settings page tied to `users`.
  - Test profile updates across sessions.

### Epic 7: AI-Powered Communication Enhancements (Near-Term AI Features)
- **Focus:** Integrate AI tools to enhance collaboration, leveraging the database.
- **User Stories & Sample Tasks:**
  - **User Story 7.1 (Real-Time Translation & Transcription):**
    - *As a user, I want live speech-to-text and translation.*
    - Tasks: Research speech-to-text/translation APIs; integrate with WebRTC; store in `messages`.
  - **User Story 7.2 (AI-Based Meeting Notes):**
    - *As a user, I want automatic meeting notes.*
    - Tasks: Capture audio; transcribe with NLP; store in `meetingNotes`.
  - **User Story 7.3 (AI-Generated Summaries & Recaps):**
    - *As a user, I want meeting summaries.*
    - Tasks: Generate summaries from transcripts; save in `meetingNotes`.
  - **User Story 7.4 (Task Suggestions and Reminders):**
    - *As a user, I want task suggestions from discussions.*
    - Tasks: Detect tasks in `messages`; integrate with calendar APIs.
  - **User Story 7.5 (Intelligent Presence & Schedule Alerts):**
    - *As a user, I want alerts when colleagues are available.*
    - Tasks: Monitor `users.status`; implement notifications.
  - **User Story 7.6 (Personal AI Assistant for Users):**
    - *As a user, I want an AI assistant to retrieve information.*
    - Tasks: Build chatbot; query `messages` and `meetingNotes`.
  - **User Story 7.7 (AI-Powered Search and Memory):**
    - *As a user, I want to search past interactions.*
    - Tasks: Index `messages`, `meetingNotes`; integrate AI search.

### Epic 8: Future AI Enhancements (Advanced AI Features)
- **Focus:** Advanced AI analytics and assistance.
- **User Stories & Sample Tasks:**
  - **User Story 8.1 (Participant Sentiment Analysis):**
    - *As an admin, I want to gauge meeting sentiment.*
    - Tasks: Evaluate sentiment tools; analyze `messages` and `meetingNotes`.
  - **User Story 8.2 (AI Receptionist / Assistant in Rooms):**
    - *As a visitor, I want an AI receptionist.*
    - Tasks: Design AI interface; integrate with `rooms`.
  - **User Story 8.3 (Dynamic Room Adjustments):**
    - *As an admin, I want AI to suggest room changes.*
    - Tasks: Analyze `rooms` data; prototype UI suggestions.
  - **User Story 8.4 (AI Coaching and Feedback):**
    - *As a user, I want feedback on participation.*
    - Tasks: Research analysis models; build feedback module.

---

## Step 2: Detailed Planning & Sprint Setup

### Environment Setup (Pre-Sprint)
- **Task 0.1:** Initialize Next.js project with TypeScript (done).
- **Task 0.2:** Install Tailwind CSS and Shadcn UI (done).
- **Task 0.3:** Set up ESLint, Prettier, and Git repository (done).
- **Task 0.4:** Configure Firebase (Authentication + Firestore partially done; expand for full schema).

### Sprint 1: Database and Core MVP Enhancements (Weeks 1-2)
**Focus:** Epics 1, 2, 3, and 6
- **Epic 1:** Database schema, security rules, company management.
- **Epic 2:** Integrate existing authentication with database.
- **Epic 3:** Update virtual office layout with database.
- **Epic 6:** Enhance user profiles with database storage.
- **Sample Tasks:**
  - Define Firestore schema and security rules.
  - Implement company creation and user invitation flow.
  - Update authentication to store user data in `users`.
  - Fetch rooms from `rooms` for floor plan.
  - Save profile customizations to `users`.
  - Test data persistence and company isolation.

### Sprint 2: Real-Time Features and Initial AI (Weeks 3-4)
**Focus:** Epics 4 and 7 (partial)
- **Epic 4:** Enhance team rooms with database-backed real-time communication.
- **Epic 7:** Add Real-Time Translation & Transcription, AI-Based Meeting Notes.
- **Sample Tasks:**
  - Integrate Socket.io with `rooms` and `messages`.
  - Enhance mic toggle and screen sharing with message storage.
  - Integrate speech-to-text API; save transcripts in `messages`.
  - Generate and store meeting notes in `meetingNotes`.
  - Test real-time sync and AI outputs.

### Sprint 3: Expand AI and Polish (Weeks 5-6)
**Focus:** Epics 5 and 7 (remaining)
- **Epic 5:** Implement global blackboard with announcements.
- **Epic 7:** Add Task Suggestions, Presence Alerts, AI Assistant, Search.
- **Sample Tasks:**
  - Build blackboard UI; store announcements in `announcements`.
  - Detect tasks from `messages`; integrate reminders.
  - Monitor `users.status` for alerts.
  - Develop AI assistant and search tied to database.
  - Conduct user testing and refinements.

### Future Sprints: Advanced AI Features (Post-MVP)
**Focus:** Epic 8
- Plan for advanced AI features after MVP stabilization based on user feedback.

---

## Non-Functional Requirements (Throughout Development)
- **Performance:** Page load < 2s, real-time latency < 100ms.
- **Security:** HTTPS, Firebase security rules, data encryption.
- **Accessibility:** WCAG 2.1 Level AA.
- **Scalability:** Support 100 to 1,000+ concurrent users.

---

## Final Notes
- **Budget & Timeline:** Leverage free/low-cost tools (Firebase, Socket.io) for MVP; scale as needed.
- **User Onboarding:** Add tutorials for company setup and AI features.
- **Testing & Feedback:** Conduct regular testing to ensure usability and performance.
