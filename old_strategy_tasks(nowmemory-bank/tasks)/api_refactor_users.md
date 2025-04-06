# Task: Refactor User API Routes for Supabase

**Date:** 3/31/2025

**Objective:** Modify the existing user management API routes located in `src/pages/api/users/` to use the new Supabase library functions (`src/lib/supabase/users.ts`) instead of the old DynamoDB functions.

**Depends On:**
*   Completion of `supabase_library_implementation.md` (specifically `src/lib/supabase/users.ts`).

**Target Files:**

*   `src/pages/api/users/by-company.ts`
*   `src/pages/api/users/create.ts`
*   `src/pages/api/users/get-by-firebase-id.ts`
*   `src/pages/api/users/remove-from-company.ts`
*   `src/pages/api/users/update.ts`
*   `src/pages/api/users/[id]/index.ts` (Likely handles GET by ID and potentially DELETE)
*   `src/pages/api/users/[id]/status.ts`

**General Refactoring Steps for Each File:**

1.  **Update Imports:**
    *   Remove imports related to `src/lib/dynamo` or `src/lib/dynamo/users`.
    *   Add imports for the required user functions from `src/lib/supabase` (likely importing from the barrel file `src/lib/supabase/index.ts`).
    *   Ensure necessary types (`User`, `UserRole`, etc.) are still imported correctly from `src/types/`.

2.  **Replace Function Calls:**
    *   Identify all calls to DynamoDB user functions (e.g., `getUser`, `getUsers`, `createUserInDB`, `updateUserInDB`, `deleteUser`, `getUserByFirebaseId`).
    *   Replace these calls with their corresponding Supabase function equivalents from `src/lib/supabase/users.ts` (e.g., `getUserById`, `getUsersByCompany`, `createUser`, `updateUser`, `deleteUserById`, `getUserByFirebaseUid`).
    *   **Important:** Verify the arguments passed to the new functions match their expected signatures.

3.  **Adapt Data Handling:**
    *   The Supabase functions might return data in a slightly different structure (e.g., `{ data, error }`) compared to the previous DynamoDB functions.
    *   Adjust the code to correctly access the user data from the `data` property of the Supabase response.
    *   Update any data transformation logic if necessary.

4.  **Update Error Handling:**
    *   Modify error handling logic to check the `error` property returned by Supabase functions.
    *   Return appropriate HTTP status codes (e.g., 404 if `data` is null and `error` is null for a `single()` query, 500 if `error` is present).

**Specific File Guidance:**

*   **`create.ts`:** Replace `createUserInDB` with `createUser`. Ensure the input data matches the `users` table schema (excluding DB-generated fields like `id`, `created_at`).
*   **`by-company.ts`:** Replace `getUsers` (or similar DynamoDB query) with `getUsersByCompany`.
*   **`get-by-firebase-id.ts`:** Replace `getUserByFirebaseId` with `getUserByFirebaseUid`.
*   **`update.ts`:** Replace `updateUserInDB` with `updateUser`. Ensure the `updates` object structure matches the `users` table columns.
*   **`[id]/index.ts` (GET):** Replace `getUser` with `getUserById`. Handle potential null `data` for 404 response.
*   **`[id]/index.ts` (DELETE):** Replace `deleteUser` with `deleteUserById` (assuming this function is created in the Supabase lib).
*   **`[id]/status.ts`:** Replace `updateUserInDB` (or similar) with `updateUser`, specifically updating the `status` and potentially `status_message` fields.
*   **`remove-from-company.ts`:** This might involve updating the `company_id` field of a user to `null`. Use the `updateUser` function.

**Testing:**

*   Use tools like Postman or `curl` to test each API endpoint thoroughly after refactoring.
*   Verify:
    *   Correct data is returned for GET requests.
    *   Data is correctly created/updated/deleted for POST/PUT/DELETE requests.
    *   Appropriate HTTP status codes are returned for success and error scenarios (e.g., 200, 201, 400, 404, 500).
    *   Authentication/authorization logic (if present in these routes) still functions correctly.

**Completion Criteria:**
*   All listed user API routes successfully use the `src/lib/supabase/users.ts` functions.
*   All DynamoDB-related code is removed from these files.
*   Endpoints function correctly as verified by testing.