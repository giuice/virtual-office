// src/pages/api/auth/signup.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { DynamoDB } from 'aws-sdk';
import * as crypto from 'crypto';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id, email, displayName, companyId, status } = req.body;

    // Validate required fields
    if (!id || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Configure AWS directly in the API route
    const dynamoDB = new DynamoDB.DocumentClient({
      region: process.env.AWS_REGION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    });

    // Create user data
    const userData = {
      id,
      email,
      displayName: displayName || email.split('@')[0],
      companyId: companyId || '',
      status: status || 'offline',
      lastActive: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    // DynamoDB parameters
    const params = {
      TableName: 'virtual-office-users',
      Item: userData
    };

    // Attempt to create the user in DynamoDB
    await dynamoDB.put(params).promise();

    // Return success response
    return res.status(200).json({ success: true, userId: id });
  } catch (error) {
    console.error('Error creating user:', error);
    
    // Check for specific DynamoDB errors
    if (error instanceof Error) {
      if (error.name === 'ResourceNotFoundException') {
        return res.status(500).json({
          error: 'Table not found',
          message: 'The DynamoDB table does not exist yet. Please create the required tables first.'
        });
      }
      
      if (error.name === 'ValidationException') {
        return res.status(400).json({
          error: 'Validation error',
          message: error.message
        });
      }
      
      if (error.name === 'AccessDeniedException' || error.name === 'UnrecognizedClientException') {
        return res.status(403).json({
          error: 'AWS access denied',
          message: 'The provided AWS credentials do not have sufficient permissions.'
        });
      }
    }
    
    // Generic error response
    return res.status(500).json({ 
      error: 'Failed to create user',
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
