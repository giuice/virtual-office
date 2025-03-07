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
              The user will receive an invitation email at this address
            </p>
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
            <p className="text-xs text-muted-foreground">
              This name will be visible to others in the virtual office
            </p>
          </div>
          
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
              {isLoading ? 'Inviting...' : 'Invite User'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}