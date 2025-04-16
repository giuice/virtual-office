

# <path>docs/migration/manageUserdata.md</path>


## Using Mutations with the Refactored `CompanyContext`

The `CompanyContext` has been refactored to use React Query for managing data fetching and mutations related to the company and its users/spaces. This simplifies data handling in components.

Instead of calling manual functions like `createNewCompany` or `updateUserProfile` directly from the context, you now access pre-configured mutation hooks.

### Accessing Mutation Hooks

First, get the context value using the `useCompany` hook:

```typescript
import { useCompany } from '@/contexts/CompanyContext';

function MyComponent() {
  const {
    // Query results (for getting IDs etc.)
    currentUserProfile,
    company,

    // Mutation Hooks
    createCompanyMutation,
    updateCompanyMutation,
    updateUserProfileMutation,
    updateUserRoleMutation,
    removeUserFromCompanyMutation,
    // Add space mutations if they are included in the context later
  } = useCompany();

  // ... component logic
}
Calling a Mutation
Each mutation hook (e.g., updateUserProfileMutation) provides functions and state properties:

mutate or mutateAsync: Functions to trigger the mutation.
mutate(variables, { onSuccess, onError, onSettled }): Asynchronous, doesn't return a promise directly to the call site. Use callbacks for side effects.
mutateAsync(variables): Returns a promise that resolves on success or rejects on error. Useful with async/await.
isPending: Boolean, true while the mutation is running.
isSuccess: Boolean, true if the mutation succeeded.
isError: Boolean, true if the mutation failed.
error: The error object if isError is true.
data: The data returned by the mutation function upon success (if any).
reset: Function to reset the mutation state.
Example: Updating User Profile Status

The updateUserProfileMutation now requires both the authUserId (for cache invalidation) and the userDbId (for the API call).

import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/contexts/AuthContext'; // To get authUserId easily
import { Button } from '@/components/ui/button';

function UserStatusUpdater() {
  const { user: authUser } = useAuth(); // Supabase Auth User
  const { currentUserProfile, updateUserProfileMutation } = useCompany();
  const { mutate, isPending, error } = updateUserProfileMutation;

  const handleSetOnline = () => {
    if (!authUser?.id || !currentUserProfile?.id) {
      console.error("Missing user IDs for status update");
      return;
    }

    const variables = {
      authUserId: authUser.id,        // For cache key
      userDbId: currentUserProfile.id, // For API call
      data: {
        status: 'online' as const, // 'status' is required by the hook
        // statusMessage: 'Working hard!' // Optional
      }
    };

    mutate(variables, {
      onSuccess: () => {
        console.log("Status updated successfully!");
        // Show toast notification, etc.
        // No need to manually refetch data - the hook handles invalidation.
      },
      onError: (err) => {
        console.error("Failed to update status:", err);
        // Show error toast
      }
    });
  };

  return (
    <div>
      <Button onClick={handleSetOnline} disabled={isPending}>
        {isPending ? 'Updating...' : 'Go Online'}
      </Button>
      {error && <p className="text-red-500">Error: {error.message}</p>}
    </div>
  );
}
Example: Updating User Role

This mutation requires the target user's Database ID (userId), the newRole, and the companyId.

import { useCompany } from '@/contexts/CompanyContext';
import { Button } from '@/components/ui/button';
import { UserRole } from '@/types/database';

function RoleChanger({ targetUserDbId }: { targetUserDbId: string }) {
  const { company, updateUserRoleMutation } = useCompany();
  const { mutate, isPending, error } = updateUserRoleMutation;

  const handleMakeAdmin = () => {
    if (!company?.id) return;

    const variables = {
      userId: targetUserDbId, // Database ID of the user to change
      newRole: 'admin' as UserRole,
      companyId: company.id,
    };

    mutate(variables, {
      onSuccess: () => {
        console.log(`User ${targetUserDbId} role updated!`);
        // Invalidation happens automatically in the hook
      },
      onError: (err) => {
        console.error("Failed to update role:", err);
      }
    });
  };

  return (
    <Button onClick={handleMakeAdmin} disabled={isPending || !company?.id}>
      {isPending ? 'Updating...' : 'Make Admin'}
    </Button>
    // Add error display if needed
  );
}
Key Takeaways
Import useCompany: Get context data and mutation hooks.
Destructure Mutation Hook: Get the specific mutation hook you need (e.g., updateUserProfileMutation).
Use mutate or mutateAsync: Call the mutation with the correct variables payload. Check the hook definition (src/hooks/mutations/.ts) or the CompanyContextType interface (src/contexts/CompanyContext.tsx) for the exact variable structure.
Handle Loading/Error States: Use isPending and error from the hook for UI feedback.
No Manual Refetching: The onSuccess logic within the mutation hooks should handle invalidating relevant queries (like companyQueryKeys.users, companyQueryKeys.spaces, companyQueryKeys.profile). You generally don't need to call loadCompanyData or queryClient.invalidateQueries directly in your component anymore for these mutations.



## Using Mutations with the Refactored `CompanyContext`

The `CompanyContext` has been refactored to use React Query for managing data fetching and mutations related to the company and its users/spaces. This simplifies data handling in components.

Instead of calling manual functions like `createNewCompany` or `updateUserProfile` directly from the context, you now access pre-configured mutation hooks.

### Accessing Mutation Hooks

First, get the context value using the `useCompany` hook:

```typescript
import { useCompany } from '@/contexts/CompanyContext';

function MyComponent() {
  const {
    // Query results (for getting IDs etc.)
    currentUserProfile,
    company,

    // Mutation Hooks
    createCompanyMutation,
    updateCompanyMutation,
    updateUserProfileMutation,
    updateUserRoleMutation,
    removeUserFromCompanyMutation,
    // Add space mutations if they are included in the context later
  } = useCompany();

  // ... component logic
}
Calling a Mutation
Each mutation hook (e.g., updateUserProfileMutation) provides functions and state properties:

mutate or mutateAsync: Functions to trigger the mutation.
mutate(variables, { onSuccess, onError, onSettled }): Asynchronous, doesn't return a promise directly to the call site. Use callbacks for side effects.
mutateAsync(variables): Returns a promise that resolves on success or rejects on error. Useful with async/await.
isPending: Boolean, true while the mutation is running.
isSuccess: Boolean, true if the mutation succeeded.
isError: Boolean, true if the mutation failed.
error: The error object if isError is true.
data: The data returned by the mutation function upon success (if any).
reset: Function to reset the mutation state.
Example: Updating User Profile Status

The updateUserProfileMutation now requires both the authUserId (for cache invalidation) and the userDbId (for the API call).

import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/contexts/AuthContext'; // To get authUserId easily
import { Button } from '@/components/ui/button';

function UserStatusUpdater() {
  const { user: authUser } = useAuth(); // Supabase Auth User
  const { currentUserProfile, updateUserProfileMutation } = useCompany();
  const { mutate, isPending, error } = updateUserProfileMutation;

  const handleSetOnline = () => {
    if (!authUser?.id || !currentUserProfile?.id) {
      console.error("Missing user IDs for status update");
      return;
    }

    const variables = {
      authUserId: authUser.id,        // For cache key
      userDbId: currentUserProfile.id, // For API call
      data: {
        status: 'online' as const, // 'status' is required by the hook
        // statusMessage: 'Working hard!' // Optional
      }
    };

    mutate(variables, {
      onSuccess: () => {
        console.log("Status updated successfully!");
        // Show toast notification, etc.
        // No need to manually refetch data - the hook handles invalidation.
      },
      onError: (err) => {
        console.error("Failed to update status:", err);
        // Show error toast
      }
    });
  };

  return (
    <div>
      <Button onClick={handleSetOnline} disabled={isPending}>
        {isPending ? 'Updating...' : 'Go Online'}
      </Button>
      {error && <p className="text-red-500">Error: {error.message}</p>}
    </div>
  );
}
Example: Updating User Role

This mutation requires the target user's Database ID (userId), the newRole, and the companyId.

import { useCompany } from '@/contexts/CompanyContext';
import { Button } from '@/components/ui/button';
import { UserRole } from '@/types/database';

function RoleChanger({ targetUserDbId }: { targetUserDbId: string }) {
  const { company, updateUserRoleMutation } = useCompany();
  const { mutate, isPending, error } = updateUserRoleMutation;

  const handleMakeAdmin = () => {
    if (!company?.id) return;

    const variables = {
      userId: targetUserDbId, // Database ID of the user to change
      newRole: 'admin' as UserRole,
      companyId: company.id,
    };

    mutate(variables, {
      onSuccess: () => {
        console.log(`User ${targetUserDbId} role updated!`);
        // Invalidation happens automatically in the hook
      },
      onError: (err) => {
        console.error("Failed to update role:", err);
      }
    });
  };

  return (
    <Button onClick={handleMakeAdmin} disabled={isPending || !company?.id}>
      {isPending ? 'Updating...' : 'Make Admin'}
    </Button>
    // Add error display if needed
  );
}
Key Takeaways
Import useCompany: Get context data and mutation hooks.
Destructure Mutation Hook: Get the specific mutation hook you need (e.g., updateUserProfileMutation).
Use mutate or mutateAsync: Call the mutation with the correct variables payload. Check the hook definition (src/hooks/mutations/*.ts) or the CompanyContextType interface (src/contexts/CompanyContext.tsx) for the exact variable structure.
Handle Loading/Error States: Use isPending and error from the hook for UI feedback.
No Manual Refetching: The onSuccess logic within the mutation hooks should handle invalidating relevant queries (like companyQueryKeys.users, companyQueryKeys.spaces, companyQueryKeys.profile). You generally don't need to call loadCompanyData or queryClient.invalidateQueries directly in your component anymore for these mutations.