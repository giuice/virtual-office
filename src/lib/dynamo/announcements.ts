// src/lib/dynamo/announcements.ts
import { DynamoDB } from 'aws-sdk';
import * as crypto from 'crypto';
import { Announcement } from '@/types/database';
import { docClient, ensureServerSide } from './client';
import { TABLES, convertDates } from './utils';

// NOTE: Temporarily including generic functions used by announcement functions.
// These might be moved to a generic operations file later.

// Generic add document function
async function addDocument<T>(
  tableName: string,
  data: Omit<T, 'id' | 'timestamp'> // Adjusted Omit for announcement create
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
      timestamp: new Date().toISOString() // timestamp added here for announcements
    }
  };

  await docClient.put(params).promise();
  return id;
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

  // Handle sorting - Assuming timestamp is the sort key for CompanyIndex
  if (orderByField === 'timestamp') {
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


// --- Announcement specific functions ---

export async function createAnnouncement(announcementData: Omit<Announcement, 'id' | 'timestamp'>): Promise<string> {
  // Note: timestamp is handled by the generic addDocument now
  return addDocument<Announcement>(TABLES.ANNOUNCEMENTS, announcementData);
}

export async function getAnnouncementsByCompany(companyId: string): Promise<Announcement[]> {
  // Assuming a GSI named 'CompanyIndex' with 'companyId' as PK and 'timestamp' as SK
  return queryDocuments<Announcement>(
    TABLES.ANNOUNCEMENTS,
    [['companyId', '==', companyId]],
    'CompanyIndex', // Specify the index name
    'timestamp' // Specify sort key
    // Add limit/pagination parameters here if needed later
  );
}
