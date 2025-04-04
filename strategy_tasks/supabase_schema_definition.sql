-- Supabase Schema Definition for Virtual Office App
-- Date: 3/31/2025

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Optional ENUM Types (Uncomment if choosing to use ENUMs over TEXT)
CREATE TYPE user_role AS ENUM ('admin', 'member');
CREATE TYPE user_status AS ENUM ('online', 'away', 'busy', 'offline');
CREATE TYPE space_type AS ENUM ('workspace', 'conference', 'social', 'breakout', 'private_office', 'open_space', 'lounge', 'lab');
CREATE TYPE space_status AS ENUM ('active', 'available', 'maintenance', 'locked', 'reserved', 'in_use');
CREATE TYPE message_type AS ENUM ('text', 'image', 'file', 'system', 'announcement');
CREATE TYPE message_status AS ENUM ('sending', 'sent', 'delivered', 'read', 'failed');
CREATE TYPE conversation_type AS ENUM ('direct', 'group', 'room');
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired');
CREATE TYPE note_generator AS ENUM ('ai', 'user');
CREATE TYPE announcement_priority AS ENUM ('low', 'medium', 'high');

-- Companies Table
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    admin_ids UUID[], -- Array of User IDs
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    settings JSONB -- Store settings like allowGuestAccess, maxRooms, defaultRoomSettings, theme
);

-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- Using UUID generated by DB
    firebase_uid TEXT UNIQUE, -- Store Firebase UID for linking, make it unique if it's the primary auth identifier
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL, -- Or CASCADE depending on desired behavior
    email TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    status user_status DEFAULT 'offline' NOT NULL, -- Use ENUM type
    status_message TEXT,
    preferences JSONB, -- Store theme, notifications, defaultRoom preferences
    role user_role DEFAULT 'member' NOT NULL, -- Use ENUM type
    last_active TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
-- Indexes for Users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_company_id ON users(company_id);
CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);


-- Spaces Table (Replaces deprecated Room)
CREATE TABLE spaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type space_type NOT NULL, -- Use ENUM type
    status space_status NOT NULL, -- Use ENUM type
    capacity INTEGER DEFAULT 0 NOT NULL,
    features TEXT[], -- Array of feature strings
    position JSONB, -- Store x, y, width, height
    user_ids UUID[], -- Array of User IDs currently in the space
    description TEXT,
    access_control JSONB, -- Store isPublic, allowedUsers, allowedRoles, ownerId
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    is_template BOOLEAN DEFAULT false NOT NULL,
    template_name TEXT
);
-- Indexes for Spaces
CREATE INDEX idx_spaces_company_id ON spaces(company_id);
CREATE INDEX idx_spaces_user_ids ON spaces USING GIN (user_ids);


-- Space Reservations Table
CREATE TABLE space_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name TEXT, -- Denormalized user name for easier display
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    purpose TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
-- Indexes for Space Reservations
CREATE INDEX idx_space_reservations_space_id ON space_reservations(space_id);
CREATE INDEX idx_space_reservations_user_id ON space_reservations(user_id);
CREATE INDEX idx_space_reservations_times ON space_reservations(start_time, end_time);


-- Conversations Table
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type conversation_type NOT NULL, -- Use ENUM type
    participants UUID[], -- Array of User IDs
    last_activity TIMESTAMPTZ DEFAULT now() NOT NULL,
    name TEXT, -- For group/room conversations
    is_archived BOOLEAN DEFAULT false NOT NULL,
    unread_count JSONB, -- Map of user IDs to unread counts { "user_id_1": 2, "user_id_2": 0 }
    room_id UUID REFERENCES spaces(id) ON DELETE SET NULL, -- Link to space for room conversations
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
-- Indexes for Conversations
CREATE INDEX idx_conversations_participants ON conversations USING GIN (participants);
CREATE INDEX idx_conversations_room_id ON conversations(room_id);


-- Messages Table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL, -- User might be deleted
    content TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT now() NOT NULL,
    type message_type NOT NULL, -- Use ENUM type
    status message_status NOT NULL, -- Use ENUM type
    reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL, -- Self-reference for threads
    is_edited BOOLEAN DEFAULT false NOT NULL,
    CONSTRAINT check_content_not_empty CHECK (content <> '')
);
-- Indexes for Messages
CREATE INDEX idx_messages_conversation_id_timestamp ON messages(conversation_id, timestamp DESC);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_reply_to_id ON messages(reply_to_id);


-- Message Attachments Table
CREATE TABLE message_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    size INTEGER NOT NULL,
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
-- Index for Message Attachments
CREATE INDEX idx_message_attachments_message_id ON message_attachments(message_id);


-- Message Reactions Table
CREATE TABLE message_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (message_id, user_id, emoji) -- Ensure a user can only react once with the same emoji per message
);
-- Indexes for Message Reactions
CREATE INDEX idx_message_reactions_message_id ON message_reactions(message_id);
CREATE INDEX idx_message_reactions_user_id ON message_reactions(user_id);


-- Announcements Table
CREATE TABLE announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    posted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    timestamp TIMESTAMPTZ DEFAULT now() NOT NULL,
    expiration TIMESTAMPTZ,
    priority announcement_priority DEFAULT 'medium', -- Use ENUM type
    CONSTRAINT check_content_not_empty_announcements CHECK (content <> ''),
    CONSTRAINT check_title_not_empty_announcements CHECK (title <> '')
);
-- Index for Announcements
CREATE INDEX idx_announcements_company_id ON announcements(company_id);


-- Meeting Notes Table
CREATE TABLE meeting_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE, -- Assuming notes belong to a space/room
    title TEXT NOT NULL,
    meeting_date TIMESTAMPTZ NOT NULL,
    transcript TEXT,
    summary TEXT NOT NULL,
    generated_by note_generator NOT NULL, -- Use ENUM type
    edited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT check_summary_not_empty CHECK (summary <> '')
);
-- Index for Meeting Notes
CREATE INDEX idx_meeting_notes_room_id ON meeting_notes(room_id);


-- Meeting Note Action Items Table
CREATE TABLE meeting_note_action_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    note_id UUID NOT NULL REFERENCES meeting_notes(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    due_date TIMESTAMPTZ,
    completed BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT check_description_not_empty CHECK (description <> '')
);
-- Indexes for Action Items
CREATE INDEX idx_meeting_note_action_items_note_id ON meeting_note_action_items(note_id);
CREATE INDEX idx_meeting_note_action_items_assignee_id ON meeting_note_action_items(assignee_id);


-- Invitations Table
CREATE TABLE invitations (
    token TEXT PRIMARY KEY, -- Using the token itself as the primary key
    email TEXT NOT NULL,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    role user_role NOT NULL, -- Use ENUM type
    expires_at TIMESTAMPTZ NOT NULL, -- Use TIMESTAMPTZ for consistency
    status invitation_status NOT NULL, -- Use ENUM type
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
-- Indexes for Invitations
CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_invitations_company_id ON invitations(company_id);