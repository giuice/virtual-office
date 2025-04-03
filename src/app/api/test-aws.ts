// src/pages/api/test-aws.ts
import { NextApiRequest, NextApiResponse } from 'next';
import AWS from 'aws-sdk';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Log AWS configuration details (not credentials)
    console.log('AWS Configuration:');
    console.log('Region:', process.env.AWS_REGION);
    console.log('Access Key ID available:', !!process.env.AWS_ACCESS_KEY_ID);
    console.log('Secret Access Key available:', !!process.env.AWS_SECRET_ACCESS_KEY);

    // Configure AWS SDK directly within the API route
    AWS.config.update({
      region: process.env.AWS_REGION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    });
    
    // Create a DynamoDB client
    const dynamoDB = new AWS.DynamoDB.DocumentClient();
    
    // Check if the table exists first
    const allTables = await new AWS.DynamoDB().listTables().promise();
    console.log('Available tables:', allTables.TableNames);
    
    // Try a simple operation on a table that should exist
    const params = {
      TableName: 'virtual-office', // Using the existing table name
      Limit: 1
    };
    
    try {
      const result = await dynamoDB.scan(params).promise();
      console.log('Scan result:', result);
      
      // Return success response
      res.status(200).json({
        success: true,
        message: 'AWS credentials are working correctly',
        availableTables: allTables.TableNames,
        data: result
      });
    } catch (tableError) {
      console.error('Table operation error:', tableError);
      
      // Return partial success - AWS works but table may not exist
      res.status(207).json({
        success: true,
        message: 'AWS credentials are valid but table operation failed',
        error: tableError instanceof Error ? tableError.message : String(tableError),
        availableTables: allTables.TableNames
      });
    }
  } catch (error) {
    console.error('AWS Error:', error);
    
    // Return error response
    res.status(500).json({
      success: false,
      message: 'AWS credentials error',
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
