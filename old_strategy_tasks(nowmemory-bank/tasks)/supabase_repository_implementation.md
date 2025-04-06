# Task: Implement Supabase Repositories

**Date:** 3/31/2025

**Objective:** Create concrete repository classes that implement the defined repository interfaces (`src/repositories/interfaces/`) using the Supabase JavaScript client.

**Depends On:**
*   Completion of `repository_interfaces_definition.md` (Interfaces are defined).
*   Supabase project created and environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) set up.
*   Database schema applied (see `supabase_schema_definition.sql`).

**Steps:**

1.  **Create Directory Structure:**
    *   Create the directory: `src/repositories/implementations/supabase/`
    *   Create the directory: `src/lib/supabase/` (if not already existing)

2.  **Implement Supabase Client (`client.ts`):**
    *   Create file: `src/lib/supabase/client.ts`
    *   Install the Supabase JS library: `npm install @supabase/supabase-js`
    *   Import `createClient` from `@supabase/supabase-js`.
    *   Retrieve `SUPABASE_URL` and `SUPABASE_ANON_KEY` from environment variables (e.g., `process.env.NEXT_PUBLIC_SUPABASE_URL`, `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`).
    *   Create and export the Supabase client instance:
        ```typescript
        // src/lib/supabase/client.ts
        import { createClient } from '@supabase/supabase-js';

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

        if (!supabaseUrl || !supabaseAnonKey) {
          // Consider logging this error instead of throwing during build/runtime
          console.error('Supabase URL or Anon Key is missing from environment variables.');
          // Potentially return a dummy client or handle appropriately elsewhere
        }

        // Note: Adjust generic type if using Supabase database types generation
        export const supabase = createClient(supabaseUrl, supabaseAnonKey);
        ```

3.  **Implement Repository Classes:**
    *   For each interface defined in `src/repositories/interfaces/`, create a corresponding implementation class file in `src/repositories/implementations/supabase/` (e.g., `SupabaseUserRepository.ts`, `SupabaseCompanyRepository.ts`).
    *   **Inside each class file:**
        *   Import the corresponding interface (e.g., `IUserRepository`).
        *   Import the `supabase` client instance from `src/lib/supabase/client`.
        *   Import necessary types from `src/types/`.
        *   Declare the class implementing the interface (e.g., `export class SupabaseUserRepository implements IUserRepository`).
        *   Implement all methods defined in the interface.
        *   Use the `supabase` client methods (`from()`, `select()`, `insert()`, `update()`, `delete()`, `eq()`, `in()`, `rpc()`, etc.) to interact with the database.
        *   Handle the `{ data, error }` response structure from Supabase. Check for errors and return data appropriately, matching the interface's return type signature.
        *   Perform any necessary data mapping between the database schema and the TypeScript types (though they should align closely based on the schema definition).

**Example Implementation (`SupabaseUserRepository.ts`):**

```typescript
// src/repositories/implementations/supabase/SupabaseUserRepository.ts
import { supabase } from '@/lib/supabase/client';
import { IUserRepository } from '@/repositories/interfaces/IUserRepository';
import { User } from '@/types/database';

export class SupabaseUserRepository implements IUserRepository {
  private TABLE_NAME = 'users';

  async findById(id: string): Promise<User | null> {
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single(); // .single() returns one object or null

    if (error && error.code !== 'PGRST116') { // PGRST116: Row not found
      console.error('Error fetching user by ID:', error);
      throw error; // Or handle more gracefully
    }
    return data as User | null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('email', email)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching user by email:', error);
      throw error;
    }
    return data as User | null;
  }

  async findByFirebaseUid(firebaseUid: string): Promise<User | null> {
     const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('firebase_uid', firebaseUid)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching user by Firebase UID:', error);
      throw error;
    }
    return data as User | null;
  }

  async findByCompany(companyId: string): Promise<User[]> {
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('company_id', companyId);

    if (error) {
      console.error('Error fetching users by company:', error);
      throw error;
    }
    return (data as User[]) || [];
  }

  async create(userData: Omit<User, 'id' | 'createdAt' | 'lastActive'>): Promise<User> {
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .insert(userData)
      .select()
      .single(); // Assuming insert returns the created row

    if (error || !data) {
      console.error('Error creating user:', error);
      throw error || new Error('Failed to create user');
    }
    return data as User;
  }

  async update(id: string, updates: Partial<User>): Promise<User | null> {
     // Ensure non-updatable fields aren't included if necessary
     const { id: _, createdAt: __, ...validUpdates } = updates;

     const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .update(validUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating user:', error);
      // Don't throw if error is just "row not found" for an update
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data as User | null; // Returns null if row wasn't found to update
  }

  async deleteById(id: string): Promise<boolean> {
    const { error } = await supabase
      .from(this.TABLE_NAME)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting user:', error);
      return false;
    }
    return true;
  }

  async updateCompanyAssociation(userId: string, companyId: string | null): Promise<User | null> {
      return this.update(userId, { companyId: companyId });
  }

  // Implement other methods...
}
```

4.  **Implement Classes for All Entities:**
    *   Create similar implementation classes for:
        *   `SupabaseCompanyRepository`
        *   `SupabaseSpaceRepository`
        *   `SupabaseConversationRepository`
        *   `SupabaseMessageRepository` (Handle related tables like attachments/reactions within this repo or separate ones)
        *   `SupabaseInvitationRepository`
        *   `SupabaseAnnouncementRepository`
        *   `SupabaseMeetingNoteRepository`

5.  **Create Barrel File (`index.ts`):**
    *   Create file: `src/repositories/implementations/supabase/index.ts`
    *   Export all implemented repository classes.
    *   Example:
        ```typescript
        export * from './SupabaseUserRepository';
        export * from './SupabaseCompanyRepository';
        // ... other implementations
        ```

**Considerations:**

*   **Error Handling:** Implement robust error handling. Decide whether to log errors, throw them, or return specific error objects/null values based on the interface contract.
*   **Data Mapping:** Ensure data fetched from Supabase correctly maps to the TypeScript types, especially for JSONB fields or relationships.
*   **Related Tables:** Decide how to handle operations involving related tables (e.g., adding a reaction to a message). You can either include these methods in the main repository (e.g., `addReaction` in `SupabaseMessageRepository`) or create separate repositories (e.g., `SupabaseMessageReactionRepository`). The example above keeps reaction methods within the message repository for simplicity.
*   **Supabase Edge Functions/RPC:** For complex queries or logic, consider using Supabase Edge Functions (RPC) and calling them from the repository methods.

**Completion Criteria:**
*   Concrete Supabase implementation classes exist for all defined repository interfaces in `src/repositories/implementations/supabase/`.
*   Classes correctly implement all methods from their respective interfaces using the Supabase client.
*   Error handling and data mapping are implemented correctly.
*   A barrel file exports all implementation classes.