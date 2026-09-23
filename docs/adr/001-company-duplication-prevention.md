# ADR 001: Company Duplication Prevention and Cleanup

## Status

Accepted (2025-03-08)

## Context

We discovered a critical issue where users were creating multiple companies in the DynamoDB database. This occurred because:

1. The route protection logic in `useProtectedRoute.ts` was checking for the existence of `company` rather than `currentUserProfile?.companyId`
2. The company creation flow in `CompanyContext.tsx` lacked checks for existing companies
3. Users were being redirected to create-company page repeatedly, even if they already had a company

This resulted in:
- Users having multiple companies associated with their profile
- Database inconsistencies and potential data integrity issues
- Confusion in the UI when displaying company information

## Decision

The current implementation prevents the known duplicate-company creation paths. Cleanup of companies that were already duplicated remains planned and is not operational:

1. **Prevention Mechanisms:**
   - Update route protection logic to check `currentUserProfile?.companyId` instead of just `company`
   - Add validation in create-company page to prevent access if user already has a company
   - Implement checks for existing companies before creating new ones in CompanyContext
   - Fix user profile updates to correctly associate with a single companyId

2. **Cleanup Solution:**
   - Planned: create a server-side API endpoint for removing duplicate companies; the current code does not define `/api/companies/cleanup`
   - Planned: implement cleanup functionality to identify and retain only the most recent company; the current code contains client-side descriptions but no server-side cleanup implementation
   - A cleanup page was built at `src/app/tools/cleanup-companies/page.tsx`, but it is not admin-restricted and calls the unimplemented `/api/companies/cleanup` endpoint

3. **Database Integrity:**
   - Planned: add a cleanup call during user login to automatically fix existing issues; the current authentication and company bootstrap flows do not invoke duplicate-company cleanup
   - Implement more robust error handling in company-related operations

## Consequences

### Positive

- Prevents creation of duplicate companies
- Would provide tools to fix existing database inconsistencies once the planned server cleanup endpoint is implemented; the current cleanup page has no working backend
- Improves user experience by eliminating redirect loops
- Enhances database integrity for company-user relationships
- Reduces potential for data corruption and inconsistencies

### Negative

- Complexity added to route protection and company creation logic
- Need for ongoing monitoring of company creation patterns
- Manual cleanup process required for existing duplicate companies

### Mitigations

- Added detailed logging for company operations to track any remaining issues
- Added a cleanup UI prototype; it is not admin-restricted and has no working backend endpoint
- Automatic and manual cleanup mechanisms were planned, but neither is complete in the current implementation

## Compliance

This ADR complies with database integrity best practices by:
- Enforcing one-to-many relationship between companies and users
- Validating data before creation operations
- Planning cleanup mechanisms for data inconsistencies; no server-side duplicate-company cleanup is currently implemented
- Using console logging for company diagnostics; durable audit logging for company operations and cleanup is not implemented

## References

- Historical decision date: 2025-03-08 (recorded by this ADR; no matching changelog entry exists in the repository)
- PR #XX: Fix company duplication issues
- Issue #XX: Users creating multiple companies
