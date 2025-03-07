// src/pages/api/setup-dynamo-tables.ts
import { NextApiRequest, NextApiResponse } from 'next';
import AWS from 'aws-sdk';

// Table schemas
const TABLES = [
  {
    name: 'virtual-office-companies',
    keySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
    attributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
    provisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
  },
  {
    name: 'virtual-office-users',
    keySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
    attributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'companyId', AttributeType: 'S' }
    ],
    provisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    globalSecondaryIndexes: [
      {
        IndexName: 'CompanyIndex',
        KeySchema: [{ AttributeName: 'companyId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      }
    ]
  },
  {
    name: 'virtual-office-rooms',
    keySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
    attributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'companyId', AttributeType: 'S' }
    ],
    provisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    globalSecondaryIndexes: [
      {
        IndexName: 'CompanyIndex',
        KeySchema: [{ AttributeName: 'companyId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      }
    ]
  },
  {
    name: 'virtual-office-messages',
    keySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
    attributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'roomId', AttributeType: 'S' }
    ],
    provisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    globalSecondaryIndexes: [
      {
        IndexName: 'RoomIndex',
        KeySchema: [{ AttributeName: 'roomId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      }
    ]
  },
  {
    name: 'virtual-office-announcements',
    keySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
    attributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'companyId', AttributeType: 'S' }
    ],
    provisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    globalSecondaryIndexes: [
      {
        IndexName: 'CompanyIndex',
        KeySchema: [{ AttributeName: 'companyId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      }
    ]
  },
  {
    name: 'virtual-office-meeting-notes',
    keySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
    attributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'roomId', AttributeType: 'S' }
    ],
    provisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    globalSecondaryIndexes: [
      {
        IndexName: 'RoomIndex',
        KeySchema: [{ AttributeName: 'roomId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      }
    ]
  }
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Configure AWS SDK
    AWS.config.update({
      region: process.env.AWS_REGION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    });
    
    // Create a DynamoDB client
    const dynamoDB = new AWS.DynamoDB();
    
    // Check for existing tables
    const { TableNames: existingTables } = await dynamoDB.listTables().promise();
    console.log('Existing tables:', existingTables);
    
    // Create tables that don't exist yet
    const results = [];
    
    for (const tableSchema of TABLES) {
      if (existingTables.includes(tableSchema.name)) {
        results.push({
          tableName: tableSchema.name,
          status: 'skipped',
          message: 'Table already exists'
        });
        continue;
      }
      
      try {
        const result = await dynamoDB.createTable({
          TableName: tableSchema.name,
          KeySchema: tableSchema.keySchema,
          AttributeDefinitions: tableSchema.attributeDefinitions,
          ProvisionedThroughput: tableSchema.provisionedThroughput,
          GlobalSecondaryIndexes: tableSchema.globalSecondaryIndexes
        }).promise();
        
        results.push({
          tableName: tableSchema.name,
          status: 'created',
          tableDescription: result.TableDescription
        });
      } catch (error) {
        results.push({
          tableName: tableSchema.name,
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    res.status(200).json({
      message: 'DynamoDB table setup process completed',
      results
    });
  } catch (error) {
    console.error('DynamoDB Setup Error:', error);
    res.status(500).json({
      message: 'Failed to setup DynamoDB tables',
      error: error instanceof Error ? error.message : String(error)
    });
  }
}