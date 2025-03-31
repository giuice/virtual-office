// src/lib/dynamo/users.ts
import { DynamoDB } from 'aws-sdk';
import * as crypto from 'crypto';
import { User } from '@/types/database';
import { docClient, ensureServerSide } from './client';
import { TABLES, convertDates } from './utils';

// NOTE: Temporarily including generic functions used by user functions.
// These might be moved to a generic operations file later.

// Generic get document function
async function getDocument<T>(
  tableName: string,
  id: string
): Promise<T | null> {
  ensureServerSide();
  if (!docClient) throw new Error("DynamoDB client not initialized");
  const params = {
    TableName: tableName,
    Key: { id }
  };

  const result = await docClient.get(params).promise();
  return result.Item as T | null; // Ensure null is returned if Item is undefined
}

// Generic update document function
async function updateDocument<T>(
  tableName: string,
  id: string,
  data: Partial<T>
): Promise<void> {
  ensureServerSide();
  if (!docClient) throw new Error("DynamoDB client not initialized");
  const convertedData = convertDates(data);

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
  indexName?: string // Allow specifying index directly
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

  // Note: Removed orderByField and limitCount from generic query for simplicity here.
  // Specific functions can add these back if needed.

  try {
    const result = await docClient.query(params).promise();
    return (result.Items || []) as T[]; // Ensure empty array if Items is undefined
  } catch (error) {
    console.error('DynamoDB query error:', error);
    console.error('Query params:', JSON.stringify(params, null, 2));
    throw error;
  }
}


// --- User specific functions ---

export async function createUser(userData: Omit<User, 'lastActive' | 'createdAt'> & { id?: string }): Promise<string> {
  ensureServerSide();
  if (!docClient) throw new Error("DynamoDB client not initialized");
  const id = userData.id || crypto.randomUUID();

  const convertedData = convertDates(userData);

  const data: User = {
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

  await docClient.put(params).promise();
  return id;
}

export async function getUserByFirebaseId(firebaseUserId: string): Promise<User | null> {
  // Assuming firebaseUserId is the primary key 'id' for the USERS table
  return getDocument<User>(TABLES.USERS, firebaseUserId);
}

export async function getUsersByCompany(companyId: string): Promise<User[]> {
  // Use the CompanyIndex GSI to query by companyId
  return queryDocuments<User>(
    TABLES.USERS,
    [['companyId', '==', companyId]],
    'CompanyIndex' // Specify the index name
  );
}

export async function updateUser(userId: string, data: Partial<User>): Promise<void> {
  return updateDocument<User>(TABLES.USERS, userId, data);
}

export async function updateUserStatus(userId: string, status: User['status'], statusMessage?: string): Promise<void> {
  ensureServerSide();
  if (!docClient) throw new Error("DynamoDB client not initialized");

  let updateExpression = 'set #status = :status, lastActive = :lastActive';
  const expressionAttributeNames: Record<string, string> = {
    '#status': 'status'
  };
  const expressionAttributeValues: Record<string, any> = {
    ':status': status,
    ':lastActive': new Date().toISOString()
  };

  if (statusMessage !== undefined) {
    updateExpression += ', #statusMessage = :statusMessage';
    expressionAttributeNames['#statusMessage'] = 'statusMessage'; // Add name mapping
    expressionAttributeValues[':statusMessage'] = statusMessage;
  } else {
    // Explicitly remove statusMessage if not provided? Or handle in updateDocument?
    // For now, let's assume updateDocument handles undefined correctly (it should skip)
    // If explicit removal is needed:
    // updateExpression += ' REMOVE statusMessage';
  }

  const params = {
    TableName: TABLES.USERS,
    Key: { id: userId },
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues
  };

  await docClient.update(params).promise();
}
