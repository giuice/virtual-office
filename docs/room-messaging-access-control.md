# Room Messaging Access Control: Office Chat Best Practices

## Goals
- Messages in a room (space) should be readable by all users who have access to that room, and persist for future access.
- Some rooms (e.g., directors' rooms) should be private, with access restricted to specific users.
- There should be a clear distinction between public messages (for all space members) and private/direct messages.

## Recommended Schema Changes

### 1. Space Membership Table

Create a `space_members` table to explicitly track which users belong to which spaces.

```sql
create table public.space_members (
  id uuid primary key default uuid_generate_v4(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text, -- e.g., 'member', 'admin', 'director'
  joined_at timestamptz not null default now(),
  unique (space_id, user_id)
);
```

#### Admin Assignment

- Only users with the `admin` role (in `space_members` or a global admin table) can add or remove users from a space.
- UI/Backend should enforce that only admins can manage space membership.

### 2. Conversation Visibility

Add a `visibility` column to the `conversations` table:

```sql
alter table public.conversations
add column visibility text not null default 'public'; -- 'public', 'private', 'direct'
```

- `'public'`: All space members can read messages.
- `'private'`: Only specific users (in `participants`) can read messages.
- `'direct'`: Only two users (direct message).

### 3. Enforce Access Control

- When fetching messages for a room, check if the user is a member of the space (via `space_members`).
- For private rooms, check if the user is in the `participants` array.
- For public rooms, allow all space members to read messages.

### 4. Restricted Space Entry: "Knock to Enter" Workflow

For space types `workspace`, `conference`, and `private_office`:
- If a user is not a member and tries to enter, they must "knock" (request access).
- All users currently inside the space receive a **momentary UI notification (toaster)**:  
  _"User X is knocking. [Authorize entry]"_
- Any user inside can click the authorize link, which immediately grants the user membership (insert into `space_members`).
- No persistent DB table is needed for entry requests; only the result (membership) is persisted.

### 5. Cross-Space Calling

- Users inside any space can "call" (invite to chat or video) any other user, regardless of space membership.
- The system should allow sending a call notification to any user, even if they are not a member of the current space.
- If the call is accepted, the invited user may be prompted to join the space (subject to access control/knock workflow if required).

### 6. Persistent Presence & Interaction Logging

To support future dashboards and analytics (e.g., CEO can see who was in which meeting, for how long, with whom):

Create a `space_presence_log` table:

```sql
create table public.space_presence_log (
  id uuid primary key default uuid_generate_v4(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  entered_at timestamptz not null,
  exited_at timestamptz,
  session_type text, -- e.g., 'meeting', 'workspace', 'conference'
  context text,      -- e.g., meeting name, topic, etc.
  -- Optionally, add columns for who authorized entry, etc.
);
```

- Log an entry when a user enters a space, and update with `exited_at` when they leave.
- Use this data to build dashboards of user activity, meeting durations, and interactions.

### 7. API/Backend Logic

- When a user sends a message to a room, ensure the conversation exists and the user is a member (for private rooms).
- When fetching messages, filter based on the user's membership and the conversation's visibility.
- When a user knocks, show a UI notification to all current members; on authorization, add the user to `space_members`.
- When a user calls another, send a notification regardless of space membership.
- Log all space entry/exit events in `space_presence_log` for analytics.

## Example Query: Fetch Room Messages for a User

```sql
select m.*
from public.messages m
join public.conversations c on m.conversation_id = c.id
join public.space_members sm on c.room_id = sm.space_id
where sm.user_id = :user_id
  and c.visibility = 'public'
  and c.room_id = :room_id
order by m.timestamp asc;
```

## Future Enhancements

- Add roles/permissions to `space_members` for fine-grained access (e.g., only directors can read/write in certain rooms).
- Add audit logging for access to private messages and entry requests.
- Implement RLS (Row Level Security) policies in Supabase for strong enforcement.

---

**Summary:**  
This approach ensures that room messages are accessible only to authorized users, supports both public and private rooms, enables admin-controlled membership, implements a "knock to enter" workflow via UI notification, allows users to call others across spaces, and provides a persistent log of user presence and interactions for future dashboards.