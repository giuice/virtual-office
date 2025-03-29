'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useCompany } from '@/contexts/CompanyContext';
import { UserRole } from '@/types/database';
import { useNotification } from '@/hooks/useNotification';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export function InviteUserDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  // Removed displayName state
  const [role, setRole] = useState<UserRole>('member');
  const [isLoading, setIsLoading] = useState(false);

  // Removed createUserProfile from context usage
  const { company } = useCompany();
  const { showSuccess, showError } = useNotification();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate only email
    if (!email) {
      showError({ description: 'Please provide an email address' });
      return;
    }
    if (!company) {
      showError({ description: 'Company context is not available' });
      return;
    }

    try {
      setIsLoading(true);

      const payload = {
        email,
        role,
        companyId: company.id,
      };
      console.log('[InviteUserDialog] Sending invitation request with payload:', payload); // Added log

      // Call the new API endpoint
      const response = await fetch('/api/invitations/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload), // Use payload variable
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send invitation');
      }

      showSuccess({ description: `Invitation sent to ${email}!` });

      // Reset form and close dialog
      setEmail('');
      setRole('member');
      setIsOpen(false);
    } catch (error) {
      showError({
        description: error instanceof Error ? error.message : 'Failed to send invitation'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>Invite User</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Invite a Team Member</DialogTitle>
          <DialogDescription>
            Add a new user to your virtual office workspace
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email address"
              disabled={isLoading}
              required
            />
            <p className="text-xs text-muted-foreground">
              The user will receive an invitation email at this address (Email sending not yet implemented)
            </p>
          </div>

          {/* Removed Display Name input field */}

          <div className="space-y-2">
            <label htmlFor="role" className="text-sm font-medium">
              Role
            </label>
            <div className="flex space-x-4 mb-2">
              <div
                className={`flex flex-col items-center p-4 border rounded-md cursor-pointer ${
                  role === 'member' ? 'border-primary bg-primary/5' : 'border-border'
                }`}
                onClick={() => setRole('member')}
                style={{ width: '48%' }}
              >
                <Badge variant="outline" className="mb-2">Member</Badge>
                <p className="text-sm text-center font-medium">Regular Member</p>
                <p className="text-xs text-center text-muted-foreground mt-2">
                  Can use the office but cannot manage users or settings
                </p>
              </div>

              <div
                className={`flex flex-col items-center p-4 border rounded-md cursor-pointer ${
                  role === 'admin' ? 'border-primary bg-primary/5' : 'border-border'
                }`}
                onClick={() => setRole('admin')}
                style={{ width: '48%' }}
              >
                <Badge variant="default" className="mb-2">Admin</Badge>
                <p className="text-sm text-center font-medium">Administrator</p>
                <p className="text-xs text-center text-muted-foreground mt-2">
                  Can manage company settings, users, and all features
                </p>
              </div>
            </div>

            <input
              type="hidden"
              id="role"
              value={role}
            />
          </div>

          <Separator className="my-4" />

          <div className="flex justify-end space-x-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Sending Invite...' : 'Send Invite'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
