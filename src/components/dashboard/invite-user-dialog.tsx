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
import { Loader2, Mail, UserPlus, AlertTriangle } from 'lucide-react';
import { useInvitationOperation } from '@/hooks/useInvitationOperation';
import { InvitationErrorHandler } from '@/lib/invitation-error-handler';

interface InviteUserDialogProps {
  onInviteSent?: () => void; // Callback to refresh invitation list
}

export function InviteUserDialog({ onInviteSent }: InviteUserDialogProps = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('member');
  const [isLoading, setIsLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isDuplicateCheck, setIsDuplicateCheck] = useState(false);

  const { company, currentUserProfile } = useCompany();
  const { showSuccess, showError } = useNotification();

  // Check if current user is admin
  const isAdmin = currentUserProfile?.role === 'admin';

  // Use invitation operation hook for better error handling
  const invitationOperation = useInvitationOperation({
    onSuccess: (result) => {
      showSuccess({ 
        description: `Invitation sent to ${email}! They will receive an email with instructions to join.` 
      });

      // Reset form and close dialog
      setEmail('');
      setRole('member');
      setValidationError(null);
      setIsOpen(false);

      // Call callback to refresh invitation list
      if (onInviteSent) {
        onInviteSent();
      }
    },
    onError: (invitationError) => {
      // Enhanced error handling with specific messages
      const errorMessage = InvitationErrorHandler.getOperationErrorMessage('create', invitationError);
      showError({ description: errorMessage });
    }
  });

  // Enhanced email validation
  const validateEmail = (email: string): string | null => {
    if (!email) {
      return 'Email address is required';
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return 'Please enter a valid email address';
    }

    // Check for common email format issues
    if (email.includes('..') || email.startsWith('.') || email.endsWith('.')) {
      return 'Email address format is invalid';
    }

    // Check for reasonable length
    if (email.length > 254) {
      return 'Email address is too long';
    }
    
    return null;
  };

  // Check for duplicate invitations
  const checkDuplicateInvitation = async (email: string): Promise<string | null> => {
    if (!company) return null;

    try {
      setIsDuplicateCheck(true);
      const response = await fetch(`/api/invitations/list?status=pending`);
      
      if (response.ok) {
        const data = await response.json();
        const existingInvitation = data.invitations.find(
          (inv: any) => inv.email.toLowerCase() === email.toLowerCase()
        );
        
        if (existingInvitation) {
          return 'An invitation has already been sent to this email address';
        }
      }
    } catch (error) {
      console.error('Error checking duplicate invitation:', error);
      // Don't block the invitation if the check fails
    } finally {
      setIsDuplicateCheck(false);
    }

    return null;
  };

  // Handle email input change with validation
  const handleEmailChange = async (value: string) => {
    setEmail(value);
    setValidationError(null);
    
    if (value) {
      const error = validateEmail(value);
      if (error) {
        setValidationError(error);
      } else {
        // Check for duplicates only if email format is valid
        const duplicateError = await checkDuplicateInvitation(value);
        setValidationError(duplicateError);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Enhanced validation
    const emailError = validateEmail(email);
    if (emailError) {
      setValidationError(emailError);
      showError({ description: emailError });
      return;
    }

    // Check for duplicate invitations one more time before submitting
    const duplicateError = await checkDuplicateInvitation(email);
    if (duplicateError) {
      setValidationError(duplicateError);
      showError({ description: duplicateError });
      return;
    }
    
    if (!company) {
      showError({ description: 'Company context is not available' });
      return;
    }

    if (!isAdmin) {
      showError({ description: 'Only administrators can send invitations' });
      return;
    }

    try {
      setIsLoading(true);

      // Create the invitation operation
      const createInvitationOperation = async () => {
        const payload = {
          email,
          role,
          companyId: company.id,
        };
        console.log('[InviteUserDialog] Sending invitation request with payload:', payload);

        const response = await fetch('/api/invitations/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to send invitation');
        }

        return response.json();
      };

      // Execute with enhanced error handling
      await invitationOperation.executeOperation(
        createInvitationOperation,
        'create',
        { email }
      );
    } catch (error) {
      // Error is handled by the invitation operation hook
      console.error('Error in invitation creation:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Don't render if user is not admin
  if (!isAdmin) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          Invite User
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Invite a Team Member
          </DialogTitle>
          <DialogDescription>
            Send an invitation to add a new user to your virtual office workspace. 
            They will receive an email with instructions to join.
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
              onChange={(e) => handleEmailChange(e.target.value)}
              placeholder="Enter email address"
              disabled={isLoading || isDuplicateCheck}
              required
              className={validationError ? 'border-destructive' : ''}
            />
            {isDuplicateCheck && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Checking for existing invitations...
              </div>
            )}
            {validationError && (
              <div className="flex items-center gap-1 text-sm text-destructive">
                <AlertTriangle className="h-3 w-3" />
                {validationError}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              The user will receive an invitation link that they can use to join your company
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
            <Button type="submit" disabled={isLoading || !!validationError || isDuplicateCheck}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Sending Invite...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Invite
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
