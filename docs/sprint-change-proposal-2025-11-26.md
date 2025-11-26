# Sprint Change Proposal: Dashboard Landing Page Polish

**Date:** 2025-11-26  
**Author:** PM Agent (John)  
**Requester:** Giuliano  
**Status:** ✅ IMPLEMENTED  
**Scope Classification:** Minor (Direct Implementation)

---

## 1. Issue Summary

### Problem Statement
The dashboard landing page (`/dashboard`) contained broken links and visual inconsistencies that undermined the professional appearance needed for investor demos:

1. **Broken Links (404 errors):**
   - `/messages` - Route doesn't exist (messaging via floor-plan drawer)
   - `/calendar` - Route doesn't exist (planned for Epic 8.10)
   - `/admin` - Incorrect path (should be `/admin/invitations`)

2. **Duplicate Headers:**
   - `/company` and `/settings` pages displayed two headers due to both `DashboardShell` and `DashboardHeader` being used

3. **Missing Roadmap Visibility:**
   - Landing page didn't communicate upcoming features to investors
   - No connection to existing investor assets (presentation, landing page)

### Discovery Context
Issue identified during investor demo preparation after completing Epic 3 (Stories 3.1-3.9). The landing page is the first impression for users and investors.

### Business Impact
- **Investor Demo Risk:** Broken links signal "unfinished product"
- **User Frustration:** Clicking non-functional features creates poor UX
- **Missed Opportunity:** Not showcasing roadmap to investors

---

## 2. Impact Analysis

### Epic Impact
| Epic | Impact | Notes |
|------|--------|-------|
| Epic 3 (Current) | ✅ Extended | Added polish work as natural extension |
| Epic 4A/4B | None | Messaging link redirected to teaser |
| Epic 5-9 | None | Features shown as "Coming Soon" |

### Artifact Conflicts
| Artifact | Conflict | Resolution |
|----------|----------|------------|
| PRD | None | Implementation gap, not requirements gap |
| Architecture | None | UI-only changes |
| Epics | None | No story modifications needed |
| Sprint Status | Updated | Added story reference |

### Files Modified
1. `src/app/(dashboard)/dashboard/components/QuickLinksGrid.tsx` - Complete rewrite
2. `src/app/(dashboard)/dashboard/page.tsx` - Cleanup
3. `src/app/(dashboard)/company/page.tsx` - Header fix
4. `src/app/(dashboard)/settings/page.tsx` - Header fix
5. `public/docs/investor-presentation-v2.html` - Copied for serving
6. `public/docs/landing.html` - Copied for serving

---

## 3. Recommended Approach

**Selected Path:** Direct Adjustment (Option 1)

### Rationale
- **Low effort:** ~3-4 hours of focused work
- **High impact:** Eliminates 404 errors, showcases roadmap
- **No risk:** UI-only changes, no backend modifications
- **Natural fit:** Aligns with Epic 3's "Visual Experience" theme

### Trade-offs Considered
| Option | Effort | Risk | Rejected Because |
|--------|--------|------|------------------|
| Option 2: Rollback | N/A | N/A | No stories caused this issue |
| Option 3: MVP Review | N/A | N/A | Not a scope issue |

---

## 4. Detailed Change Proposals

### Change 4.1: QuickLinksGrid Redesign

**Before:**
- 5 quick link cards with broken routes
- No roadmap visibility
- No investor resources

**After:**
- **Available Now** section (3 working features + admin features)
- **Coming Soon** section (5 roadmap teasers with epic badges)
- **Investor Resources** section (2 links to static HTML assets)
- Modern gradient styling consistent with cyber aesthetic

**Key Features Added:**
```
┌─────────────────────────────────────────────┐
│  ✨ Available Now                           │
│  • Virtual Office → /floor-plan             │
│  • Team Members → /company                  │
│  • Settings → /settings                     │
│  • Invite Team → /admin/invitations (admin) │
│  • Company Settings → /company?tab=settings │
├─────────────────────────────────────────────┤
│  🕐 Coming Soon (Roadmap)                   │
│  • Real-Time Messaging (Epic 4)             │
│  • Video Conferencing (Epic 8)              │
│  • AI Meeting Notes (Epic 5 & 7)            │
│  • Calendar Integration (Epic 8)            │
│  • Analytics Dashboard (Epic 9)             │
├─────────────────────────────────────────────┤
│  🎤 Investor Resources                      │
│  • Investor Deck → /docs/investor-...html   │
│  • Product Vision → /docs/landing.html      │
└─────────────────────────────────────────────┘
```

### Change 4.2: Double Header Fix

**Before:**
- Pages used both `DashboardShell` AND `DashboardHeader`
- Result: Duplicate title/description display

**After:**
- Pages use `DashboardShell` with `heading`/`description` props
- Single clean header per page

**Files Fixed:**
- `/company` page
- `/settings` page

### Change 4.3: Static Asset Serving

**Action:** Copied investor assets to `/public/docs/` for Next.js serving
- `investor-presentation-v2.html`
- `landing.html`

---

## 5. Implementation Handoff

### Scope Classification: Minor
**Route:** Direct implementation by development team (already completed)

### Responsibilities
| Role | Responsibility | Status |
|------|----------------|--------|
| PM Agent | Analysis, proposal, oversight | ✅ Complete |
| Dev Implementation | Code changes | ✅ Complete |
| User (Giuliano) | Approval, testing | ⏳ Pending |

### Success Criteria
- [ ] No 404 errors from dashboard links
- [ ] Single header on all dashboard pages
- [ ] Coming Soon section visible
- [ ] Investor Resources links functional
- [ ] Static HTML pages load correctly

### Testing Checklist
- [ ] Navigate to `/dashboard` - verify all sections render
- [ ] Click "Virtual Office" → `/floor-plan` loads
- [ ] Click "Team Members" → `/company` loads (single header)
- [ ] Click "Settings" → `/settings` loads (single header)
- [ ] Click "Invite Team" (admin) → `/admin/invitations` loads
- [ ] Click "Investor Deck" → HTML presentation opens
- [ ] Click "Product Vision" → HTML landing opens
- [ ] Verify "Coming Soon" cards are non-clickable/muted

---

## 6. Sprint Status Update

### Recommended Addition to Epic 3

**Story 3.15: Dashboard Landing Page Polish** (Retroactive)

As a user and investor,  
I want the dashboard landing page to showcase working features and roadmap,  
So that I understand what's available now and what's coming.

**Acceptance Criteria:**
1. ✅ All dashboard links point to working routes
2. ✅ Coming Soon section shows roadmap with epic references
3. ✅ Investor Resources section links to presentation assets
4. ✅ No duplicate headers on interior pages
5. ✅ Modern gradient styling consistent with app theme

**Status:** ✅ COMPLETE

---

## 7. Appendix: Code Diff Summary

### QuickLinksGrid.tsx
- **Lines changed:** ~150 → ~200
- **New imports:** Badge, 10 additional icons
- **New sections:** workingFeatures, adminFeatures, comingSoonFeatures, investorResources
- **Breaking changes:** None (component interface unchanged)

### Dashboard page.tsx
- **Lines changed:** ~60 → ~25
- **Removed:** Duplicate Admin Actions card, unused imports
- **Breaking changes:** None

### Company/Settings pages
- **Change:** Removed direct `DashboardHeader` calls
- **Breaking changes:** None

---

**Document Status:** Complete  
**Implementation Status:** ✅ IMPLEMENTED  
**Awaiting:** User confirmation and testing
