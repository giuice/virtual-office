# Task: Define Repository Interfaces

**Date:** 3/31/2025

**Objective:** Define TypeScript interfaces for data access operations for each core entity. These interfaces will abstract the data layer, allowing API routes and other services to depend on contracts rather than concrete implementations.

**Depends On:**
*   Analysis of existing data access needs (based on `src/lib/dynamo/` functions and API route usage).
*   Defined TypeScript types in `src/types/database.ts` and `src/types/messaging.ts`.

**Steps:**

1.  **Create Directory Structure:**
    *   Create the directory: `src/repositories/interfaces/`

2.  **Define Interfaces:**
    *   For each core entity (User, Company, Space, Message, Conversation, Invitation, Announcement, MeetingNote), create a corresponding interface file (e.g., `IUserRepository.ts`, `ICompanyRepository.ts`) within `src/repositories/interfaces/`.
    *   **Inside each interface file:**
        *   Import necessary types from `src/types/`.
        *   Define an interface (e.g., `export interface IUserRepository`) with method signatures for all required data operations for that entity.
        *   Method signatures should clearly define input parameters and expected return types (using Promises for async operations).
        *   Focus on the *what* (e.g., `findById`, `create`, `update`, `findByCriteria`) rather than the *how* (specific DB queries).

**Example Interface (`IUserRepository.ts`):**

```typescript
// src/repositories/interfaces/IUserRepository.ts
import { User, UserRole } from '@/types/database';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByFirebaseUid(firebaseUid: string): Promise<User | null>;
  findByCompany(companyId: string): Promise<User[]>;
  create(userData: Omit<User, 'id' | 'createdAt' | 'lastActive'>): Promise<User>;
  update(id: string, updates: Partial<User>): Promise<User | null>;
  deleteById(id: string): Promise<boolean>; // Returns true if successful
  // Add other methods as needed, e.g., search, count, etc.
  updateCompanyAssociation(userId: string, companyId: string | null): Promise<User | null>;
}
```

**Example Interface (`IMessageRepository.ts`):**

```typescript
// src/repositories/interfaces/IMessageRepository.ts
import { Message, FileAttachment, MessageReaction } from '@/types/messaging';
import { PaginationOptions } from '@/types/common'; // Assuming PaginationOptions type exists or needs creation

export interface IMessageRepository {
  findById(id: string): Promise<Message | null>;
  findByConversation(conversationId: string, options?: PaginationOptions): Promise<Message[]>;
  create(messageData: Omit<Message, 'id' | 'timestamp' | 'reactions' | 'attachments' | 'isEdited'>): Promise<Message>;
  update(id: string, updates: Partial<Pick<Message, 'content' | 'status' | 'isEdited'>>): Promise<Message | null>;
  deleteById(id: string): Promise<boolean>;

  // Attachment specific methods
  addAttachment(messageId: string, attachmentData: Omit<FileAttachment, 'id'>): Promise<FileAttachment>;
  // removeAttachment might be needed depending on requirements

  // Reaction specific methods
  addReaction(messageId: string, reactionData: Omit<MessageReaction, 'timestamp'>): Promise<MessageReaction>;
  removeReaction(messageId: string, userId: string, emoji: string): Promise<boolean>;
  findReactions(messageId: string): Promise<MessageReaction[]>;
}
```

3.  **Define Interfaces for All Entities:**
    *   Create similar interfaces for:
        *   `ICompanyRepository`
        *   `ISpaceRepository` (including reservation methods if managed here)
        *   `IConversationRepository`
        *   `IInvitationRepository`
        *   `IAnnouncementRepository`
        *   `IMeetingNoteRepository` (including action item methods)
        *   Potentially `ISpaceReservationRepository`, `IMessageAttachmentRepository`, `IMessageReactionRepository`, `IMeetingNoteActionItemRepository` if choosing to separate these concerns further. *Initial Recommendation: Keep related methods within the main entity repository unless complexity demands separation.*

4.  **Create Barrel File (`index.ts`):**
    *   Create file: `src/repositories/interfaces/index.ts`
    *   Export all defined interfaces.
    *   Example:
        ```typescript
        export * from './IUserRepository';
        export * from './ICompanyRepository';
        // ... other interfaces
        ```

**Considerations:**

*   **Granularity:** Decide if complex related data (like reactions, attachments, reservations) should have methods within the main entity's repository or have their own dedicated repositories. Start simpler (within main repo) and refactor if needed.
*   **Pagination/Filtering/Sorting:** Define how these options will be passed to methods like `findByConversation`, `findByCompany`, etc. (e.g., using an `options` object). Create a common `PaginationOptions` type if needed.
*   **Transactions:** Consider if any operations require transactional integrity across multiple repository calls. The interface itself won't enforce this, but it's a consideration for the implementation layer.

**Completion Criteria:**
*   Interfaces defining necessary data access methods exist for all core entities in `src/repositories/interfaces/`.
*   Interfaces use appropriate TypeScript types.
*   A barrel file exports all interfaces.