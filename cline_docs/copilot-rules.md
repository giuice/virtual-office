# General Code Style & Formatting
- Follow the Airbnb Style Guide for code formatting.
- Use PascalCase for React component file names (e.g., UserCard.tsx, not user-card.tsx).
- Prefer named exports for components.
- Try Coding in a "elegant" and "simple" way.

# Project Structure & Architecture
- Do use Single Responsibility Principle, Dependency Inversion Principle, and Open/Closed Principle Patterns.
- When coding with data access, use repository pattern.
- Follow Next.js patterns and use the App Router.
- Correctly determine when to use server vs. client components in Next.js.
- Do use typescript on javascript projects.
    - In typescript avoid to use `any` type.
- Break large files into smaller, focused files (e.g., UserCard.tsx, UserCard.test.tsx, UserCard.stories.tsx).
    - Componentization: Use components to break down complex UIs.
- Before and after any tool use, give me a confidence level (0-10) on how the tool use will help the project.

# Styling & UI
- Use Tailwind CSS for styling.
- Use Shadcn UI for components.

# Data Fetching & Forms
- Use TanStack Query (react-query) for frontend data fetching.
- Use React Hook Form for form handling.
- Use Zod for validation.

# State Management & Logic
- Use React Context for state management.

# Backend & Database
Use Prisma for database access.

# Critical Thinking
- When in doubt, ask for clarification.
- Ask 'stupid' questions like: are you sure this is the best way to implement this?

# Setting Expectations
- THE HUMAN WILL GET ANGRY.