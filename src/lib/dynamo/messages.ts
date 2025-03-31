// src/lib/dynamo/messages.ts
import { DynamoDB } from 'aws-sdk';
import * as crypto from 'crypto';
import { Message } from '@/types/database';
import { MessageStatus } from '@/types/messaging';
import { docClient, ensureServerSide } from './client';
import { TABLES, convertDates } from './utils';
import { addDocument, queryDocuments, getDocument, updateDocument } from './operations';

// NOTE: Temporarily including generic functions used by message functions.
// These might be moved to a generic operations file later.

// Generic addDocument removed - now in operations.ts
// Generic queryDocuments removed - now in operations.ts

// Generic getDocument removed - now in operations.ts


// Generic updateDocument removed - now in operations.ts
// --- Message specific functions ---

export async function createMessage(messageData: Omit<Message, 'id' | 'timestamp'>): Promise<string> {
  // Note: timestamp is handled by the generic addDocument now
  return addDocument<Message>(TABLES.MESSAGES, messageData);
}

export async function getMessagesByRoom(roomId: string): Promise<Message[]> {
    // Assuming a GSI named 'RoomIndex' with 'roomId' as PK and 'timestamp' as SK
    const result = await queryDocuments<Message>(
        TABLES.MESSAGES,
        [['roomId', '==', roomId]], // Use '==' for queryDocuments
        'RoomIndex', // Specify the index name
        'timestamp', // Specify sort key field
        true // Sort ascending (oldest first) - adjust if needed
        // Add limit/startKey parameters here if pagination is implemented
    );
    return result.items; // Return only the items array
}

// TODO: Add functions for reactions (addReactionToMessage, removeReactionFromMessage)
// TODO: Add function for updating message status (updateMessageStatusInDB)


export async function updateMessageStatusInDB(messageId: string, status: MessageStatus): Promise<void> {
  return updateDocument<Message>(TABLES.MESSAGES, messageId, { status });
}

// TODO: Add functions for reactions (addReactionToMessage, removeReactionFromMessage)

export async function addReactionToMessage(messageId: string, userId: string, emoji: string): Promise<void> {
  const message = await getDocument<Message>(TABLES.MESSAGES, messageId);
  if (!message) {
    console.error(`Message not found: ${messageId}`);
    return; // Or throw error
  }

  const currentReactions = message.reactions || {};
  const usersForEmoji = currentReactions[emoji] || [];

  if (!usersForEmoji.includes(userId)) {
    const updatedUsers = [...usersForEmoji, userId];
    const updatedReactions = { ...currentReactions, [emoji]: updatedUsers };
    // Use UpdateExpression for atomic operations on the map
    const params: DynamoDB.DocumentClient.UpdateItemInput = {
      TableName: TABLES.MESSAGES,
      Key: { id: messageId },
      UpdateExpression: 'SET #reactions.#emoji = :users',
      ExpressionAttributeNames: {
        '#reactions': 'reactions',
        '#emoji': emoji
      },
      ExpressionAttributeValues: {
        ':users': updatedUsers
      }
    };
    if (!docClient) throw new Error("DynamoDB client not initialized before update"); // TS null check

    await docClient.update(params).promise();
  }
}

export async function removeReactionFromMessage(messageId: string, userId: string, emoji: string): Promise<void> {
  const message = await getDocument<Message>(TABLES.MESSAGES, messageId);
  // Check if the reaction exists before attempting removal
  if (!message || !message.reactions || !message.reactions[emoji] || !message.reactions[emoji].includes(userId)) {
     console.warn(`Reaction ${emoji} by user ${userId} not found on message ${messageId} or message doesn't exist.`);
     return; // Reaction doesn't exist or message doesn't exist
  }

  const currentUsers = message.reactions[emoji];
  const updatedUsers = currentUsers.filter(id => id !== userId);

  let params: DynamoDB.DocumentClient.UpdateItemInput;

  if (updatedUsers.length > 0) {
    // Update the list for the emoji
    params = {
      TableName: TABLES.MESSAGES,
      Key: { id: messageId },
      UpdateExpression: 'SET #reactions.#emoji = :users',
      ExpressionAttributeNames: {
        '#reactions': 'reactions',
        '#emoji': emoji
      },
      ExpressionAttributeValues: {
        ':users': updatedUsers
      }
    };
  } else {
    // Remove the emoji key entirely if no users are left
    params = {
      TableName: TABLES.MESSAGES,
      Key: { id: messageId },
      UpdateExpression: 'REMOVE #reactions.#emoji',
      ExpressionAttributeNames: {
        '#reactions': 'reactions',
        '#emoji': emoji
      }
    };
  }

  await docClient!.update(params).promise();
  if (!docClient) throw new Error("DynamoDB client not initialized before update"); // TS null check

}

