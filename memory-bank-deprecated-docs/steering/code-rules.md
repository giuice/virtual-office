<!------------------------------------------------------------------------------------
   Add Rules to this file or a short description and have Kiro refine them for you:   
-------------------------------------------------------------------------------------> 
- Follow TypeScript best practices and strict type safety when developing with Next.js
  - Enable strict mode in tsconfig.json
  - Use proper type annotations for props, state, and function parameters
  - Leverage Next.js TypeScript features like GetServerSideProps, GetStaticProps with proper typing
  - Prefer interfaces over types for object definitions
  - Use generic types where appropriate to maintain type safety

- Maintain code modularity by keeping files under 500 lines
  - Break down large components into smaller, focused components
  - Extract custom hooks when logic becomes complex
  - Separate business logic into utility functions or services
  - Use composition patterns to avoid monolithic components

- Implement componentization strategy for files exceeding 500 lines
  - Split large components into logical sub-components
  - Create reusable UI components in a shared components directory
  - Extract form logic into separate form components
  - Move data fetching logic to custom hooks or API utilities
  - Consider using compound component patterns for complex UI elements

- Always verify if functionality already exists before implementing new features
  - Check existing components, hooks, and utilities before creating duplicates
  - Search the codebase for similar patterns or implementations
  - Review shared component libraries and utility functions
  - Consult team documentation or component catalogs
  - Use existing APIs and services rather than creating new ones
  - Extend or modify existing functionality when appropriate instead of rebuilding
  - Document new functionality to prevent future duplication

-----

## Development Guidelines

### Development Philosophy

  - Write clean, maintainable, and scalable code
  - Follow SOLID principles
  - Prefer functional and declarative programming patterns over imperative
  - Emphasize type safety and static analysis
  - Practice component-driven development

-----

### Naming Conventions

#### General Rules

  - **PascalCase for**: Components, Type definitions, Interfaces
  - **kebab-case for**: Directory names (e.g., `components/auth-wizard`), File names (e.g., `user-profile.tsx`)
  - **camelCase for**: Variables, Functions, Methods, Hooks, Properties, Props
  - **UPPERCASE for**: Environment variables, Constants, Global configurations

#### Specific Naming Patterns

  - Prefix event handlers with `handle`: `handleClick`, `handleSubmit`
  - Prefix boolean variables with verbs: `isLoading`, `hasError`, `canSubmit`
  - Prefix custom hooks with `use`: `useAuth`, `useForm`
  - Use complete words over abbreviations except for:
      - `err` (error)
      - `req` (request)
      - `res` (response)
      - `props` (properties)
      - `ref` (reference)

-----