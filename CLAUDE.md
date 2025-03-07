# Virtual Office Project Guide

## Commands
- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build the production application
- `npm run start` - Start the production server
- `npm run lint` - Run ESLint for code linting

## Code Style Guidelines
- **Imports**: Group and order by 1) React/Next, 2) External libraries, 3) Internal components (@/components/...)
- **Components**: Use functional components with explicit return types (React.FC discouraged)
- **File Structure**: Each component in its own file, kebab-case for filenames
- **Naming**: PascalCase for components/types, camelCase for variables/functions
- **Styling**: Use Tailwind classes with className, organize with clsx/tailwind-merge
- **Types**: Use explicit TypeScript types/interfaces, prefer interfaces for objects
- **Client Components**: Add 'use client' directive at the top of client components
- **State Management**: Use React hooks (useState, useContext) for state
- **Error Handling**: Use try/catch blocks and consider toast notifications

## Database Structure (DynamoDB)
- **Tables**:
  - `virtual-office-companies`: Company workspaces (`id`, `name`, `adminIds`, `createdAt`, `settings`)
  - `virtual-office-users`: User profiles (`id`, `companyId`, `email`, `displayName`, `status`, `role`, etc.)
    - GSI: `CompanyIndex` on `companyId`
  - `virtual-office-rooms`: Virtual rooms (`id`, `companyId`, `name`, `isLocked`, `occupants`, etc.)
    - GSI: `CompanyIndex` on `companyId`
  - `virtual-office-messages`: Chat messages (`id`, `roomId`/`recipientId`, `senderId`, `content`, etc.)
    - GSI: `RoomIndex` on `roomId`
  - `virtual-office-announcements`: Company-wide notices (`id`, `companyId`, `title`, `content`, etc.)
    - GSI: `CompanyIndex` on `companyId`
  - `virtual-office-meeting-notes`: Meeting summaries (`id`, `roomId`, `title`, `summary`, `actionItems`, etc.)
    - GSI: `RoomIndex` on `roomId`
  
See detailed documentation in `/docs/database.md`

## Authentication Flow
- Users sign up → create account → create/join company → access virtual office
- Company admins can invite new users
- All data is isolated by `companyId` for security

## Important Files
- **./virtual_officePRD.md**: The status, epics, stories and task of this project
- **./changelog.md**: History of implemented features
- **./docs/database.md**: Database documentation with schema and usage examples
- **./src/lib/dynamo.ts**: Server-side DynamoDB operations
- **./src/lib/api.ts**: Client-side API client for database operations
- **./src/pages/api/**: Server-side API endpoints for database access
- **./src/contexts/CompanyContext.tsx**: Company management functionality
- **./src/contexts/AuthContext.tsx**: Authentication with database integration

## Implementation Progress
- **Completed**: 
  - Epic 1 (Database Setup and Company Management)
  - Epic 2 (Firebase to DynamoDB Migration)
- **In Progress**: Epic 3 (Virtual Office Layout and Navigation)
- **Next**: Epic 4 (Real-time Collaboration Features)

## Database Setup
To create the required DynamoDB tables, use:
```
GET /api/setup-dynamo-tables
```

## AWS Environment Variables
Required in `.env.local`:
```
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
```