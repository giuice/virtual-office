# Active Context
```guidance
**Date:** 3/31/2025
**Last Updated:** 3/31/2025, 8:44 PM (UTC-3:00)

**Purpose:** This file provides a concise overview of the current work focus, immediate next steps, and active decisions for the project.

**Use Guidelines:**
- **Current Work Focus:** List the 2-3 *most critical* tasks currently being actively worked on.
- **Next Steps:** List the immediate next steps required to advance the project.
- **Active Decisions and Considerations:** Document key decisions currently being considered.
- **Do NOT include:** Detailed task breakdowns, historical changes, long-term plans.
- **Maintain Brevity:** Keep this file concise and focused on the *current* state.
```
## Current Work Focus:

- **Plan Supabase Database Migration:** Initiating planning to switch the application's backend database from AWS DynamoDB to Supabase due to cost concerns. Previous work on DynamoDB messaging features is paused.

## Next Steps:

1.  **Transition to Strategy Phase:** Update `.clinerules` and load the Strategy Plugin.
2.  **Identify DynamoDB Usage:** Locate all code interacting with DynamoDB (primarily within `src/lib/dynamo/` and API routes).
3.  **Define Supabase Schema:** Design the equivalent Supabase (PostgreSQL) schema based on existing DynamoDB tables/data structures (`src/types/database.ts`, `src/types/messaging.ts`).
4.  **Plan Data Migration (Optional):** Determine if existing data needs migration and plan the process if necessary.
5.  **Create Supabase Client/Lib:** Plan the creation of a new library (`src/lib/supabase/`) for interacting with Supabase.
6.  **Create Instruction Files:** Generate detailed instruction files for replacing DynamoDB interactions with Supabase calls in affected modules and API routes.
7.  **Update HDTA:** Update `system_manifest.md` and other relevant documentation.

## Active Decisions and Considerations:

- **Supabase Schema Design:** How to best map DynamoDB's NoSQL structure to Supabase's PostgreSQL structure (tables, relationships, constraints).
- **Data Migration:** Is migration feasible/necessary? Manual re-creation vs. scripted migration.
- **Authentication Integration:** How Supabase auth interacts with existing Clerk authentication.
- **Real-time Features:** How to replace DynamoDB Streams/Socket.IO logic with Supabase Realtime Subscriptions.
