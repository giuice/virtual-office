// src/lib/dynamo.ts
import { DynamoDB } from 'aws-sdk';
import * as crypto from 'crypto';
import { 
  Company, 
  User, 
  Room, 
  Message, 
  Announcement, 
  MeetingNote
} from '@/types/database';
import AWS_CONFIG from './aws-config';

// Check if we're running on the server
const isServer = typeof window === 'undefined';

let dynamoDb: DynamoDB.DocumentClient | null = null;

// Initialize DynamoDB client for server-side only
if (isServer) {
  try {
    dynamoDb = new DynamoDB.DocumentClient();
    console.log("DynamoDB client initialized successfully");
  } catch (error) {
    console.error("Error initializing DynamoDB client:", error);
    dynamoDb = null;
  }
} else {
  console.warn("Attempted to load DynamoDB in client environment");
}

// Ensure DynamoDB operations are only performed on the server
function ensureServerSide() {
  if (!isServer || !dynamoDb) {
    throw new Error('DynamoDB operations can only be performed on the server side');
  }
}

// Table names
export const TABLES = { // Added export
  COMPANIES: 'virtual-office-companies',
  USERS: 'virtual-office-users',
  ROOMS: 'virtual-office-rooms',
  MESSAGES: 'virtual-office-messages',
  ANNOUNCEMENTS: 'virtual-office-announcements',
  MEETING_NOTES: 'virtual-office-meeting-notes',
};

// Generic add document function
export async function addDocument<T>(
  tableName: string, 
  data: Omit<T, 'id'>
): Promise<string> {
  ensureServerSide();
  if (!dynamoDb) throw new Error("DynamoDB client not initialized"); // Add null check
  const id = crypto.randomUUID();
  const convertedData = convertDates(data);
  const params = { // Correctly define params object
    TableName: tableName,
    Item: {
      id,
      ...convertedData,
      createdAt: new Date().toISOString()
    }
  };

 await dynamoDb.put(params).promise();
  return id;
}

// Generic set document function with specific ID
export async function setDocument<T>(
  tableName: string, 
  id: string, 
  data: Omit<T, 'id'>
): Promise<void> {
  ensureServerSide();
  if (!dynamoDb) throw new Error("DynamoDB client not initialized"); // Add null check
  const params = {
    TableName: tableName,
    Key: { id },
    UpdateExpression: 'set #data = :data',
    ExpressionAttributeNames: {
      '#data': 'data'
    },
    ExpressionAttributeValues: {
      ':data': data
    }
  };

  await dynamoDb.update(params).promise();
}

// Generic get document function
export async function getDocument<T>(
  tableName: string, 
  id: string
): Promise<T | null> {
  ensureServerSide();
  if (!dynamoDb) throw new Error("DynamoDB client not initialized"); // Add null check
  const params = {
    TableName: tableName,
    Key: { id }
  };

  const result = await dynamoDb.get(params).promise();
  return result.Item as T;
}

// Generic update document function
export async function updateDocument<T>(
  tableName: string, 
  id: string, 
  data: Partial<T>
): Promise<void> {
  ensureServerSide();
  if (!dynamoDb) throw new Error("DynamoDB client not initialized"); // Add null check
  // Convert any Firebase Timestamp objects to ISO strings
  const convertedData = convertDates(data);
  
  // Build update expression and values
  const updateExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, any> = {};
  
  // Process each field in the update data
  Object.entries(convertedData).forEach(([key, value]) => {
    // Skip undefined values
    if (value === undefined) return;
    
    // Handle reserved words by using expression attribute names
    const attributeName = `#${key}`;
    const attributeValue = `:${key}`;
    
    updateExpressions.push(`${attributeName} = ${attributeValue}`);
    expressionAttributeNames[attributeName] = key;
    expressionAttributeValues[attributeValue] = value;
  });
  
  // If no valid fields to update, return early
  if (updateExpressions.length === 0) return;
  
  const params = {
    TableName: tableName,
    Key: { id },
    UpdateExpression: `set ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues
  };

  await dynamoDb.update(params).promise();
}

// Generic delete document function
export async function deleteDocument(
  tableName: string, 
  id: string
): Promise<void> {
  ensureServerSide();
  if (!dynamoDb) throw new Error("DynamoDB client not initialized"); // Add null check
  const params = {
    TableName: tableName,
    Key: { id }
  };

  await dynamoDb.delete(params).promise();
}

// Generic query documents function
export async function queryDocuments<T>(
  tableName: string, 
  whereConditions: [string, "==", any][],
  orderByField?: string,
  limitCount?: number
): Promise<T[]> {
  ensureServerSide();
  if (!dynamoDb) throw new Error("DynamoDB client not initialized"); // Add null check
  
  // First condition field determines the index to use
  const firstField = whereConditions[0]?.[0];
  
  // Determine which index to use based on field
  let indexName: string | undefined;
  
  if (firstField === 'companyId') {
    indexName = 'CompanyIndex';
  } else if (firstField === 'roomId') {
    indexName = 'RoomIndex';
  }
  
  // Build the query parameters
  const keyConditionExpression = whereConditions
    .map(([field]) => `#${field} = :${field}`)
    .join(' AND ');

  const expressionAttributeValues = whereConditions
    .reduce((acc, [field, , value]) => ({
      ...acc,
      [`:${field}`]: value
    }), {});
    
  const expressionAttributeNames = whereConditions
    .reduce((acc, [field]) => ({
      ...acc,
      [`#${field}`]: field
    }), {});

  const params: DynamoDB.DocumentClient.QueryInput = {
    TableName: tableName,
    KeyConditionExpression: keyConditionExpression,
    ExpressionAttributeValues: expressionAttributeValues,
    ExpressionAttributeNames: expressionAttributeNames
  };
  
  // Add index if needed
  if (indexName && firstField !== 'id') {
    params.IndexName = indexName;
  }

  if (orderByField) {
    params.ScanIndexForward = true;
  }

  if (limitCount) {
    params.Limit = limitCount;
  }

  try {
    const result = await dynamoDb.query(params).promise();
    return result.Items as T[];
  } catch (error) {
    console.error('DynamoDB query error:', error);
    console.error('Query params:', JSON.stringify(params, null, 2));
    throw error;
  }
}

// Convert between Firebase Timestamp and ISO string date
const convertDates = (data: any): any => {
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
    if (value && typeof value === 'object' && 'seconds' in value && 'nanoseconds' in value) {
      // This looks like a Firestore Timestamp, convert to ISO string
      result[key] = new Date(value.seconds * 1000).toISOString();
    } else if (key === 'createdAt' || key === 'updatedAt' || key === 'lastActive' || key === 'timestamp' || key === 'meetingDate') {
      // Convert potential timestamp fields to ISO strings if they're dates
      if (value instanceof Date) {
        result[key] = value.toISOString();
      } else if (typeof value === 'object' && value !== null) {
        result[key] = convertDates(value);
      } else {
        result[key] = value;
      }
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

// Company specific functions
export async function createCompany(companyData: Omit<Company, 'id' | 'createdAt'>): Promise<string> {
  ensureServerSide();
  const data = {
    ...companyData,
    createdAt: new Date().toISOString()
  };
  return addDocument<Company>(TABLES.COMPANIES, convertDates(data));
}

export async function getCompany(companyId: string): Promise<Company | null> {
  ensureServerSide();
  return getDocument<Company>(TABLES.COMPANIES, companyId);
}

export async function updateCompany(companyId: string, data: Partial<Company>): Promise<void> {
  ensureServerSide();
  return updateDocument<Company>(TABLES.COMPANIES, companyId, data);
}

// User specific functions
export async function createUser(userData: Omit<User, 'lastActive' | 'createdAt'> & { id?: string }): Promise<string> {
  ensureServerSide();
  const id = userData.id || crypto.randomUUID();
  
  // Convert any Firebase Timestamp objects
  const convertedData = convertDates(userData);
  
  const data = {
    ...convertedData,
    id,
    status: userData.status || 'offline',
    lastActive: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };
  
  const params = {
    TableName: TABLES.USERS,
    Item: data
  };

  await dynamoDb.put(params).promise();
  return id;
}

export async function getUserByFirebaseId(firebaseUserId: string): Promise<User | null> {
  ensureServerSide();
  return getDocument<User>(TABLES.USERS, firebaseUserId);
}

export async function getUsersByCompany(companyId: string): Promise<User[]> {
  ensureServerSide();
  
  // We need to use the CompanyIndex GSI to query by companyId
  const params = {
    TableName: TABLES.USERS,
    IndexName: 'CompanyIndex',
    KeyConditionExpression: 'companyId = :companyId',
    ExpressionAttributeValues: {
      ':companyId': companyId
    }
  };

  const result = await dynamoDb.query(params).promise();
  return result.Items as User[];
}

export async function updateUser(userId: string, data: Partial<User>): Promise<void> {
  ensureServerSide();
  return updateDocument<User>(TABLES.USERS, userId, data);
}

export async function updateUserStatus(userId: string, status: User['status'], statusMessage?: string): Promise<void> {
  ensureServerSide();
  
  // Build update expression and values
  let updateExpression = 'set #status = :status, lastActive = :lastActive';
  const expressionAttributeNames = {
    '#status': 'status'
  };
  const expressionAttributeValues = {
    ':status': status,
    ':lastActive': new Date().toISOString()
  };
  
  // Add statusMessage if provided
  if (statusMessage !== undefined) {
    updateExpression += ', statusMessage = :statusMessage';
    expressionAttributeValues[':statusMessage'] = statusMessage;
  }
  
  const params = {
    TableName: TABLES.USERS,
    Key: { id: userId },
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues
  };
  
  await dynamoDb.update(params).promise();
}

// Room specific functions
export async function createRoom(roomData: Omit<Room, 'id' | 'createdAt'>): Promise<string> {
  ensureServerSide();
  return addDocument<Room>(TABLES.ROOMS, roomData as any);
}

export async function getRoomsByCompany(companyId: string): Promise<Room[]> {
  ensureServerSide();
  return queryDocuments<Room>(TABLES.ROOMS, [['companyId', '==', companyId]]);
}

export async function updateRoom(roomId: string, data: Partial<Room>): Promise<void> {
  ensureServerSide();
  return updateDocument<Room>(TABLES.ROOMS, roomId, data);
}

export async function updateRoomOccupants(roomId: string, occupants: string[]): Promise<void> {
  ensureServerSide();
  return updateDocument<Room>(TABLES.ROOMS, roomId, { occupants });
}

// Message specific functions
export async function createMessage(messageData: Omit<Message, 'id' | 'timestamp'>): Promise<string> {
  ensureServerSide();
  return addDocument<Message>(TABLES.MESSAGES, messageData as any);
}

export async function getMessagesByRoom(roomId: string): Promise<Message[]> {
  ensureServerSide();
  return queryDocuments<Message>(
    TABLES.MESSAGES, 
    [['roomId', '==', roomId]], 
    'timestamp'
  );
}

// Announcement specific functions
export async function createAnnouncement(announcementData: Omit<Announcement, 'id' | 'timestamp'>): Promise<string> {
  ensureServerSide();
  return addDocument<Announcement>(TABLES.ANNOUNCEMENTS, announcementData as any);
}

export async function getAnnouncementsByCompany(companyId: string): Promise<Announcement[]> {
  ensureServerSide();
  return queryDocuments<Announcement>(
    TABLES.ANNOUNCEMENTS, 
    [['companyId', '==', companyId]], 
    'timestamp'
  );
}

// Meeting Notes specific functions
export async function createMeetingNote(noteData: Omit<MeetingNote, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  ensureServerSide();
  return addDocument<MeetingNote>(TABLES.MEETING_NOTES, noteData as any);
}

export async function getMeetingNotesByRoom(roomId: string): Promise<MeetingNote[]> {
  ensureServerSide();
  return queryDocuments<MeetingNote>(
    TABLES.MEETING_NOTES, 
    [['roomId', '==', roomId]], 
    'meetingDate'
  );
}

export async function updateMeetingNote(noteId: string, data: Partial<MeetingNote>): Promise<void> {
  ensureServerSide();
  return updateDocument<MeetingNote>(TABLES.MEETING_NOTES, noteId, data);
}