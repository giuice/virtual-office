// src/pages/api/companies/cleanup.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { DynamoDB } from 'aws-sdk';

// Initialize DynamoDB client
const dynamoClient = new DynamoDB.DocumentClient();

/**
 * This endpoint cleans up duplicate companies for a user, 
 * ensuring they are only associated with one company.
 * It keeps the most recent company and updates the user record.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'Missing userId' });
    }

    // 1. Get the user
    const userResponse = await dynamoClient.get({
      TableName: 'virtual-office-users',
      Key: { id: userId }
    }).promise();

    const user = userResponse.Item;
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 2. Find all companies where the user is an admin
    const companiesResponse = await dynamoClient.scan({
      TableName: 'virtual-office-companies',
      FilterExpression: 'contains(adminIds, :userId)',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    }).promise();

    if (!companiesResponse.Items || companiesResponse.Items.length <= 1) {
      return res.status(200).json({
        message: 'No duplicate companies found',
        companyCount: companiesResponse.Items?.length || 0
      });
    }

    // 3. Sort companies by creation date (newest first)
    const sortedCompanies = companiesResponse.Items.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // 4. Keep the newest company, delete the rest
    const newestCompany = sortedCompanies[0];
    const companiesToDelete = sortedCompanies.slice(1);

    // 5. Update the user to ensure they're associated with the newest company
    await dynamoClient.update({
      TableName: 'virtual-office-users',
      Key: { id: userId },
      UpdateExpression: 'SET companyId = :companyId',
      ExpressionAttributeValues: {
        ':companyId': newestCompany.id
      }
    }).promise();

    // 6. Delete the old companies
    const deletePromises = companiesToDelete.map(company => {
      return dynamoClient.delete({
        TableName: 'virtual-office-companies',
        Key: { id: company.id }
      }).promise();
    });

    await Promise.all(deletePromises);

    return res.status(200).json({
      message: 'Companies cleaned up successfully',
      keptCompanyId: newestCompany.id,
      deletedCompanyIds: companiesToDelete.map(c => c.id),
      totalRemoved: companiesToDelete.length
    });
  } catch (error) {
    console.error('Error cleaning up companies:', error);
    return res.status(500).json({
      message: 'Failed to clean up companies',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}