'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useCompany } from '@/contexts/CompanyContext';
import { UserRole } from '@/types/database';
import { useNotification } from '@/hooks/useNotification';

export function InviteUserDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('member');
  const [isLoading, setIsLoading] = useState(false);
  
  const { company, createUserProfile } = useCompany();
  const { showSuccess, showError } = useNotification();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !displayName) {
      showError({ description: 'Please provide both email and name' });
      return;
    }

    try {
      setIsLoading(true);
      
      await createUserProfile({
        email,
        displayName,
        role,
      });
      
      showSuccess({ description: `User ${displayName} has been invited!` });
      
      // Reset form and close dialog
      setEmail('');
      setDisplayName('');
      setRole('member');
      setIsOpen(false);
    } catch (error) {
      showError({ 
        description: error instanceof Error ? error.message : 'Failed to invite user' 
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Invite a Team Member</DialogTitle>
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
          </div>
          <div className="space-y-2">
            <label htmlFor="displayName" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter display name"
              disabled={isLoading}
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="role" className="text-sm font-medium">
              Role
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full p-2 border rounded-md bg-background"
              disabled={isLoading}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Inviting...' : 'Invite User'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}