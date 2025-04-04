// src/app/admin/invitations/page.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function InvitationsPage() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [companyId, setCompanyId] = useState('');
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Create invitation
  const handleCreateInvitation = async () => {
    if (!email || !role || !companyId) {
      toast.error('Please fill all fields');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/invitations/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role, companyId }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create invitation');
      }

      toast.success('Invitation created successfully');
      setInvitations([...invitations, data.invitation]);
      
      // Copy invitation link to clipboard
      const invitationLink = `${window.location.origin}/join?token=${data.invitation.token}`;
      navigator.clipboard.writeText(invitationLink);
      toast.info('Invitation link copied to clipboard');
      
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create invitation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-8">Invitation Management</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Create New Invitation</CardTitle>
            <CardDescription>Generate an invitation link for a new user</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Email</label>
              <Input 
                type="email" 
                placeholder="user@example.com" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Role</label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Company ID</label>
              <Input 
                placeholder="Enter company ID" 
                value={companyId} 
                onChange={(e) => setCompanyId(e.target.value)} 
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              onClick={handleCreateInvitation} 
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Invitation'}
            </Button>
          </CardFooter>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Recent Invitations</CardTitle>
            <CardDescription>View and manage invitations</CardDescription>
          </CardHeader>
          <CardContent>
            {invitations.length === 0 ? (
              <p className="text-muted-foreground">No invitations created yet</p>
            ) : (
              <div className="space-y-4">
                {invitations.map((invitation) => (
                  <div key={invitation.id} className="border rounded-md p-4">
                    <p><strong>Email:</strong> {invitation.email}</p>
                    <p><strong>Token:</strong> {invitation.token.substring(0, 8)}...</p>
                    <p><strong>Expires:</strong> {new Date(invitation.expiresAt * 1000).toLocaleString()}</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-2"
                      onClick={() => {
                        const invitationLink = `${window.location.origin}/join?token=${invitation.token}`;
                        navigator.clipboard.writeText(invitationLink);
                        toast.info('Invitation link copied to clipboard');
                      }}
                    >
                      Copy Link
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}