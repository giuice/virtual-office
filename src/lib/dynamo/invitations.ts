// src/lib/dynamo/invitations.ts
import { DynamoDB } from 'aws-sdk';
import { Invitation } from '@/types/database';
import { docClient, ensureServerSide } from './client';
import { TABLES } from './utils'; // Only need TABLES here

// NOTE: Temporarily including generic functions used by invitation functions.
// These might be moved to a generic operations file later.

// Generic get document function
async function getDocument<T>(
  tableName: string,
  key: DynamoDB.DocumentClient.Key // Use Key type for flexibility (token is PK here)
): Promise<T | null> {
  ensureServerSide();
  if (!docClient) throw new Error("DynamoDB client not initialized");
  const params = {
    TableName: tableName,
    Key: key
  };

  const result = await docClient.get(params).promise();
  return result.Item as T | null;
}

// Generic update document function
async function updateDocument<T>(
  tableName: string,
  key: DynamoDB.DocumentClient.Key, // Use Key type
  data: Partial<T> // Data might not need conversion if status is simple
): Promise<void> {
  ensureServerSide();
  if (!docClient) throw new Error("DynamoDB client not initialized");
  // const convertedData = convertDates(data); // Likely not needed for simple status update

  const updateExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, any> = {};

  Object.entries(data).forEach(([k, value]) => {
    if (value === undefined) return;
    const attributeName = `#${k}`;
    const attributeValue = `:${k}`;
    updateExpressions.push(`${attributeName} = ${attributeValue}`);
    expressionAttributeNames[attributeName] = k;
    expressionAttributeValues[attributeValue] = value;
  });

  if (updateExpressions.length === 0) return;

  const params = {
    TableName: tableName,
    Key: key,
    UpdateExpression: `set ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues
  };

  await docClient.update(params).promise();
}


// --- Invitation specific functions ---

// Define input type for createInvitation allowing Date for expiresAt
type CreateInvitationInput = Omit<Invitation, 'createdAt' | 'status' | 'expiresAt'> & {
  expiresAt: number | Date; // Allow Date or number initially
};

export async function createInvitation(invitationData: CreateInvitationInput): Promise<void> {
  ensureServerSide();
  if (!docClient) throw new Error("DynamoDB client not initialized");

  let expiresAtTimestamp: number;
  if (typeof invitationData.expiresAt === 'number') {
    expiresAtTimestamp = invitationData.expiresAt;
  } else if (invitationData.expiresAt instanceof Date) {
    console.warn("expiresAt was provided as Date, converting to Unix timestamp.");
    expiresAtTimestamp = Math.floor(invitationData.expiresAt.getTime() / 1000);
  } else {
    console.error("Invalid expiresAt provided:", invitationData.expiresAt);
    throw new Error("expiresAt must be a number (Unix timestamp) or a Date object");
  }

  const item: Invitation = {
    token: invitationData.token, // Assuming token is the primary key
    email: invitationData.email,
    companyId: invitationData.companyId,
    role: invitationData.role,
    expiresAt: expiresAtTimestamp,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  const params = {
    TableName: TABLES.INVITATIONS,
    Item: item,
  };
  await docClient.put(params).promise();
}

export async function getInvitationByToken(token: string): Promise<Invitation | null> {
  // Use the generic getDocument, specifying the key structure
  return getDocument<Invitation>(TABLES.INVITATIONS, { token });
}

export async function updateInvitationStatus(token: string, status: Invitation['status']): Promise<void> {
  // Use the generic updateDocument, specifying the key and the partial data to update
  return updateDocument<Invitation>(TABLES.INVITATIONS, { token }, { status });
}
