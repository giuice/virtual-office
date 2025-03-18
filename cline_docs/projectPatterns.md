# Project Patterns Details

## Project-Specific Patterns:

- **Virtual Office Application**: A collaborative workspace application that enables remote teams to interact in a virtual environment, simulating physical office spaces.
- **Component-Based Architecture**: The application is built using a component-based architecture with React and Next.js, allowing for modular development and easy maintenance.
- **Real-Time Collaboration**: Features like floor plans, messaging, and shared tools enable real-time collaboration between team members.

## Code Patterns:

### SOLID Principles

- **Single Responsibility Principle (SRP)**: Each component should have only one reason to change.
  - Example: The `RoomDialog` component is responsible only for displaying and managing room details.
  - Example: The `RoomManagement` component handles only room management operations.
  - Example: The `RoomTemplateSelector` component is focused solely on template selection.

- **Open/Closed Principle (OCP)**: Software entities should be open for extension but closed for modification.
  - Example: The `FloorPlanCanvas` component can be extended with new features without modifying its core functionality.
  - Example: Room types can be extended by adding new types to the `SpaceType` enum without changing existing code.

- **Liskov Substitution Principle (LSP)**: Objects of a superclass should be replaceable with objects of a subclass without affecting the correctness of the program.
  - Example: Different room types (workspace, conference, social) all implement the same `Space` interface.

- **Interface Segregation Principle (ISP)**: Clients should not be forced to depend on interfaces they do not use.
  - Example: Component props are specific to each component's needs rather than using generic props.
  - Example: The `RoomDialog` component has different props for creation vs. editing modes.

- **Dependency Inversion Principle (DIP)**: High-level modules should not depend on low-level modules. Both should depend on abstractions.
  - Example: Components depend on interfaces (like `Space`, `User`) rather than concrete implementations.
  - Example: State management is handled through hooks, allowing for different implementations.

### DRY (Don't Repeat Yourself) Principles

- **Component Extraction**: Common UI patterns should be extracted into reusable components.
  - Example: The `StatusAvatar` component is reused across the application.
  - Example: UI components like `Button`, `Card`, and `Dialog` are reused throughout the application.

- **Utility Functions**: Common functionality should be extracted into utility functions.
  - Example: Helper functions like `getRoomTypeLabel` and `getBadgeVariant` are used across components.

- **Type Definitions**: Types should be defined once and reused across the application.
  - Example: The `Space`, `User`, and `RoomTemplate` types are defined in a central location.

- **Styling Patterns**: Use consistent styling patterns across the application.
  - Example: Tailwind CSS utility classes are used consistently for styling.
  - Example: Component-specific styles are encapsulated within their respective components.

### Component Size and Responsibility

- **Component Size**: Components should be kept small and focused on a single responsibility.
  - Large components should be broken down into smaller, more manageable pieces.
  - Each component file should ideally be under 300 lines of code.

- **Component Hierarchy**: Components should be organized in a clear hierarchy.
  - Container components handle state and logic.
  - Presentation components focus on rendering UI.
  - Higher-order components and hooks handle cross-cutting concerns.

## Tool Usage Patterns:

- **Memory Bank Files:**
    - `projectbrief.md`: Defines project scope and core requirements (source of truth).
    - `productContext.md`: Explains project purpose, problems solved, and user experience goals.
    - `activeContext.md`: Tracks current work focus, recent changes, and next steps.
    - `systemPatterns.md`: Documents system architecture, design patterns, and component relationships.
    - `techContext.md`:  Specifies technologies, development setup, and technical constraints.
    - `progress.md`:  Tracks what works, what's left to build, and current project status.
    - `userProfile.md`: Contains a dynamic user profile to personalize assistance.
    - `changelog.md`: Contains a log of changes to the project.
    
- **Code Files:**
    - **Components**: UI components are organized by feature and responsibility.
      - `src/components/ui/`: Reusable UI components like buttons, cards, and dialogs.
      - `src/components/floor-plan/`: Components related to the floor plan feature.
      - `src/components/dashboard/`: Components related to the dashboard feature.
    - **Types**: Type definitions are centralized in feature-specific type files.
      - `src/components/floor-plan/types.ts`: Types related to the floor plan feature.
    - **Hooks**: Custom hooks for reusable logic.
      - `src/hooks/`: Custom hooks for state management and other reusable logic.
    - **Contexts**: React contexts for state management.
      - `src/contexts/`: Context providers for application-wide state.
    - **Utilities**: Utility functions for common operations.
      - `src/lib/`: Utility functions and helpers.

- **Tools:**
    - **Next.js**: React framework for server-rendered applications.
    - **TypeScript**: Typed superset of JavaScript for improved developer experience.
    - **Tailwind CSS**: Utility-first CSS framework for styling.
    - **shadcn/ui**: Component library built on Radix UI and Tailwind CSS.
    - **Lucide Icons**: Icon library for consistent iconography.
