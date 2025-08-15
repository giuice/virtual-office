'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Mail, Shield, Clock } from 'lucide-react';
import { InvitationError, InvitationErrorAction } from '@/lib/invitation-error-handler';
import { cn } from '@/lib/utils';

interface InvitationErrorDisplayProps {
  error: InvitationError;
  onAction: (action: InvitationErrorAction) => Promise<void>;
  onDismiss?: () => void;
  isProcessing?: boolean;
  className?: string;
}

export function InvitationErrorDisplay({
  error,
  onAction,
  onDismiss,
  isProcessing = false,
  className
}: InvitationErrorDisplayProps) {
  const getErrorIcon = () => {
    switch (error.type) {
      case 'invitation_expired':
        return <Clock className="h-5 w-5 text-amber-500" />;
      case 'permission_denied':
        return <Shield className="h-5 w-5 text-red-500" />;
      case 'network_error':
        return <RefreshCw className="h-5 w-5 text-blue-500" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    }
  };

  const getErrorStyles = () => {
    switch (error.type) {
      case 'invitation_expired':
      case 'invitation_already_used':
        return 'border-amber-200 bg-amber-50';
      case 'permission_denied':
        return 'border-red-200 bg-red-50';
      case 'network_error':
        return 'border-blue-200 bg-blue-50';
      default:
        return 'border-red-200 bg-red-50';
    }
  };

  return (
    <Card className={cn('w-full max-w-md mx-auto', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {getErrorIcon()}
          Invitation Error
        </CardTitle>
        <CardDescription>
          {error.userMessage}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className={cn('rounded-lg border p-4', getErrorStyles())}>
          <div className="flex items-start gap-3">
            {getErrorIcon()}
            <div className="space-y-1">
              <h4 className="font-medium">What happened?</h4>
              <p className="text-sm opacity-90">
                {error.userMessage}
              </p>
            </div>
          </div>
        </div>
        {error.suggestedActions.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Suggested actions:</h4>
            <div className="space-y-2">
              {error.suggestedActions.map((action, index) => (
                <div key={index} className="flex flex-col space-y-1">
                  <Button
                    variant={action.type === 'contact_admin' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onAction(action)}
                    disabled={isProcessing}
                    className="justify-start"
                  >
                    {isProcessing ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <>
                        {action.type === 'retry' && <RefreshCw className="h-4 w-4 mr-2" />}
                        {action.type === 'contact_admin' && <Mail className="h-4 w-4 mr-2" />}
                        {action.type === 'redirect' && <Shield className="h-4 w-4 mr-2" />}
                        <span>{action.label}</span>
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground ml-6">
                    {action.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {onDismiss && (
          <div className="flex justify-end pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              disabled={isProcessing}
            >
              Dismiss
            </Button>
          </div>
        )}

        {error.isRetryable && (
          <div className="text-xs text-muted-foreground">
            <AlertTriangle className="h-3 w-3 inline mr-1" />
            This error can be retried. Try the suggested actions above.
          </div>
        )}
      </CardContent>
    </Card>
  );
}