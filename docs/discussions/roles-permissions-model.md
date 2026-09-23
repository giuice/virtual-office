# Roles### 1.4 Orthogonal Roles (Capabilities)
*   **Publisher (proposal only):**
    *   **Current implementation:** No Publisher role or scoped Publisher assignment exists.
    *   **Proposed capability:** A future Publisher capability could gate posting to a Company Board / Mural; neither feature is currently implemented.
    *   **Proposed assignment:** If introduced, Publisher could be orthogonal to company roles; the current company-role model contains only `admin` and `member`.

## 2. Permission Matrixodel - Discussion Document

**Date:** 2025-11-26  
**Status:** Pending PM/Product Review  
**Author:** Dev Team  
**Priority:** High - Blocks multiple features

---

## 1. Hierarchy & Roles

### 1.0 Platform Level (Supra-Tenant)
*   **Platform Admin:** The "God" role.
    *   **Scope:** Cross-tenant.
    *   **Current capabilities:** Create Tenants (Companies) with an initial `admin` invitation. Initial Owner creation and billing-plan management are not implemented.
    *   **Access:** Cannot access tenant data (messages, rooms) unless explicitly invited.

### 1.1 Organization Level (Tenant)
*   **Owner (proposed, not implemented):** A candidate highest permission level within a single Organization.
    *   **Proposed scope:** Entire Organization.
    *   **Proposed capabilities:** Manage Billing, Manage Organization Settings, Assign Admins.
    *   **Current implementation:** There is no `owner` role or exactly-one-Organization constraint; `users.company_id` is nullable and company removal sets it to `null`.
*   **Admin (Office Manager):** Operational management.
    *   **Scope:** Entire Organization.
    *   **Current capabilities:** Admin-gated user invites; space/room management exists, although some endpoints authorize same-company membership rather than the `admin` role. Integration management is not implemented.
    *   **Constraint:** Cannot remove Owner or change Billing.

### Current State
```
user_role ENUM: 'admin' | 'member'
```

### Identified Gaps
- No `owner` role for company creator/purchaser
- No billing/subscription management permissions
- Unclear permission hierarchy
- Space-level permissions vs company-level permissions undefined

---

## 2. Scenarios Requiring Clarification

### 2.1 Company Onboarding (Purchase Flow)

| Question | Options | Current | Recommended |
|----------|---------|---------|-------------|
| Who creates the company after purchase? | System auto-creates | N/A | System creates, purchaser becomes owner |
| What role does the purchaser get? | owner, admin, member | admin | **owner** |
| Can ownership be transferred? | Yes/No | N/A | Yes, to another admin |
| Can there be multiple owners? | Yes/No | N/A | No, single owner |

### 2.2 User Management

| Action | Who can do it? | Current | Needs Decision |
|--------|----------------|---------|----------------|
| Invite members | admin | ✅ | Keep |
| Invite admins | admin | ✅ | Only owner? |
| Remove members | admin | ✅ | Keep |
| Remove admins | admin | ⚠️ | Only owner? |
| Promote member → admin | admin | ⚠️ | Only owner? |
| Demote admin → member | admin | ✅ (another admin; self-demotion is blocked) | Owner-only if an `owner` role is introduced? |
| Transfer ownership | ??? | ❌ | Only current owner |

### 2.3 Billing & Subscription

| Action | Who can do it? | Current | Needs Decision |
|--------|----------------|---------|----------------|
| View billing info | ??? | ❌ | owner only? owner + admins? |
| Update payment method | ??? | ❌ | owner only? |
| Change subscription plan | ??? | ❌ | owner only? |
| Cancel subscription | ??? | ❌ | owner only |
| View invoices | ??? | ❌ | owner + admins? |

### 2.4 Company Settings

| Action | Who can do it? | Current | Needs Decision |
|--------|----------------|---------|----------------|
| Update company name | admin | ⚠️ | owner only? |
| Update company settings | admin | ✅ | Keep |
| Delete company | ??? | ❌ | owner only |
| Export company data | ??? | ❌ | owner only? |

### 2.5 Space Management

| Action | Who can do it? | Current | Needs Decision |
|--------|----------------|---------|----------------|
| Create spaces | admin | ✅ | Keep |
| Delete spaces | any authenticated same-company member | ✅ (route has no role check) | Should deletion be admin-only? |
| Edit space settings | admin | ✅ | Keep |
| Create agenda for space | admin | ✅ (RLS) | admin? space creator? any participant? |
| Update agenda phase | admin | ✅ (RLS) | Same as create? Or any participant? |
| Delete agenda | admin | ✅ (RLS) | Same as create? |

### 2.6 Space-Level Roles (space_members table)

Current enum: `member_role_type: 'member' | 'admin' | 'director'`

| Question | Needs Decision |
|----------|----------------|
| What does `director` mean? | Meeting host? Space owner? |
| Can space-level roles override company roles? | e.g., member is director of a space |
| Who assigns space roles? | Company admin? Space creator? |

---

## 3. Proposed Role Hierarchy

### Option A: Simple (Recommended for MVP)
```
owner (1 per company)
  ├── Full control over company
  ├── Billing & subscription
  ├── Can promote/demote admins
  └── Can transfer ownership

admin (N per company)
  ├── User management (invite/remove members)
  ├── Space management
  ├── Agenda management
  └── Cannot manage other admins

member (N per company)
  ├── Use spaces
  ├── Participate in meetings
  └── View content
```

### Option B: Extended (Future)
```
owner
  └── billing_admin (optional, separate billing access)
        └── admin
              └── member
                    └── guest (temporary/limited access)
```

---

## 4. Space-Level Permissions

### Proposal
Space-level roles (`space_members.role`) should complement, not override, company roles.

| space_members.role | Permissions |
|--------------------|-------------|
| `member` | Participate, view content |
| `admin` | Manage space settings, kick users |
| `director` | Host meetings, control agenda |

### Questions
1. Can a company `member` be a space `director`?
2. Does space `admin` require company `admin`?

---

## 5. Implementation Impact

### Features Blocked by This Decision

| Feature | Blocking Issue |
|---------|----------------|
| Agenda CRUD | Implemented: company admins have `FOR ALL` RLS access; broader space-role access remains a product decision. |
| Admin invitation | Implemented: an admin can invite both `admin` and `member` roles. |
| Company settings | Partially implemented: admins can PATCH name/settings; company deletion is not available to authenticated users. |
| Future: Billing | Role for billing access |
| Future: Audit log | What actions to log per role? |

### Database Changes Required

```sql
-- Option A: Add 'owner' to existing enum
ALTER TYPE user_role ADD VALUE 'owner' BEFORE 'admin';

-- Migration: Set first admin of each company as owner
UPDATE users SET role = 'owner' 
WHERE id IN (
  SELECT DISTINCT ON (company_id) id 
  FROM users 
  WHERE role = 'admin' 
  ORDER BY company_id, created_at ASC
);
```

### RLS Policy Updates
All policies checking `role = 'admin'` need review:
- Some should be `role IN ('owner', 'admin')`
- Some should be `role = 'owner'` only

---

## 6. Questions for Product/PM

### Must Answer Before Implementation

1. **Do we need an `owner` role?**
   - [ ] Yes, single owner per company
   - [ ] No, all admins are equal

2. **Who can manage admins?**
   - [ ] Any admin
   - [ ] Only owner
   - [ ] Only the person who invited them

3. **Who controls billing?**
   - [ ] Owner only
   - [ ] Owner + admins
   - [ ] Separate billing_admin role

4. **Agenda permissions follow:**
   - [ ] Company role (admin only)
   - [ ] Space role (director/admin of space)
   - [ ] Any participant in the space

5. **Can ownership be transferred?**
   - [ ] Yes
   - [ ] No (owner is permanent)

6. **What happens if owner leaves/is deleted?**
   - [ ] Promote oldest admin
   - [ ] Company is orphaned (need support)
   - [ ] Block deletion until transfer

### Nice to Have (Can Decide Later)

7. Should we have a `guest` role for external participants?
8. Should space roles be independent of company roles?
9. Do we need role-based feature flags (e.g., premium features)?

---

## 7. Recommended Next Steps

1. **PM Review**: Schedule meeting to discuss questions in Section 6
2. **Document Decisions**: Update this document with decisions
3. **Technical Design**: Create migration plan based on decisions
4. **Implementation**: Update DB, RLS, and application code
5. **Testing**: Verify all permission scenarios

---

## 8. Appendix: Current Database Schema

### users.role
```sql
CREATE TYPE user_role AS ENUM ('admin', 'member');
```

### space_members.role
```sql
CREATE TYPE member_role_type AS ENUM ('member', 'admin', 'director');
```

### Current RLS Example (space_agendas)
```sql
-- View: any user in company
CREATE POLICY "Users can view agendas in their company" ON space_agendas
FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE supabase_uid = auth.uid()::text AND company_id = space_agendas.company_id)
);

-- Manage: only admins
CREATE POLICY "Admins can manage agendas" ON space_agendas
FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE supabase_uid = auth.uid()::text AND role = 'admin' AND company_id = space_agendas.company_id)
);
```

---

**Document Version:** 1.0  
**Last Updated:** 2025-11-26
