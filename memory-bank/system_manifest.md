# Virtual Office System Manifest

## Project Overview
Virtual Office is a modern web application designed to create an engaging and efficient virtual workspace environment. It enables remote teams to collaborate effectively through interactive floor plans, real-time communication, and comprehensive space management.

## Core Features

### 1. Interactive Floor Plan
- Dynamic office layout visualization
- Real-time user presence
- Drag-and-drop space management
- Zoom and pan capabilities
- Grid-based positioning

### 2. Space Management
- Customizable space types (workspace, conference, social, etc.)
- Space templates
- Reservation system
- Capacity management
- Access control

### 3. Communication System
- Real-time messaging
- Thread support
- File sharing
- Reactions and emojis
- Room-specific chats
- Video conferencing (planned)

### 4. Company Management
- Multi-company support
- User role management
- Company settings
- Member invitation system

### 5. Meeting Tools
- Meeting notes
- Action item tracking
- AI-powered summaries (planned)
- Meeting transcripts (planned)

### 6. Additional Features
- Announcement system
- User presence tracking
- Administrative tools
- Analytics dashboard (planned)

## Technical Architecture

### Frontend Architecture
- Next.js 15 with App Router
- TypeScript for type safety
- TailwindCSS + Shadcn/UI for styling
- React Query for data fetching
- Zustand for state management

### Backend Architecture
- Supabase for database and auth
- Repository Pattern for data access
- Socket.IO for real-time features
- Supabase Realtime for live updates

### Data Flow
1. Client-side requests through React Query
2. Repository abstraction layer
3. Supabase data access
4. Real-time updates via Supabase Realtime/Socket.IO

### Security Model
- Role-based access control
- Supabase Row Level Security
- Protected API routes
- Typed database queries

### Access Control Architecture
1. **Space Membership System**
   - Explicit membership tracking via `space_members` table
   - Role-based permissions (member, admin, director)
   - Database-level validation of membership
   
2. **Message Visibility Controls**
   - Three visibility levels:
     - Public (all space members)
     - Private (specific participants)
     - Direct (two users only)
   - Enforced via RLS policies
   
3. **Space Entry Control**
   - Controlled access to restricted spaces
   - "Knock to Enter" workflow
   - Real-time notifications for entry requests
   - Audit logging of all entry/exit events

### Row Level Security (RLS)
1. **Space Members**
   - Users can view their own memberships
   - Admins can manage space members
   - Automatic filtering based on roles

2. **Conversations**
   - Public conversation visibility by space membership
   - Private conversation access by participant list
   - Direct message access restricted to participants

3. **Messages**
   - Access controlled by conversation visibility
   - Insert permissions validated against space membership
   - Real-time updates filtered by access rights

### Analytics & Auditing
1. **Presence Tracking**
   - Entry/exit logging
   - Session duration tracking
   - Authorization audit trail
   - Analytics for space usage

2. **Performance Monitoring**
   - Query execution time tracking
   - Real-time subscription monitoring
   - Access pattern analysis

## Development Guidelines

### Code Organization
- Feature-based directory structure
- Component composition using Atomic Design
- Repository Pattern for data access
- Custom hooks for logic reuse

### Best Practices
- Server Components for performance
- TypeScript for type safety
- ESLint + Prettier for code quality
- Component-driven development

### Testing Strategy
- Unit tests for repositories
- Integration tests for API endpoints
- E2E tests for critical flows
- Component testing with Storybook (planned)

## Deployment Architecture
- Vercel for frontend hosting
- Supabase for backend services
- Cloudflare for CDN
- Socket.IO server for real-time features

## Monitoring & Analytics
- Vercel Analytics for performance
- Error tracking (planned)
- Usage analytics (planned)
- System health monitoring (planned)

## Future Roadmap

### Short-term (1-3 months)
1. Complete Meeting Notes System
2. Enhance Announcement System
3. Implement Video Conferencing
4. Develop Administrative Dashboard

### Mid-term (3-6 months)
1. Mobile Application
2. Advanced Analytics
3. AI-powered Features
4. Third-party Integrations

### Long-term (6+ months)
1. Virtual Reality Support
2. Advanced Collaboration Tools
3. Custom Plugin System
4. Enterprise Features

## Documentation Strategy
- API documentation
- Component documentation
- User guides
- Architecture documentation

## Project Status
- Current Phase: Active Development
- Latest Version: 0.1.0
- Current Focus: Meeting Notes System & Announcements

## Implementation Details

### Database Layer
1. **Tables & Relationships**
   - New tables:
     - `space_members` for access control
     - `space_presence_log` for analytics
   - Modified tables:
     - `conversations` with visibility column

2. **Performance Optimizations**
   - New indexes:
     - Space membership queries
     - Presence log analytics
     - Message visibility filtering

### API Layer
// ...existing code...

### Security Implementations
1. **Access Control**
   - Repository methods validate access
   - API middleware checks permissions
   - Real-time subscription filtering
   
2. **Audit Trail**
   - Automatic logging of:
     - Space entry/exit
     - Permission changes
     - Access requests
   
3. **Error Handling**
   - Clear permission denied messages
   - Automatic retry for temporary failures
   - Logging of security events

## System Health Monitoring
// ...existing code...
