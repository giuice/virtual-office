# Virtual Office Database Documentation

## DynamoDB Tables

The Virtual Office application uses AWS DynamoDB for data storage with the following tables:

### 1. `virtual-office-companies`

Stores company information and settings.

**Primary Key**: `id` (UUID string)

**Attributes**:
- `id`: Unique identifier (UUID)
- `name`: Company name
- `adminIds`: Array of user IDs with admin permissions
- `createdAt`: ISO 8601 timestamp of creation
- `settings`: Object containing company settings
  - `allowGuestAccess`: Boolean flag for guest access
  - `maxRooms`: Maximum number of rooms allowed
  - `theme`: UI theme preference
  - `defaultRoomSettings`: Default settings for new rooms

### 2. `virtual-office-users`

Stores user profiles.

**Primary Key**: `id` (UUID string)
**Global Secondary Index**: `CompanyIndex` on `companyId`

**Attributes**:
- `id`: Unique identifier (UUID, same as Firebase Auth UID)
- `companyId`: Company the user belongs to
- `email`: User's email address
- `displayName`: User's display name
- `avatarUrl`: URL to user's avatar image (optional)
- `status`: User status (`online`, `away`, `busy`, `offline`)
- `statusMessage`: Custom status message (optional)
- `role`: User role (`admin` or `member`)
- `preferences`: Object containing user preferences
  - `theme`: UI theme preference
  - `notifications`: Boolean for notification settings
  - `defaultRoom`: Default room ID
- `lastActive`: ISO 8601 timestamp of last activity
- `createdAt`: ISO 8601 timestamp of account creation

### 3. `virtual-office-rooms`

Stores virtual rooms in the office layout.

**Primary Key**: `id` (UUID string)
**Global Secondary Index**: `CompanyIndex` on `companyId`

**Attributes**:
- `id`: Unique identifier (UUID)
- `companyId`: Company the room belongs to
- `name`: Room name
- `description`: Room description (optional)
- `isLocked`: Boolean flag for room access control
- `capacity`: Maximum number of users allowed (optional)
- `occupants`: Array of user IDs currently in the room
- `position`: Object containing room position in the floor plan
  - `x`: X coordinate
  - `y`: Y coordinate
  - `width`: Room width
  - `height`: Room height
- `createdBy`: User ID of room creator
- `createdAt`: ISO 8601 timestamp of creation

### 4. `virtual-office-messages`

Stores chat messages.

**Primary Key**: `id` (UUID string)
**Global Secondary Index**: `RoomIndex` on `roomId`

**Attributes**:
- `id`: Unique identifier (UUID)
- `roomId`: Room ID for room messages (optional)
- `recipientId`: User ID for direct messages (optional)
- `senderId`: User ID of message sender
- `content`: Message text content
- `timestamp`: ISO 8601 timestamp of message
- `type`: Message type (`text`, `image`, `file`, `transcript`)
- `attachments`: Array of attachment objects (optional)
  - `url`: URL to attachment
  - `type`: MIME type
  - `name`: File name

### 5. `virtual-office-announcements`

Stores company-wide announcements.

**Primary Key**: `id` (UUID string)
**Global Secondary Index**: `CompanyIndex` on `companyId`

**Attributes**:
- `id`: Unique identifier (UUID)
- `companyId`: Company the announcement belongs to
- `title`: Announcement title
- `content`: Announcement content
- `postedBy`: User ID of poster
- `timestamp`: ISO 8601 timestamp of posting
- `expiration`: ISO 8601 timestamp of expiration (optional)
- `priority`: Priority level (`low`, `medium`, `high`)

### 6. `virtual-office-meeting-notes`

Stores meeting notes and transcripts.

**Primary Key**: `id` (UUID string)
**Global Secondary Index**: `RoomIndex` on `roomId`

**Attributes**:
- `id`: Unique identifier (UUID)
- `roomId`: Room ID where meeting occurred
- `title`: Meeting title
- `meetingDate`: ISO 8601 timestamp of meeting date
- `transcript`: Meeting transcript (optional)
- `summary`: Meeting summary
- `actionItems`: Array of action item objects (optional)
  - `description`: Task description
  - `assignee`: User ID of assignee
  - `dueDate`: ISO 8601 timestamp of due date
  - `completed`: Boolean completion status
- `generatedBy`: Source of notes (`ai` or `user`)
- `editedBy`: User ID of last editor (optional)
- `createdAt`: ISO 8601 timestamp of creation
- `updatedAt`: ISO 8601 timestamp of last update

## API Endpoints

### Company Endpoints

- `POST /api/companies/create` - Create a new company
- `GET /api/companies/get?id={companyId}` - Get company by ID
- `PATCH /api/companies/update?id={companyId}` - Update company details

### User Endpoints

- `POST /api/users/create` - Create a new user
- `GET /api/users/get-by-firebase-id?firebaseId={firebaseId}` - Get user by Firebase ID
- `GET /api/users/by-company?companyId={companyId}` - Get all users in a company
- `PATCH /api/users/update?id={userId}` - Update user details

### Setup and Testing

- `GET /api/setup-dynamo-tables` - Initialize all DynamoDB tables
- `GET /api/test-aws` - Test AWS connectivity

## Database Setup Script

To initialize all the DynamoDB tables, use:

```javascript
// Call the setup endpoint
const response = await fetch('/api/setup-dynamo-tables');
const result = await response.json();
console.log(result);
```

This script creates all required tables with the necessary indexes if they don't already exist.

## Query Examples

### Get users by company

```javascript
// Example: Get all users for a company
const users = await getUsersByCompany('company-id-here');
```

### Update user status

```javascript
// Example: Update user status
await updateUserStatus('user-id-here', 'online', 'Working on project');
```

### Create a new company

```javascript
// Example: Create a new company
const companyData = {
  name: 'Acme Inc',
  adminIds: ['user-id-here'],
  settings: {
    allowGuestAccess: false,
    maxRooms: 10,
    theme: 'light'
  }
};
const companyId = await createCompany(companyData);
```