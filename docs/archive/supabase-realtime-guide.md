# Supabase Realtime Summary

Supabase Realtime enables real-time features in applications using three core extensions built upon **Channels**.

## Core Concepts

* **Channels:** The basic building block, like a chatroom identified by a unique topic (`supabase.channel('your-topic')`). Clients join channels to send/receive messages.

* **Broadcast:**
    * Sends ephemeral messages (publish/subscribe).
    * Messages are *not* persisted by Realtime.
    * Use Case: Cursor tracking, temporary notifications.
    * Usage: `channel.send({ type: 'broadcast', event: 'event_name', payload: {...} })`
    * Receiving: `channel.on('broadcast', { event: 'event_name' }, (payload) => ...)`

* **Presence:**
    * Tracks and syncs shared state between clients within a channel.
    * State is persisted *on the server* while clients are connected. New clients get the current state immediately.
    * Handles disconnects automatically (removes user's state).
    * Use Case: Online status ("user is typing").
    * Usage: `channel.track({ user: 'id', online_at: Date.now() })`, `channel.untrack()`
    * Receiving: `channel.on('presence', { event: 'sync' }, () => { const state = channel.presenceState(); ... })`

* **Postgres Changes:**
    * Listens to database changes (INSERT, UPDATE, DELETE) via Postgres logical replication.
    * Requires JWT for authorization; respects Row Level Security (RLS).
    * **Security:** RLS is crucial. Without it, anyone with a valid JWT can listen.
    * Usage: `channel.on('postgres_changes', { event: '*', schema: 'public', table: 'todos', filter: 'col=eq.val' }, (payload) => ...)`
    * Events: `INSERT`, `UPDATE`, `DELETE`, `*` (all).
    * Scope: Schema, Table, or filtered by Column value.

## Choosing Broadcast vs. Presence

* **Use Broadcast by default.** It's lighter.
* **Use Presence only when** you need synchronized, persisted shared state. It's computationally heavier (uses CRDTs) and benefits from throttling updates.

## Subscribing to Database Changes (Two Methods)

1.  **Using Broadcast (Recommended for Scalability/Security):**
    * **Setup:**
        * Create an RLS policy granting `select` on `realtime.messages`.
        * Create a Postgres trigger function using `realtime.broadcast_changes()`.
        * Create a trigger on your table(s) to call the function `AFTER INSERT OR UPDATE OR DELETE`.
    * **Client:**
        * Set auth token: `supabase.realtime.setAuth('your-jwt')` (needed for private channels).
        * Subscribe to a *private* channel matching the topic used in the trigger function: `supabase.channel('topic:record_id', { config: { private: true } })`.
        * Listen using `channel.on('broadcast', { event: 'INSERT' / 'UPDATE' / 'DELETE' }, ...)`

2.  **Using Postgres Changes (Simpler, Less Scalable):**
    * **Setup:**
        * Enable via `supabase_realtime` publication:
            ```sql
            -- Drop if exists and recreate empty
            drop publication if exists supabase_realtime;
            create publication supabase_realtime;
            -- Add tables
            alter publication supabase_realtime add table your_table1, your_table2;
            ```
    * **Client:**
        * Subscribe using `postgres_changes` event:
            ```javascript
            supabase
              .channel('db-changes')
              .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, ...)
              .subscribe()
            ```

## Filtering (Postgres Changes Only)

Use the `filter` parameter with operators:
* `eq`: Equal
* `neq`: Not equal
* `lt`: Less than
* `lte`: Less than or equal to
* `gt`: Greater than
* `gte`: Greater than or equal to
* `in`: Contained in list (e.g., `filter: 'name=in.(red,blue)'`)

Example: `filter: 'user_id=eq.123'`

## Advanced Postgres Changes Topics

* **Old Records:** Get previous values on UPDATE/DELETE by setting `ALTER TABLE your_table REPLICA IDENTITY FULL;` (Note: RLS limitations apply to `DELETE` old records).
* **Private Schemas:** Grant `SELECT` permission on the private table to the relevant role (e.g., `authenticated`). **RLS is strongly recommended.**
* **Custom Tokens:** Use `supabase.realtime.setAuth('your-custom-jwt')` *before* connecting/subscribing. You must handle token generation and refresh.

## Limitations

* **Postgres Changes:**
    * `DELETE` events cannot be filtered.
    * Performance can be a bottleneck, especially with many users and RLS checks. Each change triggers a check per subscribed user. Processing is single-threaded.
    * Consider alternatives for high-scale: Use Broadcast with triggers, use separate public tables without RLS, or stream server-side only.
* **General:**
    * Table names with spaces are not currently supported.

## Client Library Usage (Examples Integrated Above)

* Import: `import { createClient } from '@supabase/supabase-js'`
* Initialize: `const supabase = createClient(...)`
* Get Channel: `const channel = supabase.channel(...)`
* Subscribe: `channel.subscribe()`
* Listen: `channel.on(...)`
* Send/Track: `channel.send(...)` / `channel.track(...)`

## Supabase Realtime Summary

Supabase Realtime enables building real-time applications with collaborative features using Channels and three core extensions: Broadcast, Presence, and Postgres Changes.

## Core Concepts

### Channels

* The fundamental building block, like a chatroom identified by a unique topic string. Clients join channels to send/receive messages bi-directionally.
    ```javascript
    import { createClient } from '@supabase/supabase-js'
    const supabase = createClient('https://<project>.supabase.co', '<your-anon-key>')

    // Channel name can be any string except 'realtime'
    const channel = supabase.channel('your-topic-name')
    ```

### Broadcast

* Sends ephemeral (non-persistent) messages using a publish-subscribe pattern.
* Ideal for rapid, transient data like cursor positions; bypasses the database.
* **Sending Messages:**
    ```javascript
    channel.send({
      type: 'broadcast',
      event: 'test', // Your custom event name
      payload: { message: 'hello, world' },
    })
    ```
* **Listening for Messages:**
    ```javascript
    // Listen for specific broadcast events
    channel
      .on('broadcast', { event: 'cursor' }, (event) => {
         console.log('Cursor position received:', event.payload);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to broadcast channel!')
        }
      })
    ```
* **Example: Cursor Position Sharing**
    ```javascript
    const MOUSE_EVENT = 'cursor'

    // Listen for cursor events from others
    channel
      .on('broadcast', { event: MOUSE_EVENT }, (event) => {
        receivedCursorPosition(event)
      })
      .subscribe()

    // Handler for received positions
    const receivedCursorPosition = ({ event, payload }) => {
      console.log(`
          User: ${payload.userId}
          x Position: ${payload.x}
          y Position: ${payload.y}
        `)
    }

    // Function to send own position
    const sendMousePosition = (channel, userId, x, y) => {
      return channel.send({
        type: 'broadcast',
        event: MOUSE_EVENT,
        payload: { userId, x, y },
      })
    }
    ```

### Presence

* Tracks and synchronizes shared state (e.g., online status, typing indicators) among channel participants.
* State is held server-side; new clients get the current state immediately.
* Automatically handles disconnects (removes user's state).
* Uses CRDTs, more computationally intensive than Broadcast. Use sparingly and consider throttling updates.
* **Tracking State:**
    ```javascript
    const presenceTrackStatus = await channel.track({
      user: 'user-1',
      online_at: new Date().toISOString(),
      // presence key must be unique for each client connected to the channel
      // presence: { key: 'user-1' } // Add this in channel options if needed
    })
    console.log(presenceTrackStatus) // 'ok' | 'error' | 'timed out'
    ```
* **Listening for State Changes:**
    ```javascript
    // Listen for clients joining
    channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      console.log('New users joined:', newPresences)
    })

    // Listen for clients leaving
    channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      console.log('Users left:', leftPresences)
    })

    // Listen for overall state synchronization (covers joins, leaves, and updates)
    channel.on('presence', { event: 'sync' }, () => {
      const newState = channel.presenceState()
      console.log('Current presence state:', newState)
    })
    ```
* **Stop Tracking:**
    ```javascript
    const status = await channel.untrack()
    console.log(status) // 'ok' | 'error'
    ```
* **Example: Typing Indicator**
    ```javascript
    const userId = 'user_1234'
    const slackRoomId = '#random'

    const channel = supabase.channel(slackRoomId, {
      config: {
        // key must be unique to the client attempting to track presence
        presence: { key: userId }
      }
    })

    // Subscribe to all Presence changes
    channel
      .on('presence', { event: 'sync' }, () => presenceChanged(channel))
      .subscribe()

    // Example: Track typing status on keydown
    document.addEventListener('keydown', function(event){
      channel.track({ isTyping: Date.now() })
    })

    // Receive Presence updates
    const presenceChanged = (channel) => {
      const newState = channel.presenceState()
      console.log("Updated presence state:", newState)
      // Example: Iterate state to see who is typing
      // for (const id in newState) {
      //   console.log(`${id} is typing: ${newState[id][0]?.isTyping ? 'yes' : 'no'}`);
      // }
    }

    // Untrack when needed (e.g., on page unload)
    // window.addEventListener('beforeunload', () => channel.untrack());
    ```

### Postgres Changes

* Listens directly to database changes (INSERT, UPDATE, DELETE) via Postgres logical replication.
* Requires a valid JWT for authorization.
* **Security:** Relies heavily on **Row Level Security (RLS)** policies to control which changes a user can receive. **Enable RLS** on tables exposed via Realtime.
* **Basic Listening Structure:**
    ```javascript
    const changes = supabase
      .channel('schema-db-changes') // Can be any string except 'realtime'
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to ALL changes
          schema: 'public',
          // table: 'messages', // Optional: listen to a specific table
          // filter: 'body=eq.hello' // Optional: filter by column value
        },
        (payload) => console.log('Change received!', payload)
      )
      .subscribe()
    ```

## Choosing Broadcast vs. Presence

* Use **Broadcast** by default for ephemeral messages.
* Use **Presence** only when needing synchronized, shared state aware of connections/disconnections. Be mindful of its higher computational cost.

## Using Postgres Changes (Direct Method)

### Setup

* Enable tables for replication via the `supabase_realtime` publication. **Must be done via SQL Editor in Supabase dashboard.**
    ```sql
    -- Run this only once per project (if publication exists, it drops and recreates)
    begin;
    -- remove the supabase_realtime publication
    drop publication if exists supabase_realtime;
    -- re-create the supabase_realtime publication with no tables
    create publication supabase_realtime;
    commit;

    -- Add specific tables you want to listen to (run for each table)
    -- Replace 'messages' and 'todos' with your actual table names
    alter publication supabase_realtime add table messages;
    alter publication supabase_realtime add table todos;
    alter publication supabase_realtime add table profiles;
    alter publication supabase_realtime add table products;
    alter publication supabase_realtime add table colors;
    -- Add any other tables you need...
    ```

### Listening Examples

* **Listen to specific schema ('public'):**
    ```javascript
    const changes = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          schema: 'public', // Subscribes to the "public" schema
          event: '*',       // Listen to all change events
        },
        (payload) => console.log(payload)
      )
      .subscribe()
    ```
* **Listen only to INSERTs:**
    ```javascript
    const changes = supabase
      .channel('insert-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT', // Listen only to INSERTs
          schema: 'public',
        },
        (payload) => console.log(payload)
      )
      .subscribe()
    ```
* **Listen only to UPDATEs:**
    ```javascript
    const changes = supabase
      .channel('update-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE', // Listen only to UPDATEs
          schema: 'public',
        },
        (payload) => console.log(payload)
      )
      .subscribe()
    ```
* **Listen only to DELETEs:**
    ```javascript
    const changes = supabase
      .channel('delete-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'DELETE', // Listen only to DELETEs
          schema: 'public',
        },
        (payload) => console.log(payload)
      )
      .subscribe()
    ```
* **Listen to a specific table ('todos'):**
    ```javascript
    const changes = supabase
      .channel('table-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'todos', // Listen only to the 'todos' table
        },
        (payload) => console.log(payload)
      )
      .subscribe()
    ```
* **Listen to multiple different changes on the same channel:**
    ```javascript
    const channel = supabase
      .channel('db-changes')
      .on( // Listen for all changes on 'messages' table
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload) => console.log('Message change:', payload)
      )
      .on( // Listen for INSERTs on 'users' table
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'users' },
        (payload) => console.log('New user:', payload)
      )
      .subscribe()
    ```
* **Example combining Postgres Changes with a specific channel:**
    ```javascript
    const channelId = '#random' // Assuming this ID relates to your data

    // Create a filter only for new messages in a specific room
    const databaseFilter = {
      schema: 'public',
      table: 'messages',
      filter: `room_id=eq.${channelId}`, // Filter for messages matching the channel ID
      event: 'INSERT',
    }

    const channel = supabase
      .channel(channelId) // Use the specific channel ID
      .on('postgres_changes', databaseFilter, (payload) => receivedDatabaseEvent(payload))
      .subscribe()

    const receivedDatabaseEvent = (payload) => {
      console.log("New message received for this channel:", payload)
    }
    ```

### Filtering Examples

* **Basic Filter (INSERTs on 'todos' where id = 1):**
    ```javascript
    const changes = supabase
      .channel('table-filter-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'todos',
          filter: 'id=eq.1', // Filter: id equals 1
        },
        (payload) => console.log(payload)
      )
      .subscribe()
    ```
* **Filter: Equal to (`eq`)**
    ```javascript
    const channel = supabase
      .channel('changes-eq')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE', schema: 'public', table: 'messages',
          filter: 'body=eq.hey', // Filter: body column equals 'hey'
        },
        (payload) => console.log(payload)
      )
      .subscribe()
    ```
* **Filter: Not equal to (`neq`)**
    ```javascript
    const channel = supabase
      .channel('changes-neq')
      .on(
        'postgres_changes',
        {
          event: 'INSERT', schema: 'public', table: 'messages',
          filter: 'body=neq.bye', // Filter: body column does not equal 'bye'
        },
        (payload) => console.log(payload)
      )
      .subscribe()
    ```
* **Filter: Less than (`lt`)**
    ```javascript
    const channel = supabase
      .channel('changes-lt')
      .on(
        'postgres_changes',
        {
          event: 'INSERT', schema: 'public', table: 'profiles',
          filter: 'age=lt.65', // Filter: age column is less than 65
        },
        (payload) => console.log(payload)
      )
      .subscribe()
    ```
* **Filter: Less than or equal to (`lte`)**
    ```javascript
    const channel = supabase
      .channel('changes-lte')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE', schema: 'public', table: 'profiles',
          filter: 'age=lte.65', // Filter: age column is less than or equal to 65
        },
        (payload) => console.log(payload)
      )
      .subscribe()
    ```
* **Filter: Greater than (`gt`)**
    ```javascript
    const channel = supabase
      .channel('changes-gt')
      .on(
        'postgres_changes',
        {
          event: 'INSERT', schema: 'public', table: 'products',
          filter: 'quantity=gt.10', // Filter: quantity column is greater than 10
        },
        (payload) => console.log(payload)
      )
      .subscribe()
    ```
* **Filter: Greater than or equal to (`gte`)**
    ```javascript
    const channel = supabase
      .channel('changes-gte')
      .on(
        'postgres_changes',
        {
          event: 'INSERT', schema: 'public', table: 'products',
          filter: 'quantity=gte.10', // Filter: quantity column is greater than or equal to 10
        },
        (payload) => console.log(payload)
      )
      .subscribe()
    ```
* **Filter: Contained in list (`in`)**
    ```javascript
    const channel = supabase
      .channel('changes-in')
      .on(
        'postgres_changes',
        {
          event: 'INSERT', schema: 'public', table: 'colors',
          // Filter: name column is one of 'red', 'blue', or 'yellow'
          filter: 'name=in.(red,blue,yellow)',
        },
        (payload) => console.log(payload)
      )
      .subscribe()
    ```

### Advanced Topics

* **Receiving Old Records:** To get the previous record state on UPDATE/DELETE, set `REPLICA IDENTITY` to `FULL` for the table. (Note: For DELETE with RLS enabled, `old` record contains only primary key(s)).
    ```sql
    -- Run in SQL Editor for the specific table
    alter table messages replica identity full;
    ```
* **Private Schemas:** Grant `SELECT` permission on the private table to the relevant database role (e.g., `authenticated`). RLS is strongly recommended for security.
    ```sql
    -- Example: Grant select on a table in a non-public schema
    grant select on "non_private_schema"."some_table" to authenticated;
    ```
* **Custom / Refreshed Tokens:** Set your own JWT using `supabase.realtime.setAuth()` *before* connecting to a channel. Useful for custom claims or manual token refreshes. **Do not expose `service_role` tokens client-side.**
    ```javascript
    // Ensure you have your custom JWT available
    const myCustomJwt = 'your-custom-jwt';

    // Set the token on the realtime client BEFORE subscribing
    supabase.realtime.setAuth(myCustomJwt);

    // Now connect to the channel
    const channel = supabase
      .channel('db-changes-custom-auth')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages'},
        (payload) => console.log(payload)
      )
      .subscribe();

    // If using supabase-js v2 and tokens refresh:
    // supabase.auth.onAuthStateChange((event, session) => {
    //   if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    //     supabase.realtime.setAuth(session.access_token);
    //   }
    // })
    ```

### Limitations & Scaling Concerns

* **DELETE events cannot be filtered** using the `filter` parameter.
* Table names containing spaces might cause issues.
* **Performance Bottleneck:** Can occur at scale. Every database change requires RLS checks for *every* subscribed user listening via Postgres Changes. This can slow down message delivery. Performance scales primarily with DB read capacity for RLS checks, not just compute upgrades.
* **Scaling Suggestion:** Consider using separate "public" tables without RLS/filters *if appropriate for your security model*, or use the Broadcast + Triggers method.

## Alternative: Database Changes via Broadcast + Triggers (Recommended for Scaling)

* **Concept:** Use standard Postgres triggers to call a function (`realtime.broadcast_changes`) which sends changes over Broadcast channels instead of using the built-in Postgres Changes replication.
* **Benefits:** Generally more scalable as it leverages the more efficient Broadcast mechanism. Can be secured using Realtime Authorization policies instead of RLS checks per subscriber *per message*.
* **Setup (Server-Side SQL):**
    1.  **Create Trigger Function:**
        ```sql
        -- Generic function to broadcast changes for a table
        -- Assumes the table has a 'topic' column or similar identifier for the broadcast topic
        create or replace function public.broadcast_table_changes()
        returns trigger
        language plpgsql
        as $$
        declare
          channel_topic text;
        begin
          -- Determine the topic. Example: prefix 'table:' + record id
          -- Adjust NEW.id or OLD.id based on your table structure and needs
          -- Ensure the column used (e.g., 'id') exists on your table
          -- Use COALESCE for DELETE operations where NEW is null
          channel_topic := 'table:' || coalesce(NEW.id, OLD.id)::text;

          -- Use the realtime.broadcast_changes function
          perform realtime.broadcast_changes(
            channel_topic, -- topic - the topic to which we're broadcasting
            TG_OP,         -- event - INSERT, UPDATE, DELETE
            TG_OP,         -- operation - Redundant, but expected by function
            TG_TABLE_NAME, -- table name
            TG_TABLE_SCHEMA, -- schema name
            NEW,           -- new record (null on DELETE)
            OLD            -- old record (null on INSERT)
          );
          return null; -- Trigger function must return null for AFTER triggers
        end;
        $$;
        ```
    2.  **Create Trigger on Your Table:** (Replace `your_table` with actual table name)
        ```sql
        -- Drop existing trigger if recreating
        drop trigger if exists handle_your_table_changes on public.your_table;

        -- Create the trigger to run AFTER database operations
        create trigger handle_your_table_changes
        after insert or update or delete
        on public.your_table -- Replace with your table name
        for each row         -- Run for every modified row
        execute function public.broadcast_table_changes(); -- Call the function above
        ```
* **Setup (Client-Side Security & Listening):**
    1.  **Realtime Authorization Policy (SQL):** Allow users to receive messages on the broadcast topics.
        ```sql
        -- Example policy: Allow any authenticated user to receive any broadcast
        -- !!! Refine this policy based on your security needs !!!
        -- e.g., check claims in auth.jwt() against the topic name
        create policy "Authenticated users can receive broadcasts"
        on "realtime"."messages" -- Applies to the internal messages table Realtime uses
        for select               -- Allows reading/receiving messages
        to authenticated         -- Role allowed (e.g., authenticated users)
        using ( true );          -- Condition (true means always allow for this role)
        ```
    2.  **Client Listening Code (JS):** Listen on the specific topic defined in your trigger function (e.g., `table:<record_id>`). **Requires `setAuth` first.**
        ```javascript
        const recordId = 'some-record-id'; // The specific ID you want to listen for changes on
        const channelTopic = `table:${recordId}`; // Matches the topic created in the trigger

        // !!! IMPORTANT: Set auth token BEFORE subscribing to private broadcast channel !!!
        await supabase.realtime.setAuth(supabase.auth.getSession()?.access_token);

        const channel = supabase
          .channel(channelTopic, { // Use the specific topic
            config: {
              private: true // Mark channel as private to enforce Realtime RLS policies
            }
          })
          .on('broadcast', { event: 'INSERT' }, (payload) => console.log('INSERT received via Broadcast:', payload))
          .on('broadcast', { event: 'UPDATE' }, (payload) => console.log('UPDATE received via Broadcast:', payload))
          .on('broadcast', { event: 'DELETE' }, (payload) => console.log('DELETE received via Broadcast:', payload))
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              console.log(`Successfully subscribed to private broadcast channel: ${channelTopic}`);
            } else if (status === 'CHANNEL_ERROR') {
              console.error(`Error subscribing to channel ${channelTopic}. Check RLS policies and token.`);
            }
          });
        ```