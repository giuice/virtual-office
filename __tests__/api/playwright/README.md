# Playwright Messaging Drawer Suite

This guide explains how to configure, run, and maintain the Epic 4A drawer interaction tests. Follow it any time you need to validate messaging features locally or in CI.

## 1. Environment Prerequisites

1. Install dependencies:
   - Node.js 20+
   - npm 10+
   - Playwright browsers (`npx playwright install`)
2. Ensure Supabase credentials are configured. Copy `env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_TEST_DB_URL` (if using isolated database)
   - `PLAYWRIGHT_TEST_SECRET` (random string shared with the seeding route)
   - `PLAYWRIGHT_STORAGE_STATE` (output path for auth session JSON, e.g. `.playwright/auth/messaging.json`)
3. Start Supabase locally or point to a staging environment with clean data.

> **Tip:** The service role key is required because the seeding endpoint provisions users via admin APIs. Missing keys will surface as `createSupabaseServerClient('service_role')` errors in the Next.js logs.

## 2. Test Data Seeding Contract

Automated tests rely on `/api/test/messaging/seed` to provision companies, users, conversations, and sample messages. Requests must include `x-test-secret: PLAYWRIGHT_TEST_SECRET`.

### Seed Example

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-test-secret: $PLAYWRIGHT_TEST_SECRET" \
  http://localhost:3000/api/test/messaging/seed \
  -d '{
    "runId": "local-debug",
    "users": [
      {"email": "qa-alex@example.com", "password": "Test1234!", "displayName": "QA Alex", "role": "admin"},
      {"email": "qa-sam@example.com", "password": "Test1234!", "displayName": "QA Sam", "role": "member"}
    ],
    "includePinnedRoom": true,
    "roomCount": 3
  }'
```

### Cleanup Example

```bash
curl -X DELETE \
  -H "Content-Type: application/json" \
  -H "x-test-secret: $PLAYWRIGHT_TEST_SECRET" \
  http://localhost:3000/api/test/messaging/seed \
  -d '{"runId": "local-debug"}'
```

The helper `MessagingTestSeeder` (in `src/lib/test-utils/messaging-test-seeder.ts`) is responsible for creating and cleaning up:

- Company + spaces
- Two authenticated user profiles with deterministic passwords
- One pinned direct conversation plus optional pinned room
- Seeded messages (including reply relationships)

The Playwright fixtures call this route automatically before each test and tear it down afterwards.

## 3. Authentication (Storage State)

All UI tests reuse a persisted Supabase session stored at `PLAYWRIGHT_STORAGE_STATE`.

1. Run `npm run test:api:auth` (or execute `tests/utils/bootstrap-auth.ts` if provided) to generate the storage file.
2. Commit the storage file **only** if it contains non-sensitive data. Otherwise, re-create it locally as part of onboarding.
3. If a test suddenly redirects to the login page, re-run the bootstrap command to refresh tokens.

## 4. Running the Suite

| Command | Purpose |
| ------- | ------- |
| `npm run dev` | Starts Next.js + Supabase-backed API (required) |
| `npm run test:api` | Single-run messaging drawer suite |
| `npm run test:api:ci` | CI run with `repeat-each=3`, HTML report export |
| `npx playwright test --grep @drawer --headed` | Focused debugging run |

All commands expect the Next.js app to be running on `http://localhost:3000`. Use `PLAYWRIGHT_BASE_URL` to override if needed.

### Coverage Reports (Task 8.4)

Run Vitest with coverage to generate HTML/JSON summaries for the messaging client and supporting utilities:

```bash
npm run test:coverage
```

Outputs land in the `coverage/` directory (`coverage/html/index.html` for the interactive report, `coverage/coverage-final.json` for tooling). Delete the folder before re-running if you want a clean snapshot. These coverage artifacts are required evidence for Story 4A.1.

### Performance Contract (AC6)

- Full suite must finish under **5 minutes** on CI hardware (GitHub hosted runners).
- Individual specs should target **< 30 seconds** run time.
- The CI workflow fails fast if repeat runs breach the 5 minute budget; adjust test data or waits if that happens.

## 5. Troubleshooting

| Symptom | Likely Cause | Fix |
| ------- | ------------ | ---- |
| `Failed to fetch /api/conversations/get` | Missing Supabase env vars or no authenticated session | Confirm `.env.local` values and that storage state JSON exists |
| Seeding route returns 401 | `PLAYWRIGHT_TEST_SECRET` header mismatch | Verify header value matches server env |
| Drawer never marks realtime ready | `MessagingContext` data attribute missing due to DOM caching | Hard refresh the app, ensure Turbopack dev server restarted |
| Tests hang on archive/pin flows | API preference update lacks Supabase service role key | Double-check `SUPABASE_SERVICE_ROLE_KEY` |
| Playwright `Error: net::ERR_CONNECTION_REFUSED` | Next.js dev server offline | Run `npm run dev` in another terminal |

## 6. Maintenance Checklist

- Keep UI selectors stable by using `data-testid` attributes. When messaging components change, update helpers in `__tests__/api/playwright/helpers/drawer-helpers.ts`.
- Refresh the storage state whenever Supabase auth configuration changes.
- Review `MessagingTestSeeder` after schema migrations (new columns, default values, foreign keys) to ensure seeding remains valid.
- Update this README with new environment variables or setup steps whenever the suite expands to new scenarios (e.g., attachments, voice notes).

## 7. Additional Resources

- [Playwright Docs](https://playwright.dev/docs/test-intro)
- `docs/tech-spec-epic-4A.md` – Acceptance criteria and manual test plans
- `MessagingContext` + helper hooks under `src/contexts/messaging/` for realtime/polling behaviour

Keeping this guide current prevents drift between developer machines, CI, and the expectations laid out in Story 4A.1.