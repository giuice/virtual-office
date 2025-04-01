# Task: Implement Supabase Library (`src/lib/supabase/`)

**Date:** 3/31/2025

**Objective:** Create a new library within `src/lib/supabase/` to handle all interactions with the Supabase database, replacing the functionality of the existing `src/lib/dynamo/` library.

**Depends On:**
*   Supabase project created and environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) set up.
*   Database schema applied (see `supabase_schema_definition.sql`).

**Steps:**

1.  **Create Directory Structure:**
    *   Create the main directory: `src/lib/supabase/`

2.  **Initialize Supabase Client (`client.ts`):**
    *   Create file: `src/lib/supabase/client.ts`
    *   Install the Supabase JS library: `npm install @supabase/supabase-js`
    *   Import `createClient` from `@supabase/supabase-js`.
    *   Retrieve `SUPABASE_URL` and `SUPABASE_ANON_KEY` from environment variables (e.g., `process.env.NEXT_PUBLIC_SUPABASE_URL`, `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`). Ensure these are available client-side if needed, or use server-side variables if only used in API routes.
    *   Create and export the Supabase client instance:
        ```typescript
        import { createClient } from '@supabase/supabase-js';

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

        if (!supabaseUrl || !supabaseAnonKey) {
          throw new Error('Supabase URL or Anon Key is missing from environment variables.');
        }

        export const supabase = createClient(supabaseUrl, supabaseAnonKey);
        ```

3.  **Create Generic Operations/Utils (Optional - `operations.ts`):**
    *   Create file: `src/lib/supabase/operations.ts` (Optional)
    *   Define any reusable helper functions if needed (e.g., generic error handling wrappers, data transformation helpers). Supabase client methods are often quite direct, so this might be minimal initially.

4.  **Implement Entity-Specific Modules:**
    *   For each core entity (users, companies, spaces, messages, conversations, invitations, announcements, meetingNotes), create a corresponding `.ts` file (e.g., `users.ts`, `messages.ts`).
    *   **Inside each module:**
        *   Import the `supabase` client instance from `./client`.
        *   Import relevant TypeScript types from `src/types/database.ts` and `src/types/messaging.ts`.
        *   Re-implement the functions previously found in the corresponding `src/lib/dynamo/` file, but using Supabase JS client methods (`select`, `insert`, `update`, `delete`, `rpc`).
        *   **Example (`users.ts`):**
            *   `getUserById(id: string): Promise<User | null>` -> Use `supabase.from('users').select('*').eq('id', id).single()`
            *   `getUserByEmail(email: string): Promise<User | null>` -> Use `supabase.from('users').select('*').eq('email', email).single()`
            *   `createUser(userData: Omit<User, 'id' | 'createdAt' | 'lastActive'>): Promise<User>` -> Use `supabase.from('users').insert({...}).select().single()`
            *   `updateUser(id: string, updates: Partial<User>): Promise<User>` -> Use `supabase.from('users').update({...}).eq('id', id).select().single()`
            *   `getUsersByCompany(companyId: string): Promise<User[]>` -> Use `supabase.from('users').select('*').eq('company_id', companyId)`
        *   Pay close attention to:
            *   Mapping Supabase results (`data`, `error`) to the expected TypeScript return types.
            *   Handling potential `error` objects returned by Supabase calls.
            *   Correctly formatting data for `insert` and `update` operations based on the SQL schema.
            *   Querying relationships if needed (Supabase client supports joins in `select`).

5.  **Create Barrel File (`index.ts`):**
    *   Create file: `src/lib/supabase/index.ts`
    *   Export all functions from the entity-specific modules created in step 4.
    *   Example:
        ```typescript
        export * from './users';
        export * from './companies';
        export * from './spaces';
        // ... other modules
        ```

**Testing:**
*   Unit test individual functions where possible.
*   Integration testing will occur when these functions are used in the refactored API routes.

**Completion Criteria:**
*   All necessary functions from `src/lib/dynamo/` have equivalent implementations in `src/lib/supabase/`.
*   The Supabase client is correctly initialized.
*   All functions are exported via the barrel file.