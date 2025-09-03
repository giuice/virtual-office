# Migration Guide: Replacing space.userIds with Presence System

## Overview

The `space.userIds` field is deprecated and should be replaced with the presence system that uses `user.currentSpaceId`. This guide explains how to systematically replace all `space.userIds` usage throughout the codebase.

## Key Concept

**OLD WAY**: Spaces tracked users in a `userIds` array field
```typescript
// ❌ Old approach - space.userIds
space.userIds = ['user1', 'user2', 'user3']
const usersInSpace = space.userIds
const userCount = space.userIds?.length || 0
```

**NEW WAY**: Users track their current space in their `currentSpaceId` field  
```typescript
// ✅ New approach - user.currentSpaceId
user.currentSpaceId = 'space123'
const usersInSpace = users.filter(u => u.currentSpaceId === spaceId).map(u => u.id)
const userCount = users.filter(u => u.currentSpaceId === spaceId).length
```

## Step-by-Step Replacement Process

### Step 1: Identify Usage Patterns

Search for these patterns in your codebase:
- `space.userIds`
- `userIds.length`  
- `userIds.includes()`
- `userIds.map()`
- `userIds.filter()`

### Step 2: Import the Presence Context

In components that need user presence data, import the context:

```typescript
import { usePresence } from '@/contexts/PresenceContext';
```

### Step 3: Replace Each Usage Pattern

#### Pattern 1: Getting User Count in a Space

```typescript
// ❌ OLD
const userCount = space.userIds?.length || 0;

// ✅ NEW  
const { usersInSpaces } = usePresence();
const usersInThisSpace = usersInSpaces.get(space.id) || [];
const userCount = usersInThisSpace.length;
```

#### Pattern 2: Getting Users in a Space

```typescript
// ❌ OLD
const usersInSpace = space.userIds || [];

// ✅ NEW
const { usersInSpaces } = usePresence();
const usersInSpace = usersInSpaces.get(space.id) || [];
```

#### Pattern 3: Checking if User is in Space

```typescript
// ❌ OLD
const isUserInSpace = space.userIds?.includes(userId) || false;

// ✅ NEW
const { users } = usePresence();
const user = users?.find(u => u.id === userId);
const isUserInSpace = user?.currentSpaceId === space.id;
```

#### Pattern 4: Iterating Over Users in Space

```typescript
// ❌ OLD
{space.userIds?.map(userId => (
  <UserComponent key={userId} userId={userId} />
))}

// ✅ NEW
const { usersInSpaces } = usePresence();
const usersInThisSpace = usersInSpaces.get(space.id) || [];

{usersInThisSpace.map(user => (
  <UserComponent key={user.id} user={user} />
))}
```

## Specific File-by-File Instructions

### Frontend Components (React/TSX files)

#### 1. Room Dialog Components
**Files**: `room-dialog/view-room-tabs.tsx`, `room-dialog/tabs/people-tab.tsx`

```typescript
// ❌ OLD in view-room-tabs.tsx
<TabsTrigger value="people">People ({roomData.userIds?.length || 0})</TabsTrigger>

// ✅ NEW
const { usersInSpaces } = usePresence();
const usersInRoom = usersInSpaces.get(roomData.id) || [];
<TabsTrigger value="people">People ({usersInRoom.length})</TabsTrigger>
```

```typescript
// ❌ OLD in people-tab.tsx
export function PeopleTab({ userIds = [], handleMessageUser }: RoomPeopleTabProps) {

// ✅ NEW - Change the prop interface and implementation
interface RoomPeopleTabProps {
  spaceId: string; // Change from userIds to spaceId
  handleMessageUser?: (userId: string) => void;
}

export function PeopleTab({ spaceId, handleMessageUser }: RoomPeopleTabProps) {
  const { usersInSpaces } = usePresence();
  const usersInSpace = usersInSpaces.get(spaceId) || [];
  
  return (
    <div>
      {usersInSpace.length > 0 ? (
        usersInSpace.map(user => (
          <UserComponent key={user.id} user={user} onMessage={handleMessageUser} />
        ))
      ) : (
        <p>No users in this space</p>
      )}
    </div>
  );
}
```

#### 2. Floor Plan Components
**Files**: `floor-plan.tsx`, `dom-floor-plan.tsx`, `room-management.tsx`

```typescript
// ❌ OLD in floor-plan.tsx - Space entry logic
const updatedUserIds = [...(space.userIds || [])];
// Update mutation logic...

// ✅ NEW - Use presence system
const { updateLocation } = usePresence();
await updateLocation(space.id); // This updates user.currentSpaceId
```

```typescript
// ❌ OLD in room-management.tsx - User count display
{space.userIds?.length > 0 && ( 
  <span>{space.userIds?.length} users</span>
)}

// ✅ NEW
const { usersInSpaces } = usePresence();
const usersInThisSpace = usersInSpaces.get(space.id) || [];

{usersInThisSpace.length > 0 && ( 
  <span>{usersInThisSpace.length} users</span>
)}
```

### API Routes (Backend/TS files)

#### 1. User Operations
**File**: `api/users/remove-from-company/route.ts`

```typescript
// ❌ OLD - Trying to manipulate space.userIds
const occupiedSpaces = allSpacesInCompany.filter(space =>
  space.userIds && space.userIds.includes(userId)
);

// ✅ NEW - Update user's currentSpaceId instead
await userRepository.updateLocation(userId, null); // Remove user from all spaces

// Or if you need to find which space they're in first:
const user = await userRepository.findById(userId);
if (user?.currentSpaceId) {
  await userRepository.updateLocation(userId, null);
}
```

#### 2. Space Updates
**File**: `api/spaces/update/route.ts`

The existing code already removes userIds from updates:
```typescript
delete updateData.userIds; // ✅ This is correct - keep this line
```

### Repository & Database Layer

#### Repository Interfaces
**File**: `repositories/interfaces/ISpaceRepository.ts`

Remove any methods that manipulate userIds:
```typescript
// ❌ Remove these methods if they exist:
// addUserToSpace(spaceId: string, userId: string): Promise<boolean>;
// removeUserFromSpace(spaceId: string, userId: string): Promise<boolean>;
```

#### Repository Implementations  
**File**: `repositories/implementations/supabase/SupabaseSpaceRepository.ts`

Remove userIds-related methods and ensure space updates don't include userIds.

## Component Prop Updates

### Update Component Interfaces

Many components currently expect userIds as props. Update them:

```typescript
// ❌ OLD interface
interface SpaceCardProps {
  space: Space;
  userIds?: string[];
}

// ✅ NEW interface - Remove userIds prop
interface SpaceCardProps {
  space: Space;
  // userIds will be fetched from presence context inside component
}
```

### Update Component Usage

```typescript
// ❌ OLD component usage
<SpaceCard space={space} userIds={space.userIds} />

// ✅ NEW component usage
<SpaceCard space={space} />
```

## Testing Your Changes

### Before Making Changes
1. Note down current behavior (user counts, presence indicators)
2. Test user entry/exit flows
3. Document any edge cases

### After Making Changes
1. Test the same flows and verify identical behavior
2. Check that presence updates happen in real-time
3. Verify user counts are accurate
4. Test with multiple users in different spaces

### Common Issues & Solutions

#### Issue 1: Component Re-renders
**Problem**: Components re-render too frequently with presence data
**Solution**: Use useMemo for expensive calculations
```typescript
const usersInSpace = useMemo(() => 
  usersInSpaces.get(spaceId) || [], 
  [usersInSpaces, spaceId]
);
```

#### Issue 2: Stale User Counts  
**Problem**: User counts don't update immediately
**Solution**: Ensure PresenceProvider wraps your component tree properly

#### Issue 3: Missing Users
**Problem**: Some users don't show up in spaces
**Solution**: Check that user presence is being tracked correctly in the database

## Migration Checklist

### Frontend Components
- [ ] `room-dialog/view-room-tabs.tsx` - Replace userIds props
- [ ] `room-dialog/tabs/people-tab.tsx` - Use spaceId instead of userIds
- [ ] `floor-plan.tsx` - Replace space entry/exit logic
- [ ] `dom-floor-plan.tsx` - Update user-in-space checks  
- [ ] `room-management.tsx` - Fix user count displays
- [ ] `space-debug-panel.tsx` - Update debug info

### API Routes
- [ ] `users/remove-from-company/route.ts` - Use presence system
- [ ] Any other routes that manipulate space.userIds

### Types & Interfaces
- [ ] Remove userIds from component prop interfaces
- [ ] Update type definitions to reflect new patterns

### Testing
- [ ] Verify user counts are accurate
- [ ] Test space entry/exit flows
- [ ] Check real-time updates work
- [ ] Ensure no console errors

## Example: Complete Component Migration

Here's a complete before/after example:

```typescript
// ❌ BEFORE - Old component using userIds
interface OldSpaceCardProps {
  space: Space;
  userIds?: string[];
}

function OldSpaceCard({ space, userIds = [] }: OldSpaceCardProps) {
  const userCount = userIds.length;
  const isOccupied = userIds.length > 0;
  
  return (
    <div>
      <h3>{space.name}</h3>
      <p>{userCount} users</p>
      <div className={isOccupied ? 'occupied' : 'empty'}>
        {userIds.map(userId => (
          <UserAvatar key={userId} userId={userId} />
        ))}
      </div>
    </div>
  );
}

// ✅ AFTER - New component using presence
interface NewSpaceCardProps {
  space: Space;
}

function NewSpaceCard({ space }: NewSpaceCardProps) {
  const { usersInSpaces } = usePresence();
  const usersInSpace = usersInSpaces.get(space.id) || [];
  const userCount = usersInSpace.length;
  const isOccupied = userCount > 0;
  
  return (
    <div>
      <h3>{space.name}</h3>
      <p>{userCount} users</p>
      <div className={isOccupied ? 'occupied' : 'empty'}>
        {usersInSpace.map(user => (
          <UserAvatar key={user.id} user={user} />
        ))}
      </div>
    </div>
  );
}
```

## Priority Order for Migration

1. **High Priority**: API routes (they cause build failures)
2. **Medium Priority**: Main floor plan components  
3. **Low Priority**: Debug panels and admin tools

Start with the files causing build errors, then work through the UI components systematically.

## Final Notes

- The presence system is already implemented and working
- This migration primarily involves updating the frontend to use presence data instead of userIds
- All the necessary hooks and context providers are already in place
- After migration, the app should function identically but be more real-time responsive

## Need Help?

If you encounter issues during migration:
1. Check that PresenceProvider is wrapping your component
2. Verify the presence context is returning data with `console.log(usersInSpaces)`
3. Make sure you're using the correct space ID when querying presence data
4. Remember that presence data includes the full user objects, not just IDs