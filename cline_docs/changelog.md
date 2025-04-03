## 2025-04-02 (React Query Mutation Integration)

*   **Feature:** Integrated React Query mutations into `RoomDialog` component:
    *   Updated `RoomDialog` to use `useCreateSpace` and `useUpdateSpace` hooks.
    *   Added proper loading and error states with toast notifications.
    *   Maintained backward compatibility with optional `onCreate`/`onUpdate` props.
    *   Added required `companyId` prop for mutations.
*   **Refactor:** Modified `RoomDialogProps` interface:
    *   Made `onCreate` and `onUpdate` props optional.
    *   Added `companyId` as required prop.
*   **Improvement:** Enhanced `FloorPlan` component:
    *   Added `companyId` prop passing to `RoomDialog`.
    *   Kept `handleCreateRoom` for backward compatibility.
    *   Improved type safety and error handling.

---

## 2025-04-02 (React Query Setup)

*   **Feature:** Implemented React Query mutation hooks for spaces (`src/hooks/mutations/useSpaceMutations.ts`):
    *   `useCreateSpace`: Handles space creation via `spaceRepository.create`.
    *   `useUpdateSpace`: Handles space updates via `spaceRepository.update`.
    *   `useDeleteSpace`: Handles space deletion via `spaceRepository.deleteById`.
    *   Includes appropriate query invalidation logic (`invalidateQueries`, `removeQueries`) on success.

*   **Refactor:** Set up React Query (`@tanstack/react-query`) for server state management.
    *   Installed dependencies (`@tanstack/react-query`, `@tanstack/react-query-devtools`).
    *   Created `QueryProvider` (`src/providers/query-provider.tsx`) with default client configuration.
    *   Integrated `QueryProvider` into the main application layout (`src/app/layout.tsx`).

*   **Feature:** Implemented basic React Query hooks for spaces (`src/hooks/queries/useSpaces.ts`):
    *   `useSpaces`: Fetches all spaces for a company.
    *   `useSpace`: Fetches a single space by ID.

*   **Refactor:** Updated `FloorPlan` component (`src/components/floor-plan/index.tsx`):
    *   Removed `spaces` prop.
    *   Changed `companyName` prop to `companyId`.
    *   Integrated `useSpaces` hook to fetch data.
    *   Added loading and error handling states.
    *   Simplified `handleRoomClick` logic.

*   **Fix:** Updated legacy `LocalSpace` type definition (`src/components/floor-plan/types.ts`) to align with `DBSpace` type (`src/types/database.ts`), resolving multiple TypeScript errors related to ID types (`allowedUsers`, `ownerId`, `createdBy`, `reservations.userId`) and date/optional types (`reservations.startTime`, `reservations.endTime`, `reservations.purpose`, `createdAt`, `updatedAt`).
