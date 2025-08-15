// src/components/auth/auth-error-display.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Trash2, ExternalLink, Info } from 'lucide-react';
import { CategorizedAuthError, RecoveryAction } from '@/lib/auth/error-handler';
import { cn } from '@/lib/utils';

interface AuthErrorDisplayProps {
    error: CategorizedAuthError;
    onRecoveryAction: (action: RecoveryAction) => Promise<void>;
    onDismiss?: () => void;
    isRecovering?: boolean;
}

/**
 * Component to display authentication errors with recovery actions
 */
export function AuthErrorDisplay({
    error,
    onRecoveryAction,
    onDismiss,
    isRecovering = false
}: AuthErrorDisplayProps) {
    const [executingAction, setExecutingAction] = useState<string | null>(null);

    const handleRecoveryAction = async (action: RecoveryAction) => {
        setExecutingAction(action.label);
        try {
            await onRecoveryAction(action);
        } catch (recoveryError) {
            console.error('Recovery action failed:', recoveryError);
        } finally {
            setExecutingAction(null);
        }
    };

    const getActionIcon = (actionType: RecoveryAction['type']) => {
        switch (actionType) {
            case 'refresh_session':
                return <RefreshCw className="h-4 w-4" />;
            case 'clear_data':
                return <Trash2 className="h-4 w-4" />;
            case 'redirect':
                return <ExternalLink className="h-4 w-4" />;
            case 'retry':
                return <RefreshCw className="h-4 w-4" />;
            default:
                return <Info className="h-4 w-4" />;
        }
    };

    const getAlertStyles = () => {
        switch (error.type) {
            case 'session_expired':
            case 'invalid_token':
                return 'border-amber-200 bg-amber-50 text-amber-800';
            case 'invalid_credentials':
            case 'account_not_found':
                return 'border-red-200 bg-red-50 text-red-800';
            case 'network_error':
            case 'rate_limited':
                return 'border-blue-200 bg-blue-50 text-blue-800';
            default:
                return 'border-red-200 bg-red-50 text-red-800';
        }
    };

    return (
        <Card className="w-full max-w-md mx-auto">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Authentication Error
                </CardTitle>
                <CardDescription>
                    {error.userMessage}
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                <div className={cn('rounded-lg border p-4', getAlertStyles())}>
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                        <div className="space-y-1">
                            <h4 className="font-medium">What happened?</h4>
                            <p className="text-sm opacity-90">
                                {error.userMessage}
                            </p>
                        </div>
                    </div>
                </div>

                {error.recoveryActions.length > 0 && (
                    <div className="space-y-3">
                        <h4 className="text-sm font-medium">Suggested actions:</h4>
                        <div className="space-y-2">
                            {error.recoveryActions.map((action, index) => (
                                <div key={index} className="flex flex-col space-y-1">
                                    <Button
                                        variant={action.type === 'clear_data' ? 'destructive' : 'outline'}
                                        size="sm"
                                        onClick={() => handleRecoveryAction(action)}
                                        disabled={isRecovering || executingAction !== null}
                                        className="justify-start"
                                    >
                                        {executingAction === action.label ? (
                                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                            <>
                                                {getActionIcon(action.type)}
                                                <span className="ml-2">{action.label}</span>
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
                            disabled={isRecovering}
                        >
                            Dismiss
                        </Button>
                    </div>
                )}

                {error.isRetryable && (
                    <div className="text-xs text-muted-foreground">
                        <Info className="h-3 w-3 inline mr-1" />
                        This error can be retried. Try the suggested actions above.
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

/**
 * Simplified error display for inline use
 */
export function InlineAuthError({
    error,
    onRecoveryAction,
    isRecovering = false
}: Omit<AuthErrorDisplayProps, 'onDismiss'>) {
    const [executingAction, setExecutingAction] = useState<string | null>(null);

    const handleRecoveryAction = async (action: RecoveryAction) => {
        setExecutingAction(action.label);
        try {
            await onRecoveryAction(action);
        } catch (recoveryError) {
            console.error('Recovery action failed:', recoveryError);
        } finally {
            setExecutingAction(null);
        }
    };

    return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 mb-4">
            <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="space-y-2 flex-1">
                    <h4 className="font-medium text-red-800">Error</h4>
                    <p className="text-sm text-red-700">{error.userMessage}</p>
                    {error.recoveryActions.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                            {error.recoveryActions.slice(0, 2).map((action, index) => (
                                <Button
                                    key={index}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleRecoveryAction(action)}
                                    disabled={isRecovering || executingAction !== null}
                                    className="bg-white hover:bg-red-100 border-red-300 text-red-700"
                                >
                                    {executingAction === action.label ? (
                                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                                    ) : null}
                                    {action.label}
                                </Button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}