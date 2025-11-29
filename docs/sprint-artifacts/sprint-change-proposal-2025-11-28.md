# Sprint Change Proposal: Epic 2 Hotfix

**Date:** 2025-11-28  
**Proposed By:** SM (Bob)  
**Change Type:** Hotfix - Critical Blocker  
**Approved By:** _Pending PO Approval_

---

## Executive Summary

O sistema de convites e cadastro está **quebrado**, impedindo qualquer novo usuário de acessar a plataforma. Este hotfix é **P0 - bloqueador crítico** para demonstrações a investidores.

**Modelo de Negócio Definido:** Freemium com limite de 10 usuários por empresa

---

## Current State Analysis

### What Works ✅
- User signup (email/password or Google OAuth)
- Company creation for new users (without invite)
- Login/logout
- Supabase Auth trigger `handle_new_user()` creates user record

### What's Broken ❌
| Component | Problem | Impact |
|-----------|---------|--------|
| `/join` page | Uses `generateTestUuid()` fake UUID | Invited users never created properly |
| Signup UX | No email confirmation feedback | Users don't know to check email |
| Invite dialog | No link copy feature | Admins can't share invitations |
| Email sending | Not implemented | Invitations can't be delivered |

### Root Cause
Epic 2 was marked as "complete" but core flows were never finished. The invitation system bypasses Supabase Auth entirely, breaking the user creation trigger.

---

## Proposed Changes

### Hotfix Stories (Priority Order)

| Story | Title | Estimate | Dependencies |
|-------|-------|----------|--------------|
| **2.X** | Registration UX Feedback | 2-3h | None |
| **2.Y** | Invitation Accept Flow | 4-6h | 2.X |
| **2.Z** | Link Copy & 10-User Limit | 3-4h | 2.Y |

**Total Estimate:** 9-13 hours

### Files Impacted

```
Modified:
├── src/app/(auth)/signup/page.tsx      # 2.X - Add confirmation message
├── src/app/(auth)/login/page.tsx       # 2.X - Detect unconfirmed email
├── src/app/join/page.tsx               # 2.Y - Remove fake UUID, use real auth
├── src/app/api/invitations/accept/route.ts  # 2.Y - Server client fix
├── src/components/dashboard/invite-user-dialog.tsx  # 2.Z - Show link

New:
├── src/app/api/invitations/validate/route.ts  # 2.Y - Token validation
├── src/app/api/invitations/list/route.ts      # 2.Z - List pending invites
├── src/app/onboarding/page.tsx                # 2.X - Post-confirmation landing

Deleted:
├── src/pages/accept-invite.tsx         # 2.Y - Pages Router → App Router
```

---

## Business Model: Freemium

### Tier Structure
| Tier | User Limit | Features | Price |
|------|------------|----------|-------|
| **Free** | 10 users | All core features | $0 |
| **Pro** | Unlimited | All features + priority support | TBD |
| **Enterprise** | Unlimited | All features + custom branding + SLA | TBD |

### Implementation in Hotfix
- Story 2.Z implements 10-user limit check
- Counts `users` + pending `invitations` per company
- Shows upgrade prompt when limit reached
- Billing integration deferred to future epic

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Auth flow breaks existing users | Low | High | Test with existing accounts first |
| Trigger `handle_new_user` conflict | Medium | Medium | Verify trigger behavior in staging |
| Time estimate exceeded | Medium | Medium | Prioritize 2.X + 2.Y, defer 2.Z if needed |

---

## Sprint Impact

### Before Hotfix
- Epic 3: Stories 3.1-3.12 complete ✅
- Epic 2: Incorrectly marked complete ❌
- No working onboarding for new users

### After Hotfix
- Epic 2: Properly functional with Freemium model
- New users can: signup → confirm email → create company OR accept invite
- Admins can: create invitations → copy link → share manually
- 10-user limit enforced per company

### Timeline
- **Today (Nov 28):** Start Story 2.X
- **Tomorrow (Nov 29):** Complete 2.X, start 2.Y
- **Nov 30:** Complete 2.Y + 2.Z
- **Dec 1:** Full regression testing

---

## Success Criteria

After hotfix completion:

- [ ] New user signup shows email confirmation message
- [ ] Resend confirmation email works
- [ ] User with invitation link can register and join company
- [ ] No fake UUIDs anywhere in codebase
- [ ] Admin can copy invitation link from dialog
- [ ] 10-user limit enforced with clear messaging
- [ ] All existing tests pass
- [ ] Manual E2E test: signup → confirm → create company → invite → accept → dashboard

---

## Approval

| Role | Name | Decision | Date |
|------|------|----------|------|
| Scrum Master | Bob | Proposed | 2025-11-28 |
| Product Owner | ___ | _Pending_ | ___ |
| Tech Lead | ___ | _Pending_ | ___ |

---

## Related Documents

- [hotfix-epic2-invitation-flow.md](./hotfix-epic2-invitation-flow.md) - Detailed stories
- [story-platform-admin.md](./story-platform-admin.md) - Platform Admin (Phase 2)
- [sprint-status.yaml](./sprint-status.yaml) - Updated sprint tracking
- [database-structure.md](../../migrations/database-structure.md) - Current DB schema
