'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useNotification } from '@/hooks/useNotification';
import { useCompany } from '@/contexts/CompanyContext';
import { Invitation } from '@/types/database';
import { Loader2, Mail, Clock, AlertTriangle, Trash2, RefreshCw, Copy } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useInvitationOperation } from '@/hooks/useInvitationOperation';
import { InvitationErrorHandler } from '@/lib/invitation-error-handler';

interface InvitationWithDetails extends Invitation {
  isExpired: boolean;
  timeUntilExpiry: string;
  inviteUrl: string;
}

interface InvitationListProps {
  refreshTrigger?: number; // Optional prop to trigger refresh
}

export function InvitationList({ refreshTrigger }: InvitationListProps = {}) {
  const [invitations, setInvitations] = useState<InvitationWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRevoking, setIsRevoking] = useState<string | null>(null);
  const { company, currentUserProfile } = useCompany();
  const { showSuccess, showError } = useNotification();

  // Check if current user is admin
  const isAdmin = currentUserProfile?.role === 'admin';

  // Use invitation operation hook for revoke operations
  const revokeOperation = useInvitationOperation({
    onSuccess: (result) => {
      // Remove the revoked invitation from the list
      setInvitations(prev => prev.filter(inv => inv.token !== isRevoking));
    },
    onError: (invitationError) => {
      const errorMessage = InvitationErrorHandler.getOperationErrorMessage('revoke', invitationError);
      showError({ description: errorMessage });
    }
  });

  // Fetch invitations
  const fetchInvitations = async () => {
    if (!company || !isAdmin) return;

    try {
      setIsLoading(true);
      const response = await fetch('/api/invitations/list?status=pending');
      
      if (!response.ok) {
        throw new Error('Failed to fetch invitations');
      }

      const data = await response.json();
      
      // Transform invitations to include additional details
      const invitationsWithDetails: InvitationWithDetails[] = data.invitations.map((invitation: Invitation) => {
        const expiryDate = new Date(invitation.expiresAt * 1000); // Convert Unix timestamp to Date
        const now = new Date();
        const isExpired = expiryDate < now;
        const timeUntilExpiry = isExpired 
          ? 'Expired' 
          : `Expires ${formatDistanceToNow(expiryDate, { addSuffix: true })}`;
        
        const inviteUrl = `${window.location.origin}/accept-invite?token=${invitation.token}`;

        return {
          ...invitation,
          isExpired,
          timeUntilExpiry,
          inviteUrl
        };
      });

      setInvitations(invitationsWithDetails);
    } catch (error) {
      console.error('Error fetching invitations:', error);
      showError({
        description: error instanceof Error ? error.message : 'Failed to load invitations'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Revoke invitation
  const revokeInvitation = async (token: string, email: string) => {
    try {
      setIsRevoking(token);
      
      const revokeInvitationOperation = async () => {
        const response = await fetch(`/api/invitations/${token}`, {
          method: 'DELETE'
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to revoke invitation');
        }

        return response.json();
      };

      await revokeOperation.executeOperation(
        revokeInvitationOperation,
        'revoke',
        { token, email }
      );

      showSuccess({ description: `Invitation for ${email} has been revoked` });
    } catch (error) {
      // Error is handled by the operation hook
      console.error('Error in revoke operation:', error);
    } finally {
      setIsRevoking(null);
    }
  };

  // Copy invitation URL to clipboard
  const copyInviteUrl = async (url: string, email: string) => {
    try {
      await navigator.clipboard.writeText(url);
      showSuccess({ description: `Invitation link for ${email} copied to clipboard` });
    } catch (error) {
      showError({ description: 'Failed to copy invitation link' });
    }
  };

  // Load invitations on component mount and when refresh is triggered
  useEffect(() => {
    fetchInvitations();
  }, [company, isAdmin, refreshTrigger]);

  // Don't render if user is not admin
  if (!isAdmin) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Pending Invitations
            </CardTitle>
            <CardDescription>
              Manage invitations sent to new team members
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchInvitations}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span className="text-muted-foreground">Loading invitations...</span>
          </div>
        ) : invitations.length === 0 ? (
          <div className="text-center py-8">
            <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No pending invitations</h3>
            <p className="text-muted-foreground">
              All invitations have been accepted or expired. Use the "Invite User" button to send new invitations.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {invitations.map((invitation, index) => (
              <div key={invitation.token}>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex-1">
                        <p className="font-medium">{invitation.email}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge 
                            variant={invitation.role === 'admin' ? 'default' : 'outline'}
                            className="text-xs"
                          >
                            {invitation.role}
                          </Badge>
                          <Badge 
                            variant={
                              invitation.status === 'expired' || invitation.isExpired 
                                ? 'destructive' 
                                : invitation.status === 'accepted' 
                                  ? 'default'
                                  : 'secondary'
                            }
                            className="text-xs"
                          >
                            {invitation.status === 'expired' || invitation.isExpired ? 'expired' : invitation.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className={`flex items-center gap-1 ${invitation.isExpired ? 'text-destructive' : ''}`}>
                        <Clock className="h-3 w-3" />
                        {invitation.timeUntilExpiry}
                      </div>
                      <div className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        Created {formatDistanceToNow(new Date(invitation.createdAt), { addSuffix: true })}
                      </div>
                      {invitation.status === 'accepted' && (
                        <div className="flex items-center gap-1 text-green-600">
                          <span className="h-2 w-2 bg-green-600 rounded-full"></span>
                          Accepted
                        </div>
                      )}
                    </div>

                    {invitation.isExpired && (
                      <div className="flex items-center gap-1 mt-2 text-sm text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        This invitation has expired and cannot be used
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyInviteUrl(invitation.inviteUrl, invitation.email)}
                      disabled={invitation.isExpired}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy Link
                    </Button>
                    
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => revokeInvitation(invitation.token, invitation.email)}
                      disabled={isRevoking === invitation.token || invitation.status !== 'pending'}
                    >
                      {isRevoking === invitation.token ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Trash2 className="h-3 w-3 mr-1" />
                      )}
                      Revoke
                    </Button>
                  </div>
                </div>
                
                {index < invitations.length - 1 && <Separator className="my-2" />}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}