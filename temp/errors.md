⨯ Error: `cookies` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context
    at createSupabaseServerClient (src/lib/supabase/server-client.ts:6:34)
    at <unknown> (src/app/api/users/get-by-id/route.ts:7:50)
    at [project]/src/app/api/users/get-by-id/route.ts [app-route] (ecmascript) (.next/server/chunks/[root-of-the-server]__da58b64d._.js:1557:1)
    at Object.<anonymous> (.next/server/app/api/users/get-by-id/route.js:10:9)
  4 |
  5 | export async function createSupabaseServerClient(role?: 'service_role') {
> 6 |   const cookieStore = await cookies()
    |                                  ^
  7 |   
  8 |   // If service_role is requested, use the service role key instead of the anon key
  9 |   if (role === 'service_role') { {
  page: '/api/users/get-by-id'
}
[UserRepository] Fetching all users with avatar data
Error fetching all users: TypeError: this.supabase.from is not a function
    at SupabaseUserRepository.findAll (src/repositories/implementations/supabase/SupabaseUserRepository.ts:292:7)
    at GET (src/app/api/users/list/route.ts:15:47)
  290 |     console.log('[UserRepository] Fetching all users with avatar data');
  291 |     const { data, error } = await this.supabase
> 292 |       .from(this.TABLE_NAME)
      |       ^
  293 |       .select('*');
  294 |
  295 |     if (error) {
 GET /api/users/list 500 in 2327ms
Error fetching user by ID: {
  code: 'PGRST108',
  details: null,
  hint: "Verify that 'this' is included in the 'select' query parameter.",
  message: "'this' is not an embedded resource in this request"
}
Error in sync-profile: {
  code: 'PGRST108',
  details: null,
  hint: "Verify that 'this' is included in the 'select' query parameter.",
  message: "'this' is not an embedded resource in this request"
}
 POST /api/users/sync-profile 500 in 2174ms
Error fetching user by ID: {
  code: 'PGRST108',
  details: null,
  hint: "Verify that 'this' is included in the 'select' query parameter.",
  message: "'this' is not an embedded resource in this request"
}
Error in sync-profile: {
  code: 'PGRST108',
  details: null,
  hint: "Verify that 'this' is included in the 'select' query parameter.",
  message: "'this' is not an embedded resource in this request"
}
 POST /api/users/sync-profile 500 in 2250ms
 ✓ Compiled /api/users/list in 4.1s
 GET /api/users/get-by-id?supabase_uid=c8983e7c-9e9b-46e0-baa1-e7bf3d363da4 500 in 4308ms
[Middleware] Path: /api/users/get-by-id, User: c8983e7c-9e9b-46e0-baa1-e7bf3d363da4, Error: None
 ⨯ Error: `cookies` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context
    at createSupabaseServerClient (src/lib/supabase/server-client.ts:6:34)
    at <unknown> (src/app/api/users/get-by-id/route.ts:7:50)
    at [project]/src/app/api/users/get-by-id/route.ts [app-route] (ecmascript) (.next/server/chunks/[root-of-the-server]__da58b64d._.js:1557:1)
    at Object.<anonymous> (.next/server/app/api/users/get-by-id/route.js:10:9)
  4 |
  5 | export async function createSupabaseServerClient(role?: 'service_role') {
> 6 |   const cookieStore = await cookies()
    |                                  ^
  7 |   
  8 |   // If service_role is requested, use the service role key instead of the anon key
  9 |   if (role === 'service_role') { {
  page: '/api/users/get-by-id'
}
 GET /api/users/get-by-id?supabase_uid=c8983e7c-9e9b-46e0-baa1-e7bf3d363da4 500 in 139ms
[Middleware] Path: /create-company, User: c8983e7c-9e9b-46e0-baa1-e7bf3d363da4, Error: None
 ○ Compiling /create-company ...
 ✓ Compiled /create-company in 702ms
 GET /create-company 200 in 776ms
[Middleware] Path: /api/users/list, User: c8983e7c-9e9b-46e0-baa1-e7bf3d363da4, Error: None
[UserRepository] Fetching all users with avatar data
Error fetching all users: TypeError: this.supabase.from is not a function
    at SupabaseUserRepository.findAll (src/repositories/implementations/supabase/SupabaseUserRepository.ts:292:7)
    at GET (src/app/api/users/list/route.ts:15:47)
  290 |     console.log('[UserRepository] Fetching all users with avatar data');
  291 |     const { data, error } = await this.supabase
> 292 |       .from(this.TABLE_NAME)
      |       ^
  293 |       .select('*');
  294 |
  295 |     if (error) {
 GET /api/users/list 500 in 145ms
[Middleware] Path: /api/users/get-by-id, User: c8983e7c-9e9b-46e0-baa1-e7bf3d363da4, Error: None
[Middleware] Path: /, User: c8983e7c-9e9b-46e0-baa1-e7bf3d363da4, Error: None
 ⨯ Error: `cookies` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context
    at createSupabaseServerClient (src/lib/supabase/server-client.ts:6:34)
    at <unknown> (src/app/api/users/get-by-id/route.ts:7:50)
    at [project]/src/app/api/users/get-by-id/route.ts [app-route] (ecmascript) (.next/server/chunks/[root-of-the-server]__da58b64d._.js:1557:1)
    at Object.<anonymous> (.next/server/app/api/users/get-by-id/route.js:10:9)
  4 |
  5 | export async function createSupabaseServerClient(role?: 'service_role') {
> 6 |   const cookieStore = await cookies()
    |                                  ^
  7 |   
  8 |   // If service_role is requested, use the service role key instead of the anon key
  9 |   if (role === 'service_role') { {
  page: '/api/users/get-by-id'
}
 GET /api/users/get-by-id?supabase_uid=c8983e7c-9e9b-46e0-baa1-e7bf3d363da4 500 in 290ms
[useUserPresence] Initialize with userId: undefined
[PresenceContext] Current user ID: not set
[PresenceContext] Current user space ID: not in space
 GET / 307 in 311ms
[Middleware] Path: /login, User: c8983e7c-9e9b-46e0-baa1-e7bf3d363da4, Error: None
[useUserPresence] Initialize with userId: undefined
[PresenceContext] Current user ID: not set
[PresenceContext] Current user space ID: not in space
 GET /login 200 in 143ms
[Middleware] Path: /api/users/list, User: c8983e7c-9e9b-46e0-baa1-e7bf3d363da4, Error: None
[Middleware] Path: /api/users/sync-profile, User: c8983e7c-9e9b-46e0-baa1-e7bf3d363da4, Error: None
[UserRepository] Fetching all users with avatar data
Error fetching all users: TypeError: this.supabase.from is not a function
    at SupabaseUserRepository.findAll (src/repositories/implementations/supabase/SupabaseUserRepository.ts:292:7)
    at GET (src/app/api/users/list/route.ts:15:47)
  290 |     console.log('[UserRepository] Fetching all users with avatar data');
  291 |     const { data, error } = await this.supabase
> 292 |       .from(this.TABLE_NAME)
      |       ^
  293 |       .select('*');
  294 |
  295 |     if (error) {
 GET /api/users/list 500 in 186ms
[Middleware] Path: /api/users/sync-profile, User: c8983e7c-9e9b-46e0-baa1-e7bf3d363da4, Error: None
[Middleware] Path: /api/users/sync-profile, User: c8983e7c-9e9b-46e0-baa1-e7bf3d363da4, Error: None
[Middleware] Path: /api/users/get-by-id, User: c8983e7c-9e9b-46e0-baa1-e7bf3d363da4, Error: None
[Middleware] Path: /api/users/sync-profile, User: c8983e7c-9e9b-46e0-baa1-e7bf3d363da4, Error: None
 ⨯ Error: `cookies` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context
    at createSupabaseServerClient (src/lib/supabase/server-client.ts:6:34)
    at <unknown> (src/app/api/users/get-by-id/route.ts:7:50)
    at [project]/src/app/api/users/get-by-id/route.ts [app-route] (ecmascript) (.next/server/chunks/[root-of-the-server]__da58b64d._.js:1557:1)
    at Object.<anonymous> (.next/server/app/api/users/get-by-id/route.js:10:9)
  4 |
  5 | export async function createSupabaseServerClient(role?: 'service_role') {
> 6 |   const cookieStore = await cookies()
    |                                  ^
  7 |   
  8 |   // If service_role is requested, use the service role key instead of the anon key
  9 |   if (role === 'service_role') { {
  page: '/api/users/get-by-id'
}
Error fetching user by ID: {
  code: 'PGRST108',
  details: null,
  hint: "Verify that 'this' is included in the 'select' query parameter.",
  message: "'this' is not an embedded resource in this request"
}
Error in sync-profile: {
  code: 'PGRST108',
  details: null,
  hint: "Verify that 'this' is included in the 'select' query parameter.",
  message: "'this' is not an embedded resource in this request"
}
 POST /api/users/sync-profile 500 in 434ms
 GET /api/users/get-by-id?supabase_uid=c8983e7c-9e9b-46e0-baa1-e7bf3d363da4 500 in 445ms
Error fetching user by ID: {
  code: 'PGRST108',
  details: null,
  hint: "Verify that 'this' is included in the 'select' query parameter.",
  message: "'this' is not an embedded resource in this request"
}
Error in sync-profile: {
  code: 'PGRST108',
  details: null,
  hint: "Verify that 'this' is included in the 'select' query parameter.",
  message: "'this' is not an embedded resource in this request"
}
 POST /api/users/sync-profile 500 in 676ms
[Middleware] Path: /api/users/get-by-id, User: c8983e7c-9e9b-46e0-baa1-e7bf3d363da4, Error: None
Error fetching user by ID: {
  code: 'PGRST108',
  details: null,
  hint: "Verify that 'this' is included in the 'select' query parameter.",
  message: "'this' is not an embedded resource in this request"
}
Error in sync-profile: {
  code: 'PGRST108',
  details: null,
  hint: "Verify that 'this' is included in the 'select' query parameter.",
  message: "'this' is not an embedded resource in this request"
}
 POST /api/users/sync-profile 500 in 566ms
Error fetching user by ID: {
  code: 'PGRST108',
  details: null,
  hint: "Verify that 'this' is included in the 'select' query parameter.",
  message: "'this' is not an embedded resource in this request"
}
Error in sync-profile: {
  code: 'PGRST108',
  details: null,
  hint: "Verify that 'this' is included in the 'select' query parameter.",
  message: "'this' is not an embedded resource in this request"
}
 POST /api/users/sync-profile 500 in 654ms
 ⨯ Error: `cookies` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context
    at createSupabaseServerClient (src/lib/supabase/server-client.ts:6:34)
    at <unknown> (src/app/api/users/get-by-id/route.ts:7:50)
    at [project]/src/app/api/users/get-by-id/route.ts [app-route] (ecmascript) (.next/server/chunks/[root-of-the-server]__da58b64d._.js:1557:1)
    at Object.<anonymous> (.next/server/app/api/users/get-by-id/route.js:10:9)
  4 |
  5 | export async function createSupabaseServerClient(role?: 'service_role') {
> 6 |   const cookieStore = await cookies()
    |                                  ^
  7 |   
  8 |   // If service_role is requested, use the service role key instead of the anon key
  9 |   if (role === 'service_role') { {
  page: '/api/users/get-by-id'
}
 GET /api/users/get-by-id?supabase_uid=c8983e7c-9e9b-46e0-baa1-e7bf3d363da4 500 in 276ms
[Middleware] Path: /api/users/get-by-id, User: c8983e7c-9e9b-46e0-baa1-e7bf3d363da4, Error: None
 ⨯ Error: `cookies` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context
    at createSupabaseServerClient (src/lib/supabase/server-client.ts:6:34)
    at <unknown> (src/app/api/users/get-by-id/route.ts:7:50)
    at [project]/src/app/api/users/get-by-id/route.ts [app-route] (ecmascript) (.next/server/chunks/[root-of-the-server]__da58b64d._.js:1557:1)
    at Object.<anonymous> (.next/server/app/api/users/get-by-id/route.js:10:9)
  4 |
  5 | export async function createSupabaseServerClient(role?: 'service_role') {
> 6 |   const cookieStore = await cookies()
    |                                  ^
  7 |   
  8 |   // If service_role is requested, use the service role key instead of the anon key
  9 |   if (role === 'service_role') { {
  page: '/api/users/get-by-id'
}
 GET /api/users/get-by-id?supabase_uid=c8983e7c-9e9b-46e0-baa1-e7bf3d363da4 500 in 150ms
[Middleware] Path: /api/users/list, User: c8983e7c-9e9b-46e0-baa1-e7bf3d363da4, Error: None
[Middleware] Path: /api/users/get-by-id, User: c8983e7c-9e9b-46e0-baa1-e7bf3d363da4, Error: None
[UserRepository] Fetching all users with avatar data
Error fetching all users: TypeError: this.supabase.from is not a function
    at SupabaseUserRepository.findAll (src/repositories/implementations/supabase/SupabaseUserRepository.ts:292:7)
    at GET (src/app/api/users/list/route.ts:15:47)
  290 |     console.log('[UserRepository] Fetching all users with avatar data');
  291 |     const { data, error } = await this.supabase
> 292 |       .from(this.TABLE_NAME)
      |       ^
  293 |       .select('*');
  294 |
  295 |     if (error) {
 GET /api/users/list 500 in 232ms
 ⨯ Error: `cookies` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context
    at createSupabaseServerClient (src/lib/supabase/server-client.ts:6:34)
    at <unknown> (src/app/api/users/get-by-id/route.ts:7:50)
    at [project]/src/app/api/users/get-by-id/route.ts [app-route] (ecmascript) (.next/server/chunks/[root-of-the-server]__da58b64d._.js:1557:1)
    at Object.<anonymous> (.next/server/app/api/users/get-by-id/route.js:10:9)
  4 |
  5 | export async function createSupabaseServerClient(role?: 'service_role') {
> 6 |   const cookieStore = await cookies()
    |                                  ^
  7 |   
  8 |   // If service_role is requested, use the service role key instead of the anon key
  9 |   if (role === 'service_role') { {
  page: '/api/users/get-by-id'
}
 GET /api/users/get-by-id?supabase_uid=c8983e7c-9e9b-46e0-baa1-e7bf3d363da4 500 in 363ms
[Middleware] Path: /create-company, User: c8983e7c-9e9b-46e0-baa1-e7bf3d363da4, Error: None
[Middleware] Path: /api/users/get-by-id, User: c8983e7c-9e9b-46e0-baa1-e7bf3d363da4, Error: None
 GET /create-company 200 in 138ms
 ⨯ Error: `cookies` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context
    at createSupabaseServerClient (src/lib/supabase/server-client.ts:6:34)
    at <unknown> (src/app/api/users/get-by-id/route.ts:7:50)
    at [project]/src/app/api/users/get-by-id/route.ts [app-route] (ecmascript) (.next/server/chunks/[root-of-the-server]__da58b64d._.js:1557:1)
    at Object.<anonymous> (.next/server/app/api/users/get-by-id/route.js:10:9)
  4 |
  5 | export async function createSupabaseServerClient(role?: 'service_role') {
> 6 |   const cookieStore = await cookies()
    |                                  ^
  7 |   
  8 |   // If service_role is requested, use the service role key instead of the anon key
  9 |   if (role === 'service_role') { {
  page: '/api/users/get-by-id'
}
 GET /api/users/get-by-id?supabase_uid=c8983e7c-9e9b-46e0-baa1-e7bf3d363da4 500 in 281ms
[Middleware] Path: /api/auth/callback, User: c8983e7c-9e9b-46e0-baa1-e7bf3d363da4, Error: None
 ○ Compiling /api/auth/callback ...
 ✓ Compiled /api/auth/callback in 898ms
[Callback] Code exchange successful for user: c8983e7c-9e9b-46e0-baa1-e7bf3d363da4
[Callback] Processing Google OAuth user avatar for user: c8983e7c-9e9b-46e0-baa1-e7bf3d363da4
[GoogleAvatarService] Starting extract and store Google avatar operation {
  supabaseUid: 'c8983e7c-9e9b-46e0-baa1-e7bf3d363da4',
  hasOAuthData: true
}
[GoogleAvatarService] Starting Google OAuth avatar extraction { hasOAuthData: true, userId: 'unknown' }
[Avatar] Extracted Google avatar from picture {
  url: 'https://lh3.googleusercontent.com/a/ACg8ocLxvxWtCy6XLamwQ50zTr87Y3t5ND6SDMZf3XCExLBrVEEUmcS_vg=s96-c',
  userId: undefined
}
[GoogleAvatarService] Successfully extracted Google avatar URL {
  userId: undefined,
  source: 'picture',
  avatarUrl: 'https://lh3.googleusercontent.com/a/ACg8ocLxvxWtCy6XLamwQ50zTr87Y3t5ND6SDMZf3XCExLBrVEEUmcS_vg=s96-c'
}
[GoogleAvatarService] Starting Google avatar URL storage {
  supabaseUid: 'c8983e7c-9e9b-46e0-baa1-e7bf3d363da4',
  hasAvatarUrl: true,
  avatarUrl: 'https://lh3.googleusercontent.com/a/ACg8ocLxvxWtCy6XLamwQ50zTr87Y3t5ND6SDMZf3XCExLBrVEEUmcS_vg=s96-c'
}
[GoogleAvatarService] ERROR: Error storing Google avatar URL {
  supabaseUid: 'c8983e7c-9e9b-46e0-baa1-e7bf3d363da4',
  error: "Cannot read properties of undefined (reading 'from')",
  stack: "TypeError: Cannot read properties of undefined (reading 'from')\n" +
    '    at SupabaseUserRepository.findBySupabaseUid (/home/giuice/apps/virtual-office/.next/server/chunks/[root-of-the-server]__da58b64d._.js:105:53)\n' +
    '    at GoogleAvatarService.storeGoogleAvatarUrl (/home/giuice/apps/virtual-office/.next/server/chunks/[root-of-the-server]__11b6a6db._.js:2442:52)\n' +
    '    at GoogleAvatarService.extractAndStoreGoogleAvatar (/home/giuice/apps/virtual-office/.next/server/chunks/[root-of-the-server]__11b6a6db._.js:2523:42)\n' +
    '    at GET (/home/giuice/apps/virtual-office/.next/server/chunks/[root-of-the-server]__11b6a6db._.js:2878:231)\n' +
    '    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)\n' +
    '    at async AppRouteRouteModule.do (/home/giuice/apps/virtual-office/node_modules/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js:26:34112)\n' +
    '    at async AppRouteRouteModule.handle (/home/giuice/apps/virtual-office/node_modules/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js:26:41338)\n' +
    '    at async doRender (/home/giuice/apps/virtual-office/node_modules/next/dist/server/base-server.js:1513:42)\n' +
    '    at async DevServer.renderToResponseWithComponentsImpl (/home/giuice/apps/virtual-office/node_modules/next/dist/server/base-server.js:1915:28)\n' +
    '    at async DevServer.renderPageComponent (/home/giuice/apps/virtual-office/node_modules/next/dist/server/base-server.js:2403:24)\n' +
    '    at async DevServer.renderToResponseImpl (/home/giuice/apps/virtual-office/node_modules/next/dist/server/base-server.js:2440:32)\n' +
    '    at async DevServer.pipeImpl (/home/giuice/apps/virtual-office/node_modules/next/dist/server/base-server.js:1007:25)\n' +
    '    at async NextNodeServer.handleCatchallRenderRequest (/home/giuice/apps/virtual-office/node_modules/next/dist/server/next-server.js:305:17)\n' +
    '    at async DevServer.handleRequestImpl (/home/giuice/apps/virtual-office/node_modules/next/dist/server/base-server.js:899:17)\n' +
    '    at async /home/giuice/apps/virtual-office/node_modules/next/dist/server/dev/next-dev-server.js:371:20\n' +
    '    at async Span.traceAsyncFn (/home/giuice/apps/virtual-office/node_modules/next/dist/trace/trace.js:157:20)\n' +
    '    at async DevServer.handleRequest (/home/giuice/apps/virtual-office/node_modules/next/dist/server/dev/next-dev-server.js:368:24)\n' +
    '    at async invokeRender (/home/giuice/apps/virtual-office/node_modules/next/dist/server/lib/router-server.js:237:21)\n' +
    '    at async handleRequest (/home/giuice/apps/virtual-office/node_modules/next/dist/server/lib/router-server.js:428:24)\n' +
    '    at async requestHandlerImpl (/home/giuice/apps/virtual-office/node_modules/next/dist/server/lib/router-server.js:452:13)\n' +
    '    at async Server.requestListener (/home/giuice/apps/virtual-office/node_modules/next/dist/server/lib/start-server.js:158:13)'
}
[GoogleAvatarService] ERROR: Avatar storage failed after successful extraction {
  supabaseUid: 'c8983e7c-9e9b-46e0-baa1-e7bf3d363da4',
  extractedUrl: 'https://lh3.googleusercontent.com/a/ACg8ocLxvxWtCy6XLamwQ50zTr87Y3t5ND6SDMZf3XCExLBrVEEUmcS_vg=s96-c',
  error: "Failed to store Google avatar URL: Cannot read properties of undefined (reading 'from')"
}
[Callback] Failed to store Google avatar for user: c8983e7c-9e9b-46e0-baa1-e7bf3d363da4 Failed to store Google avatar URL: Cannot read properties of undefined (reading 'from')
[Callback] Error fetching user profile: relation "public.user_profiles" does not exist
[Callback] User does not have a company. Redirecting to create-company.
[Callback] Redirecting to: http://localhost:3001/create-company
 GET /api/auth/callback?code=3da40f6d-7007-441f-b4da-0cd9c962a5e4 307 in 1214ms
[Middleware] Path: /create-company, User: c8983e7c-9e9b-46e0-baa1-e7bf3d363da4, Error: None
[useUserPresence] Initialize with userId: undefined
[PresenceContext] Current user ID: not set
[PresenceContext] Current user space ID: not in space
 GET /create-company 200 in 136ms
[Middleware] Path: /api/users/list, User: c8983e7c-9e9b-46e0-baa1-e7bf3d363da4, Error: None
[UserRepository] Fetching all users with avatar data
Error fetching all users: TypeError: this.supabase.from is not a function
    at SupabaseUserRepository.findAll (src/repositories/implementations/supabase/SupabaseUserRepository.ts:292:7)
    at GET (src/app/api/users/list/route.ts:15:47)
  290 |     console.log('[UserRepository] Fetching all users with avatar data');
  291 |     const { data, error } = await this.supabase
> 292 |       .from(this.TABLE_NAME)
      |       ^
  293 |       .select('*');
  294 |
  295 |     if (error) {