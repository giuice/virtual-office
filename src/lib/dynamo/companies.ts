// src/lib/dynamo/companies.ts
import { DynamoDB } from 'aws-sdk';
import * as crypto from 'crypto';
import { Company } from '@/types/database';
import { docClient, ensureServerSide } from './client';
import { TABLES, convertDates } from './utils';

// NOTE: Temporarily including generic functions used by company functions.
// These might be moved to a generic operations file later.

// Generic add document function
async function addDocument<T>(
  tableName: string,
  data: Omit<T, 'id' | 'createdAt'> // Adjusted Omit for company create
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
      createdAt: new Date().toISOString() // createdAt added here
    }
  };

  await docClient.put(params).promise();
  return id;
}

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
  return result.Item as T | null;
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


// --- Company specific functions ---

export async function createCompany(companyData: Omit<Company, 'id' | 'createdAt'>): Promise<string> {
  // Note: createdAt is handled by the generic addDocument now
  return addDocument<Company>(TABLES.COMPANIES, companyData);
}

export async function getCompany(companyId: string): Promise<Company | null> {
  return getDocument<Company>(TABLES.COMPANIES, companyId);
}

export async function updateCompany(companyId: string, data: Partial<Company>): Promise<void> {
  return updateDocument<Company>(TABLES.COMPANIES, companyId, data);
}
