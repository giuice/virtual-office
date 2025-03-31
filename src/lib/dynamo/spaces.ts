// src/lib/dynamo/spaces.ts
import { DynamoDB } from 'aws-sdk';
import * as crypto from 'crypto';
import { Space } from '@/types/database'; // Use Space type
import { docClient, ensureServerSide } from './client';
import { TABLES, convertDates } from './utils';

// NOTE: Temporarily including generic functions used by space functions.
// These might be moved to a generic operations file later.

// Generic add document function
async function addDocument<T>(
  tableName: string,
  data: Omit<T, 'id'> // Generic Omit, specific types handle createdAt/updatedAt
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
      // Note: createdAt/updatedAt are added specifically in createSpace
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

  try {
    const result = await docClient.query(params).promise();
    return (result.Items || []) as T[];
  } catch (error) {
    console.error('DynamoDB query error:', error);
    console.error('Query params:', JSON.stringify(params, null, 2));
    throw error;
  }
}


// --- Space specific functions ---

export async function createSpace(spaceData: Omit<Space, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const dataWithTimestamps = {
    ...spaceData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  // Pass the full data including timestamps to addDocument
  // The generic addDocument expects Omit<T, 'id'>, but we handle timestamps here
  // Need to cast to satisfy the generic constraint temporarily, or adjust addDocument signature
  return addDocument<Omit<Space, 'id'>>(TABLES.SPACES, dataWithTimestamps as Omit<Space, 'id'>);
}

export async function getSpacesByCompany(companyId: string): Promise<Space[]> {
  // Use the CompanyIndex GSI to query by companyId
  return queryDocuments<Space>(
    TABLES.SPACES,
    [['companyId', '==', companyId]],
    'CompanyIndex' // Assuming GSI is named CompanyIndex for spaces table
  );
}

export async function updateSpace(spaceId: string, data: Partial<Space>): Promise<void> {
  const dataWithTimestamp = { ...data, updatedAt: new Date().toISOString() };
  return updateDocument<Space>(TABLES.SPACES, spaceId, dataWithTimestamp);
}

export async function updateSpaceUsers(spaceId: string, userIds: string[]): Promise<void> {
  // Only update userIds and updatedAt
  return updateDocument<Space>(TABLES.SPACES, spaceId, { userIds, updatedAt: new Date().toISOString() });
}
