<!--
Instructions:  Fill in the placeholders below to create the System Manifest.
This document provides a high-level overview of the entire system.
-->

# System: Collaborative Virtual Office Application

## Purpose
Provides a virtual office environment enabling real-time collaboration, communication, and presence awareness for remote teams.

## Architecture
```mermaid
graph TD
    subgraph Frontend [Next.js Frontend]
        direction LR
        UI[Components (React)]
        State[Contexts/Hooks]
        Routing[App Router]
    end

    subgraph Backend
        direction LR
        API[API Routes (/api)]
        Socket[Socket.IO Server (socket-server.js)]
        DB[(Database - Prisma/Postgres)]
    end

    subgraph CRCT [CRCT System]
        direction TB
        Rules[.clinerules]
        Memory[cline_docs]
        Utils[cline_utils]
        Strategy[strategy_tasks]
    end

    User --> Frontend
    Frontend --> API
    Frontend -- Real-time --> Socket
    API --> DB
    Socket --> DB

    style User fill:#f9f,stroke:#333,stroke-width:2px
    style DB fill:#ccf,stroke:#333,stroke-width:2px
```

## Module Registry
- [src/app]: Next.js application structure (routing, pages, API)
- [src/components]: Reusable React UI components
- [src/config]: Application configuration files
- [src/contexts]: React Context API providers for state management
- [src/hooks]: Custom React hooks
- [src/lib]: Utility functions and libraries
- [src/providers]: Higher-level application providers
- [src/types]: TypeScript type definitions

## Development Workflow (CRCT)
1. Set-up/Maintenance: Ensure project structure, dependencies, and documentation are up-to-date.
2. Strategy: Define tasks, create instruction files, and prioritize.
3. Execution: Implement features according to instruction files, step-by-step.
4. Mandatory Update Protocol (MUP): Update core files (`.clinerules`, `activeContext.md`, `changelog.md`, etc.) after each significant action.
5. Dependency Management: Use `dependency_processor.py` to track and manage dependencies.

## Version: 0.1 | Status: Development
