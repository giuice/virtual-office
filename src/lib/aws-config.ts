// src/lib/aws-config.ts
// Configuration for AWS services
import AWS from 'aws-sdk';

// Determine if we're running on the client or server
const isClient = typeof window !== 'undefined';
const isServer = !isClient;

// Only configure AWS SDK on the server side
if (isServer) {
  // Define AWS credentials - only on server side
  const region = process.env.AWS_REGION || 'us-east-2';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  // Configure AWS SDK
  AWS.config.update({
    region,
    accessKeyId,
    secretAccessKey
  });
}

// Export configuration for use in other modules
const AWS_CONFIG = {
  region: isServer ? process.env.AWS_REGION : null,
  // Don't expose credentials in client-side code
  accessKeyId: null, 
  secretAccessKey: null,
  isClient,
  isServer
};

export default AWS_CONFIG;
