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

We've implemented a comprehensive solution to address both existing duplicate companies and prevent future duplication:

1. **Prevention Mechanisms:**
   - Update route protection logic to check `currentUserProfile?.companyId` instead of just `company`
   - Add validation in create-company page to prevent access if user already has a company
   - Implement checks for existing companies before creating new ones in CompanyContext
   - Fix user profile updates to correctly associate with a single companyId

2. **Cleanup Solution:**
   - Create a server-side API endpoint for removing duplicate companies
   - Implement cleanup functionality to identify and retain only the most recent company
   - Build an admin tool with web interface for manual database cleanup

3. **Database Integrity:**
   - Add cleanup call during user login to automatically fix existing issues
   - Implement more robust error handling in company-related operations

## Consequences

### Positive

- Prevents creation of duplicate companies
- Provides tools to fix existing database inconsistencies
- Improves user experience by eliminating redirect loops
- Enhances database integrity for company-user relationships
- Reduces potential for data corruption and inconsistencies

### Negative

- Complexity added to route protection and company creation logic
- Need for ongoing monitoring of company creation patterns
- Manual cleanup process required for existing duplicate companies

### Mitigations

- Added detailed logging for company operations to track any remaining issues
- Created admin cleanup tool with clear interface for manual database management
- Implemented both automatic and manual cleanup mechanisms 

## Compliance

This ADR complies with database integrity best practices by:
- Enforcing one-to-many relationship between companies and users
- Validating data before creation operations
- Providing cleanup mechanisms for data inconsistencies
- Implementing detailed logging for auditing purposes

## References

- Changelog entry: 2025-03-08 Fixed Duplicate Company Creation Issue
- PR #XX: Fix company duplication issues
- Issue #XX: Users creating multiple companies