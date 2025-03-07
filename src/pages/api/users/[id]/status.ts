// src/pages/api/users/[id]/status.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { updateUserStatus } from '@/lib/dynamo';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow PUT requests
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  const { status, statusMessage } = req.body;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  if (!status || !['online', 'offline', 'away', 'busy'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  try {
    await updateUserStatus(id, status, statusMessage);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error updating user status:', error);
    return res.status(500).json({ 
      error: 'Failed to update user status',
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
