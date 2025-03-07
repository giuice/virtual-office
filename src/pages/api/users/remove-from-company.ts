// src/pages/api/users/remove-from-company.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { DynamoDB } from 'aws-sdk';
import { configDynamoDB } from '@/lib/aws-config';

const dynamoClient = configDynamoDB();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { userId, companyId } = req.body;

    if (!userId || !companyId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // 1. Update the user to remove company association
    await dynamoClient.update({
      TableName: 'virtual-office-users',
      Key: { id: userId },
      UpdateExpression: 'REMOVE companyId',
      ConditionExpression: 'id = :userId AND companyId = :companyId',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':companyId': companyId,
      },
    }).promise();

    // 2. Update rooms to remove user from any occupied rooms
    // First, query for rooms that have this user as an occupant
    const roomsResponse = await dynamoClient.query({
      TableName: 'virtual-office-rooms',
      IndexName: 'CompanyIndex',
      KeyConditionExpression: 'companyId = :companyId',
      FilterExpression: 'contains(occupants, :userId)',
      ExpressionAttributeValues: {
        ':companyId': companyId,
        ':userId': userId,
      },
    }).promise();

    // Then update each room to remove the user
    if (roomsResponse.Items && roomsResponse.Items.length > 0) {
      const updatePromises = roomsResponse.Items.map(room => {
        const updatedOccupants = (room.occupants as string[]).filter(id => id !== userId);
        return dynamoClient.update({
          TableName: 'virtual-office-rooms',
          Key: { id: room.id },
          UpdateExpression: 'SET occupants = :updatedOccupants',
          ExpressionAttributeValues: {
            ':updatedOccupants': updatedOccupants,
          },
        }).promise();
      });

      await Promise.all(updatePromises);
    }

    return res.status(200).json({ message: 'User removed from company successfully' });
  } catch (error) {
    console.error('Error removing user from company:', error);
    return res.status(500).json({ 
      message: 'Failed to remove user from company',
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}