# Managing User Data with Supabase Auth

This document outlines the strategy for managing user profile data in conjunction with Supabase Authentication.

## Core Principles

1.  **Separation of Concerns:** Supabase `auth.users` table handles authentication and core user identity (ID, email, phone, auth-specific metadata). Our public `users` table stores application-specific profile information (display name, company association, role, preferences, status, etc.).
2.  **Reliable Synchronization:** A database trigger ensures that a profile is automatically created in the public `users` table whenever a new user signs up via Supabase Auth. This decouples profile creation from client-side actions.
3.  **Single Source of Truth (Auth ID):** The `supabase_uid` column in the public `users` table serves as the foreign key linking back to the `id` in the `auth.users` table. This is the primary way to associate profile data with an authenticated user.

## Implementation Details

### 1. `users` Table Schema

The public `users` table includes:

*   `id`: UUID, Primary Key, auto-generated (`DEFAULT uuid_generate_v4()`). This is the internal identifier for the profile row.
*   `supabase_uid`: TEXT, UNIQUE, NOT NULL. Stores the `id` from the corresponding `auth.users` record. Essential for linking and RLS.
*   `company_id`: UUID, Foreign Key to `companies.id`.
*   `email`: TEXT, UNIQUE, NOT NULL. Copied from `auth.users`.
*   `display_name`: TEXT, NOT NULL. Populated from auth metadata or defaults.
*   `avatar_url`: TEXT. Populated from auth metadata if available.
*   `role`: `user_role` ENUM. Default 'member'.
*   `status`: `user_status` ENUM. Default 'offline' or 'online'.
*   `preferences`: JSONB. Stores user settings.
*   ... other profile fields ...

### 2. Profile Synchronization Trigger

*   **Function:** `public.handle_new_user()`
    *   Runs with `SECURITY DEFINER` privileges.
    *   Takes user details (`id`, `email`, `raw_user_meta_data`) from the `NEW` record in `auth.users`.
    *   Inserts a new row into `public.users`, populating `supabase_uid` with `NEW.id`, and other fields like `email`, `display_name`, `avatar_url`, and setting default values for `role`, `status`, `preferences`.
*   **Trigger:** `on_auth_user_created`
    *   Fires `AFTER INSERT ON auth.users`.
    *   Executes the `public.handle_new_user()` function for each new row.

*   **Client-Side:** The manual call to `syncUserProfile` within the `signUp` function in `AuthContext.tsx` has been removed, as the trigger now handles this reliably.

### 3. Invitation Flow

*   **Acceptance Page:** `src/pages/accept-invite.tsx` is the primary entry point (`/accept-invite?token=...`).
*   **Authentication:** If the user is not logged in when visiting the accept page, they are prompted to sign in or sign up.
*   **Signup Context:** If the user needs to sign up, a flag (`isAcceptingInvite=true`) is set in `sessionStorage` before showing the signup UI/redirecting to the signup page.
*   **Signup Redirection:**
    *   The `src/app/(auth)/signup/page.tsx` checks for the `sessionStorage` flag after a successful signup.
    *   If the flag is present, the user is redirected to the main application (`/dashboard`), and the flag is removed.
    *   If the flag is absent (normal signup), the user is redirected to `/create-company`.
*   **Login Cleanup:** The `src/app/(auth)/login/page.tsx` removes the `sessionStorage` flag upon successful login, ensuring cleanup if the user logged in during the invite flow.
*   **API Endpoint (`/api/invitations/accept`):**
    *   Receives the `token` and the authenticated user's `supabaseUid`.
    *   Validates the token and invitation status.
    *   Finds the user's profile in `public.users` using `supabaseUid`.
    *   **Crucially:** Updates the *existing* user profile (found via `supabaseUid`) by setting the `companyId` and `role` from the invitation details. (The trigger should have already created the basic profile).
    *   Updates the invitation status to 'accepted'.

### 4. Deprecated Files

*   `src/app/join/page.tsx`: This page has been deprecated as the flow is handled by `src/pages/accept-invite.tsx`. It currently renders `null`.

This setup provides a robust and standard way to manage user profiles linked to Supabase Auth, ensuring data consistency and a smoother user experience, especially during the invitation process.
