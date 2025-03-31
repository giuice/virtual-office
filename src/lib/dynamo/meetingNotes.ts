// src/lib/dynamo/meetingNotes.ts
import { DynamoDB } from 'aws-sdk';
import * as crypto from 'crypto';
import { MeetingNote } from '@/types/database';
import { docClient, ensureServerSide } from './client';
import { TABLES, convertDates } from './utils';

// NOTE: Temporarily including generic functions used by meeting note functions.
// These might be moved to a generic operations file later.

// Generic add document function
async function addDocument<T>(
  tableName: string,
  data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> // Adjusted Omit for meeting note create
): Promise<string> {
  ensureServerSide();
  if (!docClient) throw new Error("DynamoDB client not initialized");
  const id = crypto.randomUUID();
  const convertedData = convertDates(data);
  const params = {
    TableName: tableName,
    Item: {
      id,
      ...convertedData,
      createdAt: new Date().toISOString(), // Assuming createdAt/updatedAt for notes
      updatedAt: new Date().toISOString()
    }
  };

  await docClient.put(params).promise();
  return id;
}

// Generic update document function
async function updateDocument<T>(
  tableName: string,
  id: string,
  data: Partial<T>
): Promise<void> {
  ensureServerSide();
  if (!docClient) throw new Error("DynamoDB client not initialized");
  // Add updatedAt automatically for meeting notes
  const dataWithTimestamp = { ...data, updatedAt: new Date().toISOString() };
  const convertedData = convertDates(dataWithTimestamp);


  const updateExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, any> = {};

  Object.entries(convertedData).forEach(([key, value]) => {
    if (value === undefined) return;
    const attributeName = `#${key}`;
    const attributeValue = `:${key}`;
    updateExpressions.push(`${attributeName} = ${attributeValue}`);
    expressionAttributeNames[attributeName] = key;
    expressionAttributeValues[attributeValue] = value;
  });

  if (updateExpressions.length === 0) return;

  const params = {
    TableName: tableName,
    Key: { id },
    UpdateExpression: `set ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues
  };

  await docClient.update(params).promise();
}

// Generic query documents function
async function queryDocuments<T>(
  tableName: string,
  whereConditions: [string, "==", any][],
  indexName?: string, // Allow specifying index directly
  orderByField?: string, // Added back orderByField
  limitCount?: number // Added back limitCount
): Promise<T[]> {
  ensureServerSide();
  if (!docClient) throw new Error("DynamoDB client not initialized");

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

  if (indexName) {
    params.IndexName = indexName;
  }

  // Handle sorting - Assuming meetingDate is the sort key for RoomIndex
  if (orderByField === 'meetingDate') {
     params.ScanIndexForward = true; // Or false for descending order (newest first)
  }

  if (limitCount) {
    params.Limit = limitCount;
  }

  try {
    const result = await docClient.query(params).promise();
    return (result.Items || []) as T[];
  } catch (error) {
    console.error('DynamoDB query error:', error);
    console.error('Query params:', JSON.stringify(params, null, 2));
    throw error;
  }
}


// --- Meeting Notes specific functions ---

export async function createMeetingNote(noteData: Omit<MeetingNote, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  // Note: createdAt/updatedAt are handled by the generic addDocument now
  return addDocument<MeetingNote>(TABLES.MEETING_NOTES, noteData);
}

export async function getMeetingNotesByRoom(roomId: string): Promise<MeetingNote[]> {
  // Assuming a GSI named 'RoomIndex' with 'roomId' as PK and 'meetingDate' as SK
  return queryDocuments<MeetingNote>(
    TABLES.MEETING_NOTES,
    [['roomId', '==', roomId]],
    'RoomIndex', // Specify the index name
    'meetingDate' // Specify sort key
    // Add limit/pagination parameters here if needed later
  );
}

export async function updateMeetingNote(noteId: string, data: Partial<MeetingNote>): Promise<void> {
  // Note: updatedAt is handled by the generic updateDocument now
  return updateDocument<MeetingNote>(TABLES.MEETING_NOTES, noteId, data);
}
