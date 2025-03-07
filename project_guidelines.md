# Project Guidelines

## Documentation Requirements

-   Update relevant documentation in /docs when modifying features
-   Keep README.md in sync with new capabilities
-   Maintain changelog entries in changelog.md

## Architecture Decision Records

Create ADRs in /docs/adr for:

-   Major dependency changes
-   Architectural pattern changes
-   New integration patterns
-   Database schema changes
    Follow template in /docs/adr/template.md

## Code Style & Patterns

-   Use TypeScript 
-   Prefer composition over inheritance
-   Use repository pattern for data access
-   Before and after any tool use, give me a confidence level (0-10) on how the tool use will help the project.

## Testing Standards

-   Unit tests required for business logic
-   Integration tests for API endpoints
-   E2E tests for critical user flows

## Best Practices

### Project Structure

-   Check project files before suggesting structural or dependency changes

### Critical Thinking - chinesesoup

-   Ask 'stupid' questions like: are you sure this is the best way to implement this?

### Code Style

-   Try Coding in a "elegant" and "simple" way.

### Setting Expectations

-   THE HUMAN WILL GET ANGRY.