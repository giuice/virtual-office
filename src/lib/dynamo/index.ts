// src/lib/dynamo/index.ts

// Export constants and utils
export * from './utils';
export * from './client'; // Export client and ensureServerSide if needed externally

// Export entity-specific functions
export * from './users';
export * from './companies';
export * from './spaces';
export * from './messages';
export * from './conversations';
export * from './invitations';
export * from './announcements';
export * from './meetingNotes';

// Note: Generic functions (addDocument, getDocument, updateDocument, deleteDocument, queryDocuments)
// are currently duplicated within the entity files where they are used.
// A future refactor could move these to a separate './operations.ts' file
// and have entity files import from there to avoid duplication.
