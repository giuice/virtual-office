# Story: Implement Platform Admin Role & Tenant Creation

**As a** Platform Admin (Virtual Office Staff),
**I want to** create new Tenant Organizations and their initial Owners,
**So that** I can onboard new paying customers to the SaaS platform.

## Context
Currently, the system lacks a "God Mode" to spawn new companies. We need a role above "Owner" to manage the multi-tenant architecture.

## Acceptance Criteria

### 1. Platform Admin Role
- [ ] Define `platform_admin` role in the database (or separate permissions table).
- [ ] Ensure `platform_admin` is NOT bound to a specific `tenant_id` (or has a wildcard).

### 2. Tenant Creation Flow (Backoffice)
- [ ] Create a script or simple UI (Retool/Admin Panel) to:
    - Input Company Name.
    - Input Owner Email.
    - Input Plan Type.
- [ ] Action creates the `organization` record.
- [ ] Action creates the `user` record (if not exists) and assigns `role: owner`.
- [ ] Action triggers an invitation email to the Owner.

### 3. Security Constraints
- [ ] Platform Admin CANNOT see inside Tenant rooms/chats by default.
- [ ] Regular Owners CANNOT create other Organizations.

## Technical Notes
- **Database:** Check `user_roles` enum. Might need to add `platform_admin` or handle it via `is_superuser` flag in a separate table.
- **Auth:** Update RLS policies to allow Platform Admin to insert into `organizations` table.
