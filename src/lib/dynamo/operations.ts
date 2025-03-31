// src/lib/dynamo/operations.ts
// Central location for generic DynamoDB helper functions

import { DynamoDB } from 'aws-sdk';
import * as crypto from 'crypto';
import { docClient, ensureServerSide } from './client';
import { convertDates, TABLES } from './utils'; // Import TABLES for addDocument logic

// Generic add document function - Unified
export async function addDocument<T>(
  tableName: string,
  data: Omit<T, 'id' | 'timestamp' | 'createdAt'> // Omit both potential auto-fields
): Promise<string> {
  ensureServerSide();
  if (!docClient) throw new Error("DynamoDB client not initialized");
  const id = crypto.randomUUID();
  const convertedData = convertDates(data);

  // Add timestamp or createdAt based on table (simple heuristic)
  let timestampField = {};
  if (tableName === TABLES.MESSAGES) {
      timestampField = { timestamp: new Date().toISOString() };
  } else if (tableName === TABLES.CONVERSATIONS) { // Add other tables if needed
      timestampField = { createdAt: new Date().toISOString() };
  }
  // Add more else if blocks for other tables needing auto-timestamps

  const params = {
    TableName: tableName,
    Item: {
      id,
      ...convertedData,
      ...timestampField // Add the appropriate timestamp field
    }
  };

  await docClient.put(params).promise();
  return id;
}

// Generic get document function
export async function getDocument<T>(tableName: string, id: string): Promise<T | null> {
  ensureServerSide();
  if (!docClient) throw new Error("DynamoDB client not initialized");
  const params = {
    TableName: tableName,
    Key: { id }
  };
  const result = await docClient.get(params).promise();
  return result.Item ? (result.Item as T) : null;
}

// Generic update document function
export async function updateDocument<T>(
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
    // Skip id field in updates
    if (key === 'id' || value === undefined) return;
    const attributeName = `#${key}`;
    const attributeValue = `:${key}`;
    updateExpressions.push(`${attributeName} = ${attributeValue}`);
    expressionAttributeNames[attributeName] = key;
    expressionAttributeValues[attributeValue] = value;
  });

  if (updateExpressions.length === 0) {
      console.warn(`UpdateDocument called for ${tableName}/${id} with no updatable fields.`);
      return;
  }


  const params: DynamoDB.DocumentClient.UpdateItemInput = {
    TableName: tableName,
    Key: { id },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: "NONE" // Optional: Use UPDATED_NEW to return updated item
  };

  try {
      await docClient.update(params).promise();
  } catch (error) {
      console.error(`Error updating document ${tableName}/${id}:`, error);
      console.error("Update params:", JSON.stringify(params, null, 2));
      throw error; // Re-throw after logging
  }
}

// Generic query documents function - Combined features
export async function queryDocuments<T>(
  tableName: string,
  whereConditions: [string, DynamoDB.DocumentClient.ComparisonOperator, any][], // Use ComparisonOperator type
  indexName?: string,
  orderByField?: string,
  sortAscending: boolean = true, // Default to ascending
  limitCount?: number,
  startKey?: DynamoDB.DocumentClient.Key // For pagination
): Promise<{ items: T[], lastEvaluatedKey?: DynamoDB.DocumentClient.Key }> {
  ensureServerSide();
  if (!docClient) throw new Error("DynamoDB client not initialized");

  // Basic validation for whereConditions
  if (!Array.isArray(whereConditions) || whereConditions.length === 0) {
      throw new Error("queryDocuments requires at least one condition in whereConditions.");
  }

  const filterExpressions: string[] = [];
  const keyConditionExpressions: string[] = [];
  const expressionAttributeValues: Record<string, any> = {};
  const expressionAttributeNames: Record<string, string> = {};
  let conditionCounter = 0;

  whereConditions.forEach(([field, operator, value]) => {
    const attributeNameKey = `#field${conditionCounter}`;
    const attributeValueKey = `:value${conditionCounter}`;
    expressionAttributeNames[attributeNameKey] = field;
    expressionAttributeValues[attributeValueKey] = value;

    const expression = `${attributeNameKey} ${operator} ${attributeValueKey}`;

    // Determine if it's a Key Condition (requires index) or Filter Condition
    // Simple heuristic: if an index is provided, assume the first condition is the key condition
    if (indexName && keyConditionExpressions.length === 0) {
        keyConditionExpressions.push(expression);
    } else if (!indexName && keyConditionExpressions.length === 0 && (operator === '=' || operator === '==')) {
        // If no index, assume first equality condition is the key condition (for Query on base table PK)
         keyConditionExpressions.push(expression.replace('==', '=')); // Query uses '='
    }
     else {
        filterExpressions.push(expression.replace('==', '=')); // FilterExpression uses '='
    }
    conditionCounter++;
  });


  const params: DynamoDB.DocumentClient.QueryInput = {
    TableName: tableName,
    ExpressionAttributeValues: expressionAttributeValues,
    ExpressionAttributeNames: expressionAttributeNames,
  };

  if (keyConditionExpressions.length > 0) {
      params.KeyConditionExpression = keyConditionExpressions.join(' AND ');
  } else {
      // This should ideally not happen with proper usage, but handle defensively
      console.warn("Querying without a KeyConditionExpression. This might lead to a Scan operation if no index is used correctly.");
      // If you intend to Scan, use a different function or structure.
      // For now, we'll let it proceed, but it might fail or be inefficient.
  }


  if (filterExpressions.length > 0) {
    params.FilterExpression = filterExpressions.join(' AND ');
  }

  if (indexName) {
    params.IndexName = indexName;
  }

  // Handle sorting
  if (orderByField) {
     // DynamoDB Query sorts by the Sort Key defined in the index/table.
     // ScanIndexForward controls the direction.
     params.ScanIndexForward = sortAscending;
  }

  if (limitCount) {
    params.Limit = limitCount;
  }

  if (startKey) {
      params.ExclusiveStartKey = startKey;
  }

  try {
    const result = await docClient.query(params).promise();
    return {
        items: (result.Items || []) as T[],
        lastEvaluatedKey: result.LastEvaluatedKey
    };
  } catch (error) {
    console.error('DynamoDB query error:', error);
    console.error('Query params:', JSON.stringify(params, null, 2));
    throw error;
  }
}

// Generic delete document function (Optional - Add if needed)
// export async function deleteDocument(tableName: string, id: string): Promise<void> {
//   ensureServerSide();
//   if (!docClient) throw new Error("DynamoDB client not initialized");
//   const params = {
//     TableName: tableName,
//     Key: { id }
//   };
//   await docClient.delete(params).promise();
// }