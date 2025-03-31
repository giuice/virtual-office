// src/lib/dynamo/client.ts
import { DynamoDB } from 'aws-sdk';
import AWS_CONFIG from '../aws-config'; // Adjust path as needed

// Check if we're running on the server
const isServer = typeof window === 'undefined';

let dynamoDb: DynamoDB.DocumentClient | null = null;

// Initialize DynamoDB client for server-side only
if (isServer) {
  try {
    // TODO: Potentially use AWS_CONFIG if needed for region, credentials etc.
    // Example: dynamoDb = new DynamoDB.DocumentClient({ region: AWS_CONFIG.region });
    dynamoDb = new DynamoDB.DocumentClient();
    console.log("DynamoDB document client initialized successfully");
  } catch (error) {
    console.error("Error initializing DynamoDB document client:", error);
    dynamoDb = null;
  }
} else {
  console.warn("Attempted to initialize DynamoDB client in client environment");
}

export const docClient = dynamoDb;

// Ensure DynamoDB operations are only performed on the server
export function ensureServerSide() {
  if (!isServer || !docClient) {
    throw new Error('DynamoDB operations can only be performed on the server side and client must be initialized');
  }
}
