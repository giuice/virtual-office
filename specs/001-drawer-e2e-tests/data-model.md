# Data Model: Playwright E2E — Messaging Drawer Interactions

**Date**: 2025-10-24  
**Purpose**: Defines test data entities for E2E tests.

## Entities

### User Session
- **Fields**: id (string), email (string), role ('admin' | 'member'), avatar_url (string?)
- **Relationships**: Has many Conversations (as participant)
- **Validation**: Email format, role in allowed values
- **State Transitions**: Authenticated → Online → Offline

### Conversation
- **Fields**: id (string), type ('dm' | 'room'), participants (User[]), is_pinned (boolean), is_archived (boolean), last_message_at (timestamp)
- **Relationships**: Belongs to Users, Has many Messages
- **Validation**: At least 2 participants for room, 2 for dm
- **State Transitions**: Active → Pinned → Archived → Unarchived

### Message
- **Fields**: id (string), conversation_id (string), sender_id (string), content (string), sent_at (timestamp), read_by (User[])
- **Relationships**: Belongs to Conversation and User
- **Validation**: Non-empty content, valid sender
- **State Transitions**: Sent → Delivered → Read</content>
<parameter name="filePath">/home/giuice/apps/virtual-office/specs/001-drawer-e2e-tests/data-model.md