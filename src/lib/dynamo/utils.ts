// src/lib/dynamo/utils.ts

// Table names
export const TABLES = {
  COMPANIES: 'virtual-office-companies',
  USERS: 'virtual-office-users',
  SPACES: 'virtual-office-rooms', // Changed ROOMS to SPACES
  MESSAGES: 'virtual-office-messages',
  ANNOUNCEMENTS: 'virtual-office-announcements',
  MEETING_NOTES: 'virtual-office-meeting-notes',
  INVITATIONS: 'virtual-office-invitations',
  CONVERSATIONS: 'virtual-office-conversations',
};

// Convert between Firebase Timestamp and ISO string date (or other date representations)
export const convertDates = (data: any): any => {
  // If data is null or undefined, return as is
  if (data == null) return data;

  // If data is an array, convert each item
  if (Array.isArray(data)) {
    return data.map(item => convertDates(item));
  }

  // If data is not an object, return as is
  if (typeof data !== 'object') return data;

  // Create a new object to store converted data
  const result: any = {};

  // Convert each property
  for (const [key, value] of Object.entries(data)) {
    // Check if it looks like a Firestore Timestamp (for potential legacy data)
    // Add type assertion to handle 'unknown' type for value.seconds
    if (value && typeof value === 'object' && 'seconds' in value && 'nanoseconds' in value) {
      result[key] = new Date((value as { seconds: number }).seconds * 1000).toISOString();
    } else if (value instanceof Date) {
      // Convert standard Date objects to ISO strings
      result[key] = value.toISOString();
    } else if (value !== null && typeof value === 'object') {
      // Recursively convert nested objects
      result[key] = convertDates(value);
    } else {
      // Keep other types as is
      result[key] = value;
    }
  }

  return result;
};

// Note: Generic CRUD functions (addDocument, getDocument, updateDocument, deleteDocument, queryDocuments)
// will be moved to their respective entity files or potentially a generic operations file
// if they remain truly generic after refactoring. For now, they stay in the original dynamo.ts
// until we move entity-specific logic.
