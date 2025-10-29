```app console errors on running playright 'npm run test:api-ci' 
> virtual-office@0.1.0 dev
> next dev --turbopack

   ▲ Next.js 16.0.0 (Turbopack)
   - Local:        http://localhost:3000
   - Network:      http://10.255.255.254:3000
   - Environments: .env.local

 ✓ Starting...
 ⚠ The "middleware" file convention is deprecated. Please use "proxy" instead. Learn more: https://nextjs.org/docs/messages/middleware-to-proxy
 ✓ Ready in 1039ms
[Middleware] Path: /, User: None, Error: Auth session missing!
 ○ Compiling / ...
 GET / 307 in 3.5s (compile: 3.1s, proxy.ts: 76ms, render: 237ms)
[Middleware] Path: /login, User: None, Error: Auth session missing!
 GET /login 200 in 866ms (compile: 797ms, proxy.ts: 8ms, render: 61ms)
[Middleware] Path: /, User: None, Error: Auth session missing!
 GET / 307 in 54ms (compile: 3ms, proxy.ts: 6ms, render: 45ms)
[Middleware] Path: /login, User: None, Error: Auth session missing!
 GET /login 200 in 51ms (compile: 4ms, proxy.ts: 6ms, render: 41ms)
[Middleware] Path: /api/test/messaging/seed, User: None, Error: Auth session missing!
[Middleware] Path: /api/test/messaging/seed, User: None, Error: Auth session missing!
[Middleware] Path: /api/test/messaging/seed, User: None, Error: Auth session missing!
Repository creating conversation with data: {
  "type": "direct",
  "participants": [
    "6281f07f-1253-444b-b3ae-1c18088893ee",
    "4ddaea29-59fb-47b9-a09b-17b24ad824e6"
  ],
  "lastActivity": "2025-10-28T23:00:09.503Z",
  "name": "test_dm_1f450377-4922-4639-8b7a-165fb657c118",
  "isArchived": false,
  "visibility": "direct",
  "participantsFingerprint": "4ddaea29-59fb-47b9-a09b-17b24ad824e6:6281f07f-1253-444b-b3ae-1c18088893ee"
}
Repository creating conversation with data: {
  "type": "direct",
  "participants": [
    "6281f07f-1253-444b-b3ae-1c18088893ee",
    "4ddaea29-59fb-47b9-a09b-17b24ad824e6"
  ],
  "lastActivity": "2025-10-28T23:00:09.528Z",
  "name": "test_dm_8b39904a-0316-4e1a-a563-c5f9a2adc84c",
  "isArchived": false,
  "visibility": "direct",
  "participantsFingerprint": "4ddaea29-59fb-47b9-a09b-17b24ad824e6:6281f07f-1253-444b-b3ae-1c18088893ee"
}
Supabase error creating conversation: {
  code: '23505',
  details: 'Key (participants_fingerprint)=(db19890c6a08858fae0950fee334a625) already exists.',
  hint: null,
  message: 'duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"'
}
Repository error in create(): Error: Database error: duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"
    at SupabaseConversationRepository.create (src/repositories/implementations/supabase/SupabaseConversationRepository.ts:195:15)
    at async MessagingTestSeeder.seed (src/lib/test-utils/messaging-test-seeder.ts:121:32)
    at async POST (src/app/api/test/messaging/seed/route.ts:162:24)
  193 |       if (error) {
  194 |         console.error('Supabase error creating conversation:', error);
> 195 |         throw new Error(`Database error: ${error.message}`);
      |               ^
  196 |       }
  197 |
  198 |       if (!data) {
[Messaging Seed Route] Failed to seed test data Error: Database error: duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"
    at SupabaseConversationRepository.create (src/repositories/implementations/supabase/SupabaseConversationRepository.ts:195:15)
    at async MessagingTestSeeder.seed (src/lib/test-utils/messaging-test-seeder.ts:121:32)
    at async POST (src/app/api/test/messaging/seed/route.ts:162:24)
  193 |       if (error) {
  194 |         console.error('Supabase error creating conversation:', error);
> 195 |         throw new Error(`Database error: ${error.message}`);
      |               ^
  196 |       }
  197 |
  198 |       if (!data) {
 POST /api/test/messaging/seed 500 in 1775ms (compile: 492ms, proxy.ts: 9ms, render: 1274ms)
Supabase error creating conversation: {
  code: '23505',
  details: 'Key (participants_fingerprint)=(db19890c6a08858fae0950fee334a625) already exists.',
  hint: null,
  message: 'duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"'
}
Repository error in create(): Error: Database error: duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"
    at SupabaseConversationRepository.create (src/repositories/implementations/supabase/SupabaseConversationRepository.ts:195:15)
    at async MessagingTestSeeder.seed (src/lib/test-utils/messaging-test-seeder.ts:121:32)
    at async POST (src/app/api/test/messaging/seed/route.ts:162:24)
  193 |       if (error) {
  194 |         console.error('Supabase error creating conversation:', error);
> 195 |         throw new Error(`Database error: ${error.message}`);
      |               ^
  196 |       }
  197 |
  198 |       if (!data) {
[Messaging Seed Route] Failed to seed test data Error: Database error: duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"
    at SupabaseConversationRepository.create (src/repositories/implementations/supabase/SupabaseConversationRepository.ts:195:15)
    at async MessagingTestSeeder.seed (src/lib/test-utils/messaging-test-seeder.ts:121:32)
    at async POST (src/app/api/test/messaging/seed/route.ts:162:24)
  193 |       if (error) {
  194 |         console.error('Supabase error creating conversation:', error);
> 195 |         throw new Error(`Database error: ${error.message}`);
      |               ^
  196 |       }
  197 |
  198 |       if (!data) {
 POST /api/test/messaging/seed 500 in 1946ms (compile: 475ms, proxy.ts: 5ms, render: 1466ms)
Repository creating conversation with data: {
  "type": "direct",
  "participants": [
    "6281f07f-1253-444b-b3ae-1c18088893ee",
    "4ddaea29-59fb-47b9-a09b-17b24ad824e6"
  ],
  "lastActivity": "2025-10-28T23:00:09.973Z",
  "name": "test_dm_7245b3bc-bec6-40f6-8321-3e2ce2d6ff49",
  "isArchived": false,
  "visibility": "direct",
  "participantsFingerprint": "4ddaea29-59fb-47b9-a09b-17b24ad824e6:6281f07f-1253-444b-b3ae-1c18088893ee"
}
Supabase error creating conversation: {
  code: '23505',
  details: 'Key (participants_fingerprint)=(db19890c6a08858fae0950fee334a625) already exists.',
  hint: null,
  message: 'duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"'
}
Repository error in create(): Error: Database error: duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"
    at SupabaseConversationRepository.create (src/repositories/implementations/supabase/SupabaseConversationRepository.ts:195:15)
    at async MessagingTestSeeder.seed (src/lib/test-utils/messaging-test-seeder.ts:121:32)
    at async POST (src/app/api/test/messaging/seed/route.ts:162:24)
  193 |       if (error) {
  194 |         console.error('Supabase error creating conversation:', error);
> 195 |         throw new Error(`Database error: ${error.message}`);
      |               ^
  196 |       }
  197 |
  198 |       if (!data) {
[Messaging Seed Route] Failed to seed test data Error: Database error: duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"
    at SupabaseConversationRepository.create (src/repositories/implementations/supabase/SupabaseConversationRepository.ts:195:15)
    at async MessagingTestSeeder.seed (src/lib/test-utils/messaging-test-seeder.ts:121:32)
    at async POST (src/app/api/test/messaging/seed/route.ts:162:24)
  193 |       if (error) {
  194 |         console.error('Supabase error creating conversation:', error);
> 195 |         throw new Error(`Database error: ${error.message}`);
      |               ^
  196 |       }
  197 |
  198 |       if (!data) {
 POST /api/test/messaging/seed 500 in 2.4s (compile: 515ms, proxy.ts: 10ms, render: 1842ms)
^C^C
```

 ```playwright console errors
     23 …eractions.spec.ts:318:3 › AC4: Navigate Space → Drawer Stability › should handle rapid space navigation without drawer issues
[WebServer] [Middleware] Path: /api/test/messaging/seed, User: None, Error: Auth session missing!
[WebServer] [Middleware] Path: /api/test/messaging/seed, User: None, Error: Auth session missing!
[dotenv@17.2.3] injecting env (0) from .env.local -- tip: ⚙️  specify custom .env file path with { path: '/custom/path/.env' }
     24 …eractions.spec.ts:318:3 › AC4: Navigate Space → Drawer Stability › should handle rapid space navigation without drawer issues
[WebServer] [Middleware] Path: /api/test/messaging/seed, User: None, Error: Auth session missing!
[WebServer] Repository creating conversation with data: {
[WebServer]   "type": "direct",
[WebServer]   "participants": [
[WebServer]     "6281f07f-1253-444b-b3ae-1c18088893ee",
[WebServer]     "4ddaea29-59fb-47b9-a09b-17b24ad824e6"
[WebServer]   ],
[WebServer]   "lastActivity": "2025-10-28T22:48:36.302Z",
[WebServer]   "name": "test_dm_8b98f076-607c-4361-8a4d-1b2ff18c44d1",
[WebServer]   "isArchived": false,
[WebServer]   "visibility": "direct",
[WebServer]   "participantsFingerprint": "4ddaea29-59fb-47b9-a09b-17b24ad824e6:6281f07f-1253-444b-b3ae-1c18088893ee"
[WebServer] }
[WebServer] Supabase error creating conversation: {
[WebServer]   code: '23505',
[WebServer]   details: 'Key (participants_fingerprint)=(db19890c6a08858fae0950fee334a625) already exists.',
[WebServer]   hint: null,
[WebServer]   message: 'duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"'
[WebServer] }
[WebServer] Repository error in create(): Error: Database error: duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"
[WebServer]     at SupabaseConversationRepository.create (src/repositories/implementations/supabase/SupabaseConversationRepository.ts:195:15)
[WebServer]     at async MessagingTestSeeder.seed (src/lib/test-utils/messaging-test-seeder.ts:121:32)
[WebServer]     at async POST (src/app/api/test/messaging/seed/route.ts:162:24)
[WebServer]   193 |       if (error) {
[WebServer]   194 |         console.error('Supabase error creating conversation:', error);
[WebServer] > 195 |         throw new Error(`Database error: ${error.message}`);
[WebServer]       |               ^
[WebServer]   196 |       }
[WebServer]   197 |
[WebServer]   198 |       if (!data) {
[WebServer] [Messaging Seed Route] Failed to seed test data Error: Database error: duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"
[WebServer]     at SupabaseConversationRepository.create (src/repositories/implementations/supabase/SupabaseConversationRepository.ts:195:15)
[WebServer]     at async MessagingTestSeeder.seed (src/lib/test-utils/messaging-test-seeder.ts:121:32)
[WebServer]     at async POST (src/app/api/test/messaging/seed/route.ts:162:24)
[WebServer]   193 |       if (error) {
[WebServer]   194 |         console.error('Supabase error creating conversation:', error);
[WebServer] > 195 |         throw new Error(`Database error: ${error.message}`);
[WebServer]       |               ^
[WebServer]   196 |       }
[WebServer]   197 |
[WebServer]   198 |       if (!data) {
[WebServer]  POST /api/test/messaging/seed 500 in 772ms (compile: 8ms, proxy.ts: 5ms, render: 760ms)
[WebServer] Repository creating conversation with data: {
[WebServer]   "type": "direct",
[WebServer]   "participants": [
[WebServer]     "6281f07f-1253-444b-b3ae-1c18088893ee",
[WebServer]     "4ddaea29-59fb-47b9-a09b-17b24ad824e6"
[WebServer]   ],
[WebServer]   "lastActivity": "2025-10-28T22:48:36.485Z",
[WebServer]   "name": "test_dm_2d7b1fdc-6053-4080-821b-0a2b3e3bd221",
[WebServer]   "isArchived": false,
[WebServer]   "visibility": "direct",
[WebServer]   "participantsFingerprint": "4ddaea29-59fb-47b9-a09b-17b24ad824e6:6281f07f-1253-444b-b3ae-1c18088893ee"
[WebServer] }
[WebServer] Supabase error creating conversation: {
[WebServer]   code: '23505',
[WebServer]   details: 'Key (participants_fingerprint)=(db19890c6a08858fae0950fee334a625) already exists.',
[WebServer]   hint: null,
[WebServer]   message: 'duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"'
[WebServer] }
[WebServer] Repository error in create(): Error: Database error: duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"
[WebServer]     at SupabaseConversationRepository.create (src/repositories/implementations/supabase/SupabaseConversationRepository.ts:195:15)
[WebServer]     at async MessagingTestSeeder.seed (src/lib/test-utils/messaging-test-seeder.ts:121:32)
[WebServer]     at async POST (src/app/api/test/messaging/seed/route.ts:162:24)
[WebServer]   193 |       if (error) {
[WebServer]   194 |         console.error('Supabase error creating conversation:', error);
[WebServer] > 195 |         throw new Error(`Database error: ${error.message}`);
[WebServer]       |               ^
[WebServer]   196 |       }
[WebServer]   197 |
[WebServer]   198 |       if (!data) {
[WebServer] [Messaging Seed Route] Failed to seed test data Error: Database error: duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"
[WebServer]     at SupabaseConversationRepository.create (src/repositories/implementations/supabase/SupabaseConversationRepository.ts:195:15)
[WebServer]     at async MessagingTestSeeder.seed (src/lib/test-utils/messaging-test-seeder.ts:121:32)
[WebServer]     at async POST (src/app/api/test/messaging/seed/route.ts:162:24)
[WebServer]   193 |       if (error) {
[WebServer]   194 |         console.error('Supabase error creating conversation:', error);
[WebServer] > 195 |         throw new Error(`Database error: ${error.message}`);
[WebServer]       |               ^
[WebServer]   196 |       }
[WebServer]   197 |
[WebServer]   198 |       if (!data) {
[WebServer]  POST /api/test/messaging/seed 500 in 1022ms (compile: 2ms, proxy.ts: 3ms, render: 1016ms)
  ✘  22 …ns.spec.ts:318:3 › AC4: Navigate Space → Drawer Stability › should handle rapid space navigation without drawer issues (1.1s)
[WebServer] Repository creating conversation with data: {
[WebServer]   "type": "direct",
[WebServer]   "participants": [
[WebServer]     "6281f07f-1253-444b-b3ae-1c18088893ee",
[WebServer]     "4ddaea29-59fb-47b9-a09b-17b24ad824e6"
[WebServer]   ],
[WebServer]   "lastActivity": "2025-10-28T22:48:36.754Z",
[WebServer]   "name": "test_dm_e63b0556-f604-447d-92be-4fc1537bac46",
[WebServer]   "isArchived": false,
[WebServer]   "visibility": "direct",
[WebServer]   "participantsFingerprint": "4ddaea29-59fb-47b9-a09b-17b24ad824e6:6281f07f-1253-444b-b3ae-1c18088893ee"
[WebServer] }
  ✘  23 …s.spec.ts:318:3 › AC4: Navigate Space → Drawer Stability › should handle rapid space navigation without drawer issues (803ms)
[WebServer] Supabase error creating conversation: {
[WebServer]   code: '23505',
[WebServer]   details: 'Key (participants_fingerprint)=(db19890c6a08858fae0950fee334a625) already exists.',
[WebServer]   hint: null,
[WebServer]   message: 'duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"'
[WebServer] }
[WebServer] Repository error in create(): Error: Database error: duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"
[WebServer]     at SupabaseConversationRepository.create (src/repositories/implementations/supabase/SupabaseConversationRepository.ts:195:15)
[WebServer]     at async MessagingTestSeeder.seed (src/lib/test-utils/messaging-test-seeder.ts:121:32)
[WebServer]     at async POST (src/app/api/test/messaging/seed/route.ts:162:24)
[WebServer]   193 |       if (error) {
[WebServer]   194 |         console.error('Supabase error creating conversation:', error);
[WebServer] > 195 |         throw new Error(`Database error: ${error.message}`);
[WebServer]       |               ^
[WebServer]   196 |       }
[WebServer]   197 |
[WebServer]   198 |       if (!data) {
[WebServer] [Messaging Seed Route] Failed to seed test data Error: Database error: duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"
[WebServer]     at SupabaseConversationRepository.create (src/repositories/implementations/supabase/SupabaseConversationRepository.ts:195:15)
[WebServer]     at async MessagingTestSeeder.seed (src/lib/test-utils/messaging-test-seeder.ts:121:32)
[WebServer]     at async POST (src/app/api/test/messaging/seed/route.ts:162:24)
[WebServer]   193 |       if (error) {
[WebServer]   194 |         console.error('Supabase error creating conversation:', error);
[WebServer] > 195 |         throw new Error(`Database error: ${error.message}`);
[WebServer]       |               ^
[WebServer]   196 |       }
[WebServer]   197 |
[WebServer]   198 |       if (!data) {
[WebServer]  POST /api/test/messaging/seed 500 in 1078ms (compile: 2ms, proxy.ts: 3ms, render: 1073ms)
  ✘  24 …ns.spec.ts:318:3 › AC4: Navigate Space → Drawer Stability › should handle rapid space navigation without drawer issues (1.1s)
[dotenv@17.2.3] injecting env (0) from .env.local -- tip: ⚙️  enable debug logging with { debug: true }
     25 …-4A-drawer-interactions.spec.ts:350:3 › AC5: Archive Conversation Flow › should archive and unarchive conversations correctly
[dotenv@17.2.3] injecting env (0) from .env.local -- tip: 🔐 prevent committing .env to code: https://dotenvx.com/precommit
[WebServer] [Middleware] Path: /api/test/messaging/seed, User: None, Error: Auth session missing!
     26 …-4A-drawer-interactions.spec.ts:350:3 › AC5: Archive Conversation Flow › should archive and unarchive conversations correctly
[WebServer] [Middleware] Path: /api/test/messaging/seed, User: None, Error: Auth session missing!
[dotenv@17.2.3] injecting env (0) from .env.local -- tip: 🔐 encrypt with Dotenvx: https://dotenvx.com
     27 …-4A-drawer-interactions.spec.ts:350:3 › AC5: Archive Conversation Flow › should archive and unarchive conversations correctly
[WebServer] [Middleware] Path: /api/test/messaging/seed, User: None, Error: Auth session missing!
[WebServer] Repository creating conversation with data: {
[WebServer]   "type": "direct",
[WebServer]   "participants": [
[WebServer]     "6281f07f-1253-444b-b3ae-1c18088893ee",
[WebServer]     "4ddaea29-59fb-47b9-a09b-17b24ad824e6"
[WebServer]   ],
[WebServer]   "lastActivity": "2025-10-28T22:48:37.493Z",
[WebServer]   "name": "test_dm_311c933c-61bc-4665-afa6-2922e1ffdfb4",
[WebServer]   "isArchived": false,
[WebServer]   "visibility": "direct",
[WebServer]   "participantsFingerprint": "4ddaea29-59fb-47b9-a09b-17b24ad824e6:6281f07f-1253-444b-b3ae-1c18088893ee"
[WebServer] }
[WebServer] Supabase error creating conversation: {
[WebServer]   code: '23505',
[WebServer]   details: 'Key (participants_fingerprint)=(db19890c6a08858fae0950fee334a625) already exists.',
[WebServer]   hint: null,
[WebServer]   message: 'duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"'
[WebServer] }
[WebServer] Repository error in create(): Error: Database error: duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"
[WebServer]     at SupabaseConversationRepository.create (src/repositories/implementations/supabase/SupabaseConversationRepository.ts:195:15)
[WebServer]     at async MessagingTestSeeder.seed (src/lib/test-utils/messaging-test-seeder.ts:121:32)
[WebServer]     at async POST (src/app/api/test/messaging/seed/route.ts:162:24)
[WebServer]   193 |       if (error) {
[WebServer]   194 |         console.error('Supabase error creating conversation:', error);
[WebServer] > 195 |         throw new Error(`Database error: ${error.message}`);
[WebServer]       |               ^
[WebServer]   196 |       }
[WebServer]   197 |
[WebServer]   198 |       if (!data) {
[WebServer] [Messaging Seed Route] Failed to seed test data Error: Database error: duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"
[WebServer]     at SupabaseConversationRepository.create (src/repositories/implementations/supabase/SupabaseConversationRepository.ts:195:15)
[WebServer]     at async MessagingTestSeeder.seed (src/lib/test-utils/messaging-test-seeder.ts:121:32)
[WebServer]     at async POST (src/app/api/test/messaging/seed/route.ts:162:24)
[WebServer]   193 |       if (error) {
[WebServer]   194 |         console.error('Supabase error creating conversation:', error);
[WebServer] > 195 |         throw new Error(`Database error: ${error.message}`);
[WebServer]       |               ^
[WebServer]   196 |       }
[WebServer]   197 |
[WebServer]   198 |       if (!data) {
[WebServer]  POST /api/test/messaging/seed 500 in 698ms (compile: 2ms, proxy.ts: 6ms, render: 690ms)
[WebServer] Repository creating conversation with data: {
[WebServer]   "type": "direct",
[WebServer]   "participants": [
[WebServer]     "6281f07f-1253-444b-b3ae-1c18088893ee",
[WebServer]     "4ddaea29-59fb-47b9-a09b-17b24ad824e6"
[WebServer]   ],
[WebServer]   "lastActivity": "2025-10-28T22:48:37.706Z",
[WebServer]   "name": "test_dm_53d2a74c-d518-41b6-b341-5eed6cbe804b",
[WebServer]   "isArchived": false,
[WebServer]   "visibility": "direct",
[WebServer]   "participantsFingerprint": "4ddaea29-59fb-47b9-a09b-17b24ad824e6:6281f07f-1253-444b-b3ae-1c18088893ee"
[WebServer] }
[WebServer] Supabase error creating conversation: {
[WebServer]   code: '23505',
[WebServer]   details: 'Key (participants_fingerprint)=(db19890c6a08858fae0950fee334a625) already exists.',
[WebServer]   hint: null,
[WebServer]   message: 'duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"'
[WebServer] }
[WebServer] Repository error in create(): Error: Database error: duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"
[WebServer]     at SupabaseConversationRepository.create (src/repositories/implementations/supabase/SupabaseConversationRepository.ts:195:15)
[WebServer]     at async MessagingTestSeeder.seed (src/lib/test-utils/messaging-test-seeder.ts:121:32)
[WebServer]     at async POST (src/app/api/test/messaging/seed/route.ts:162:24)
[WebServer]   193 |       if (error) {
[WebServer]   194 |         console.error('Supabase error creating conversation:', error);
[WebServer] > 195 |         throw new Error(`Database error: ${error.message}`);
[WebServer]       |               ^
[WebServer]   196 |       }
[WebServer]   197 |
[WebServer]   198 |       if (!data) {
[WebServer] [Messaging Seed Route] Failed to seed test data Error: Database error: duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"
[WebServer]     at SupabaseConversationRepository.create (src/repositories/implementations/supabase/SupabaseConversationRepository.ts:195:15)
[WebServer]     at async MessagingTestSeeder.seed (src/lib/test-utils/messaging-test-seeder.ts:121:32)
[WebServer]     at async POST (src/app/api/test/messaging/seed/route.ts:162:24)
[WebServer]   193 |       if (error) {
[WebServer]   194 |         console.error('Supabase error creating conversation:', error);
[WebServer] > 195 |         throw new Error(`Database error: ${error.message}`);
[WebServer]       |               ^
[WebServer]   196 |       }
[WebServer]   197 |
[WebServer]   198 |       if (!data) {
[WebServer]  POST /api/test/messaging/seed 500 in 1004ms (compile: 3ms, proxy.ts: 3ms, render: 997ms)
  ✘  25 …wer-interactions.spec.ts:350:3 › AC5: Archive Conversation Flow › should archive and unarchive conversations correctly (1.0s)
[WebServer] Repository creating conversation with data: {
[WebServer]   "type": "direct",
[WebServer]   "participants": [
[WebServer]     "6281f07f-1253-444b-b3ae-1c18088893ee",
[WebServer]     "4ddaea29-59fb-47b9-a09b-17b24ad824e6"
[WebServer]   ],
[WebServer]   "lastActivity": "2025-10-28T22:48:38.034Z",
[WebServer]   "name": "test_dm_5cd1572c-e656-4032-a0c6-dc37a1c1f4b1",
[WebServer]   "isArchived": false,
[WebServer]   "visibility": "direct",
[WebServer]   "participantsFingerprint": "4ddaea29-59fb-47b9-a09b-17b24ad824e6:6281f07f-1253-444b-b3ae-1c18088893ee"
[WebServer] }
[WebServer] Supabase error creating conversation: {
[WebServer]   code: '23505',
[WebServer]   details: 'Key (participants_fingerprint)=(db19890c6a08858fae0950fee334a625) already exists.',
[WebServer]   hint: null,
[WebServer]   message: 'duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"'
[WebServer] }
  ✘  26 …er-interactions.spec.ts:350:3 › AC5: Archive Conversation Flow › should archive and unarchive conversations correctly (734ms)
[WebServer] Repository error in create(): Error: Database error: duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"
[WebServer]     at SupabaseConversationRepository.create (src/repositories/implementations/supabase/SupabaseConversationRepository.ts:195:15)
[WebServer]     at async MessagingTestSeeder.seed (src/lib/test-utils/messaging-test-seeder.ts:121:32)
[WebServer]     at async POST (src/app/api/test/messaging/seed/route.ts:162:24)
[WebServer]   193 |       if (error) {
[WebServer]   194 |         console.error('Supabase error creating conversation:', error);
[WebServer] > 195 |         throw new Error(`Database error: ${error.message}`);
[WebServer]       |               ^
[WebServer]   196 |       }
[WebServer]   197 |
[WebServer]   198 |       if (!data) {
[WebServer] [Messaging Seed Route] Failed to seed test data Error: Database error: duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"
[WebServer]     at SupabaseConversationRepository.create (src/repositories/implementations/supabase/SupabaseConversationRepository.ts:195:15)
[WebServer]     at async MessagingTestSeeder.seed (src/lib/test-utils/messaging-test-seeder.ts:121:32)
[WebServer]     at async POST (src/app/api/test/messaging/seed/route.ts:162:24)
[WebServer]   193 |       if (error) {
[WebServer]   194 |         console.error('Supabase error creating conversation:', error);
[WebServer] > 195 |         throw new Error(`Database error: ${error.message}`);
[WebServer]       |               ^
[WebServer]   196 |       }
[WebServer]   197 |
[WebServer]   198 |       if (!data) {
[WebServer]  POST /api/test/messaging/seed 500 in 1019ms (compile: 2ms, proxy.ts: 4ms, render: 1013ms)
  ✘  27 …wer-interactions.spec.ts:350:3 › AC5: Archive Conversation Flow › should archive and unarchive conversations correctly (1.1s)
[dotenv@17.2.3] injecting env (0) from .env.local -- tip: 👥 sync secrets across teammates & machines: https://dotenvx.com/ops
     28 …4A-drawer-interactions.spec.ts:415:3 › AC6: Test Suite Quality › should complete a full test cycle within performance targets
[WebServer] [Middleware] Path: /api/test/messaging/seed, User: None, Error: Auth session missing!
[dotenv@17.2.3] injecting env (0) from .env.local -- tip: 🔄 add secrets lifecycle management: https://dotenvx.com/ops
     29 …4A-drawer-interactions.spec.ts:415:3 › AC6: Test Suite Quality › should complete a full test cycle within performance targets
[WebServer] [Middleware] Path: /api/test/messaging/seed, User: None, Error: Auth session missing!
[dotenv@17.2.3] injecting env (0) from .env.local -- tip: ⚙️  write to custom object with { processEnv: myObject }
     30 …4A-drawer-interactions.spec.ts:415:3 › AC6: Test Suite Quality › should complete a full test cycle within performance targets
[WebServer] [Middleware] Path: /api/test/messaging/seed, User: None, Error: Auth session missing!
[WebServer] Repository creating conversation with data: {
[WebServer]   "type": "direct",
[WebServer]   "participants": [
[WebServer]     "6281f07f-1253-444b-b3ae-1c18088893ee",
[WebServer]     "4ddaea29-59fb-47b9-a09b-17b24ad824e6"
[WebServer]   ],
[WebServer]   "lastActivity": "2025-10-28T22:48:39.191Z",
[WebServer]   "name": "test_dm_3b3fcba5-e579-4ebe-8dc5-6f63e46f5c93",
[WebServer]   "isArchived": false,
[WebServer]   "visibility": "direct",
[WebServer]   "participantsFingerprint": "4ddaea29-59fb-47b9-a09b-17b24ad824e6:6281f07f-1253-444b-b3ae-1c18088893ee"
[WebServer] }
[WebServer] Supabase error creating conversation: {
[WebServer]   code: '23505',
[WebServer]   details: 'Key (participants_fingerprint)=(db19890c6a08858fae0950fee334a625) already exists.',
[WebServer]   hint: null,
[WebServer]   message: 'duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"'
[WebServer] }
[WebServer] Repository error in create(): Error: Database error: duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"
[WebServer]     at SupabaseConversationRepository.create (src/repositories/implementations/supabase/SupabaseConversationRepository.ts:195:15)
[WebServer]     at async MessagingTestSeeder.seed (src/lib/test-utils/messaging-test-seeder.ts:121:32)
[WebServer]     at async POST (src/app/api/test/messaging/seed/route.ts:162:24)
[WebServer]   193 |       if (error) {
[WebServer]   194 |         console.error('Supabase error creating conversation:', error);
[WebServer] > 195 |         throw new Error(`Database error: ${error.message}`);
[WebServer]       |               ^
[WebServer]   196 |       }
[WebServer]   197 |
[WebServer]   198 |       if (!data) {
[WebServer] [Messaging Seed Route] Failed to seed test data Error: Database error: duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"
[WebServer]     at SupabaseConversationRepository.create (src/repositories/implementations/supabase/SupabaseConversationRepository.ts:195:15)
[WebServer]     at async MessagingTestSeeder.seed (src/lib/test-utils/messaging-test-seeder.ts:121:32)
[WebServer]     at async POST (src/app/api/test/messaging/seed/route.ts:162:24)
[WebServer]   193 |       if (error) {
[WebServer]   194 |         console.error('Supabase error creating conversation:', error);
[WebServer] > 195 |         throw new Error(`Database error: ${error.message}`);
[WebServer]       |               ^
[WebServer]   196 |       }
[WebServer]   197 |
[WebServer]   198 |       if (!data) {
[WebServer]  POST /api/test/messaging/seed 500 in 761ms (compile: 4ms, proxy.ts: 6ms, render: 751ms)
[WebServer] Repository creating conversation with data: {
[WebServer]   "type": "direct",
[WebServer]   "participants": [
[WebServer]     "6281f07f-1253-444b-b3ae-1c18088893ee",
[WebServer]     "4ddaea29-59fb-47b9-a09b-17b24ad824e6"
[WebServer]   ],
[WebServer]   "lastActivity": "2025-10-28T22:48:39.524Z",
[WebServer]   "name": "test_dm_48f3c782-1c2d-4a58-a15a-0bde1f61d9fc",
[WebServer]   "isArchived": false,
[WebServer]   "visibility": "direct",
[WebServer]   "participantsFingerprint": "4ddaea29-59fb-47b9-a09b-17b24ad824e6:6281f07f-1253-444b-b3ae-1c18088893ee"
[WebServer] }
[WebServer] Supabase error creating conversation: {
[WebServer]   code: '23505',
[WebServer]   details: 'Key (participants_fingerprint)=(db19890c6a08858fae0950fee334a625) already exists.',
[WebServer]   hint: null,
[WebServer]   message: 'duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"'
[WebServer] }
[WebServer] Repository error in create(): Error: Database error: duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"
[WebServer]     at SupabaseConversationRepository.create (src/repositories/implementations/supabase/SupabaseConversationRepository.ts:195:15)
[WebServer]     at async MessagingTestSeeder.seed (src/lib/test-utils/messaging-test-seeder.ts:121:32)
[WebServer]     at async POST (src/app/api/test/messaging/seed/route.ts:162:24)
[WebServer]   193 |       if (error) {
[WebServer]   194 |         console.error('Supabase error creating conversation:', error);
[WebServer] > 195 |         throw new Error(`Database error: ${error.message}`);
[WebServer]       |               ^
[WebServer]   196 |       }
[WebServer]   197 |
[WebServer]   198 |       if (!data) {
[WebServer] [Messaging Seed Route] Failed to seed test data Error: Database error: duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"
[WebServer]     at SupabaseConversationRepository.create (src/repositories/implementations/supabase/SupabaseConversationRepository.ts:195:15)
[WebServer]     at async MessagingTestSeeder.seed (src/lib/test-utils/messaging-test-seeder.ts:121:32)
[WebServer]     at async POST (src/app/api/test/messaging/seed/route.ts:162:24)
[WebServer]   193 |       if (error) {
[WebServer]   194 |         console.error('Supabase error creating conversation:', error);
[WebServer] > 195 |         throw new Error(`Database error: ${error.message}`);
[WebServer]       |               ^
[WebServer]   196 |       }
[WebServer]   197 |
[WebServer]   198 |       if (!data) {
[WebServer]  POST /api/test/messaging/seed 500 in 855ms (compile: 4ms, proxy.ts: 6ms, render: 845ms)
[WebServer] Repository creating conversation with data: {
[WebServer]   "type": "direct",
[WebServer]   "participants": [
[WebServer]     "6281f07f-1253-444b-b3ae-1c18088893ee",
[WebServer]     "4ddaea29-59fb-47b9-a09b-17b24ad824e6"
[WebServer]   ],
[WebServer]   "lastActivity": "2025-10-28T22:48:39.816Z",
[WebServer]   "name": "test_dm_849ac29b-be9b-461d-8ac0-2927be783b2f",
[WebServer]   "isArchived": false,
[WebServer]   "visibility": "direct",
[WebServer]   "participantsFingerprint": "4ddaea29-59fb-47b9-a09b-17b24ad824e6:6281f07f-1253-444b-b3ae-1c18088893ee"
[WebServer] }
[WebServer] Supabase error creating conversation: {
[WebServer]   code: '23505',
[WebServer]   details: 'Key (participants_fingerprint)=(db19890c6a08858fae0950fee334a625) already exists.',
[WebServer]   hint: null,
[WebServer]   message: 'duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"'
[WebServer] }
  ✘  29 …r-interactions.spec.ts:415:3 › AC6: Test Suite Quality › should complete a full test cycle within performance targets (893ms)
  ✘  28 …r-interactions.spec.ts:415:3 › AC6: Test Suite Quality › should complete a full test cycle within performance targets (800ms)
[WebServer] Repository error in create(): Error: Database error: duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"
[WebServer]     at SupabaseConversationRepository.create (src/repositories/implementations/supabase/SupabaseConversationRepository.ts:195:15)
[WebServer]     at async MessagingTestSeeder.seed (src/lib/test-utils/messaging-test-seeder.ts:121:32)
[WebServer]     at async POST (src/app/api/test/messaging/seed/route.ts:162:24)
[WebServer]   193 |       if (error) {
[WebServer]   194 |         console.error('Supabase error creating conversation:', error);
[WebServer] > 195 |         throw new Error(`Database error: ${error.message}`);
[WebServer]       |               ^
[WebServer]   196 |       }
[WebServer]   197 |
[WebServer]   198 |       if (!data) {
[WebServer] [Messaging Seed Route] Failed to seed test data Error: Database error: duplicate key value violates unique constraint "uniq_direct_participants_fingerprint"
[WebServer]     at SupabaseConversationRepository.create (src/repositories/implementations/supabase/SupabaseConversationRepository.ts:195:15)
[WebServer]     at async MessagingTestSeeder.seed (src/lib/test-utils/messaging-test-seeder.ts:121:32)
[WebServer]     at async POST (src/app/api/test/messaging/seed/route.ts:162:24)
[WebServer]   193 |       if (error) {
[WebServer]   194 |         console.error('Supabase error creating conversation:', error);
[WebServer] > 195 |         throw new Error(`Database error: ${error.message}`);
[WebServer]       |               ^
[WebServer]   196 |       }
[WebServer]   197 |
[WebServer]   198 |       if (!data) {
[WebServer]  POST /api/test/messaging/seed 500 in 1013ms (compile: 1896µs, proxy.ts: 4ms, render: 1007ms)
  ✘  30 …er-interactions.spec.ts:415:3 › AC6: Test Suite Quality › should complete a full test cycle within performance targets (1.0s)


  1) [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:44:3 › AC1: Open Drawer → Select DM → Send Message → Realtime Delivery › should open drawer, select DM, send message, and verify realtime delivery 

    Error: Failed to seed messaging data: 500 Internal Server Error

       at fixtures/messaging.ts:43

      41 |
      42 |   if (!response.ok()) {
    > 43 |     throw new Error(`Failed to seed messaging data: ${response.status()} ${response.statusText()}`);
         |           ^
      44 |   }
      45 |
      46 |   const body = await response.json();
        at seedMessagingData (/home/giuice/apps/virtual-office/__tests__/api/playwright/fixtures/messaging.ts:43:11)
        at Object.messagingData (/home/giuice/apps/virtual-office/__tests__/api/playwright/fixtures/messaging.ts:122:18)

  2) [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:103:3 › AC1: Open Drawer → Select DM → Send Message → Realtime Delivery › should handle message send errors gracefully 

    Error: Failed to seed messaging data: 500 Internal Server Error

       at fixtures/messaging.ts:43

      41 |
      42 |   if (!response.ok()) {
    > 43 |     throw new Error(`Failed to seed messaging data: ${response.status()} ${response.statusText()}`);
         |           ^
      44 |   }
      45 |
      46 |   const body = await response.json();
        at seedMessagingData (/home/giuice/apps/virtual-office/__tests__/api/playwright/fixtures/messaging.ts:43:11)
        at Object.messagingData (/home/giuice/apps/virtual-office/__tests__/api/playwright/fixtures/messaging.ts:122:18)

  3) [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:137:3 › AC2: Filter Conversations by Pinned › should filter conversations by pinned status 

    Error: Failed to seed messaging data: 500 Internal Server Error

       at fixtures/messaging.ts:43

      41 |
      42 |   if (!response.ok()) {
    > 43 |     throw new Error(`Failed to seed messaging data: ${response.status()} ${response.statusText()}`);
         |           ^
      44 |   }
      45 |
      46 |   const body = await response.json();
        at seedMessagingData (/home/giuice/apps/virtual-office/__tests__/api/playwright/fixtures/messaging.ts:43:11)
        at Object.messagingData (/home/giuice/apps/virtual-office/__tests__/api/playwright/fixtures/messaging.ts:122:18)

  4) [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:175:3 › AC2: Filter Conversations by Pinned › should persist pinned filter state during drawer session 

    Error: Failed to seed messaging data: 500 Internal Server Error

       at fixtures/messaging.ts:43

      41 |
      42 |   if (!response.ok()) {
    > 43 |     throw new Error(`Failed to seed messaging data: ${response.status()} ${response.statusText()}`);
         |           ^
      44 |   }
      45 |
      46 |   const body = await response.json();
        at seedMessagingData (/home/giuice/apps/virtual-office/__tests__/api/playwright/fixtures/messaging.ts:43:11)
        at Object.messagingData (/home/giuice/apps/virtual-office/__tests__/api/playwright/fixtures/messaging.ts:122:18)

.... ommited

  30 failed
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:44:3 › AC1: Open Drawer → Select DM → Send Message → Realtime Delivery › should open drawer, select DM, send message, and verify realtime delivery 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:103:3 › AC1: Open Drawer → Select DM → Send Message → Realtime Delivery › should handle message send errors gracefully 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:137:3 › AC2: Filter Conversations by Pinned › should filter conversations by pinned status 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:175:3 › AC2: Filter Conversations by Pinned › should persist pinned filter state during drawer session 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:213:3 › AC3: Switch Between Room and DM Tabs › should switch between Rooms and DMs tabs with correct lists 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:253:3 › AC3: Switch Between Room and DM Tabs › should maintain filter state when switching tabs 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:292:3 › AC4: Navigate Space → Drawer Stability › should keep drawer open and stable during space navigation 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:318:3 › AC4: Navigate Space → Drawer Stability › should handle rapid space navigation without drawer issues 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:350:3 › AC5: Archive Conversation Flow › should archive and unarchive conversations correctly 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:415:3 › AC6: Test Suite Quality › should complete a full test cycle within performance targets 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:44:3 › AC1: Open Drawer → Select DM → Send Message → Realtime Delivery › should open drawer, select DM, send message, and verify realtime delivery 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:103:3 › AC1: Open Drawer → Select DM → Send Message → Realtime Delivery › should handle message send errors gracefully 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:137:3 › AC2: Filter Conversations by Pinned › should filter conversations by pinned status 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:175:3 › AC2: Filter Conversations by Pinned › should persist pinned filter state during drawer session 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:213:3 › AC3: Switch Between Room and DM Tabs › should switch between Rooms and DMs tabs with correct lists 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:253:3 › AC3: Switch Between Room and DM Tabs › should maintain filter state when switching tabs 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:292:3 › AC4: Navigate Space → Drawer Stability › should keep drawer open and stable during space navigation 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:318:3 › AC4: Navigate Space → Drawer Stability › should handle rapid space navigation without drawer issues 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:350:3 › AC5: Archive Conversation Flow › should archive and unarchive conversations correctly 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:415:3 › AC6: Test Suite Quality › should complete a full test cycle within performance targets 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:44:3 › AC1: Open Drawer → Select DM → Send Message → Realtime Delivery › should open drawer, select DM, send message, and verify realtime delivery 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:103:3 › AC1: Open Drawer → Select DM → Send Message → Realtime Delivery › should handle message send errors gracefully 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:137:3 › AC2: Filter Conversations by Pinned › should filter conversations by pinned status 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:175:3 › AC2: Filter Conversations by Pinned › should persist pinned filter state during drawer session 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:213:3 › AC3: Switch Between Room and DM Tabs › should switch between Rooms and DMs tabs with correct lists 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:253:3 › AC3: Switch Between Room and DM Tabs › should maintain filter state when switching tabs 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:292:3 › AC4: Navigate Space → Drawer Stability › should keep drawer open and stable during space navigation 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:318:3 › AC4: Navigate Space → Drawer Stability › should handle rapid space navigation without drawer issues 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:350:3 › AC5: Archive Conversation Flow › should archive and unarchive conversations correctly 
    [messaging-drawer] › __tests__/api/playwright/epic-4A-drawer-interactions.spec.ts:415:3 › AC6: Test Suite Quality › should complete a full test cycle within performance targets 
``` 