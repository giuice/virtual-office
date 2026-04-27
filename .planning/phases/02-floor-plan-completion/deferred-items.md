# Deferred Items

## 2026-03-19

- `npm run lint` is currently unusable in this repository. The script resolves to `next lint`, and both `npm run lint` and path-targeted variants fail immediately with `Invalid project directory provided, no such directory: /home/giuice/apps/virtual-office/lint`.
- Direct `npx eslint src/app/api/users/location/route.ts` is also blocked by the repo ESLint configuration, which throws `TypeError: Converting circular structure to JSON` before linting the file.
