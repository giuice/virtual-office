// src/components/messaging/CallNotification.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Zap,
  X,
  Volume2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getUserInitials, getAvatarUrl } from '@/lib/avatar-utils';
import { useCalling } from '@/contexts/CallingContext';
import { UIUser } from '@/types/ui';

interface CallNotificationProps {
  callId: string;
  callerName: string;
  callerId: string;
  type: 'voice' | 'video' | 'teleport';
  spaceId?: string;
  spaceName?: string;
  onAccept?: () => void;
  onDecline?: () => void;
  className?: string;
}

/**
 * Call Notification Component
 * 
 * Displays incoming call notifications with accept/decline options
 * Includes countdown timer and auto-dismiss functionality
 */
export function CallNotification({
  callId,
  callerName,
  callerId,
  type,
  spaceId,
  spaceName,
  onAccept,
  onDecline,
  className,
}: CallNotificationProps) {
  const { acceptCall, declineCall } = useCalling();
  const [timeLeft, setTimeLeft] = useState(30); // 30 seconds for calls, 60 for teleport
  const [isVisible, setIsVisible] = useState(true);

  // Different timeout for different call types
  const initialTime = type === 'teleport' ? 60 : 30;

  useEffect(() => {
    setTimeLeft(initialTime);
    
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsVisible(false);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [initialTime]);

  const handleAccept = async () => {
    setIsVisible(false);
    await acceptCall(callId);
    onAccept?.();
  };

  const handleDecline = async () => {
    setIsVisible(false);
    await declineCall(callId);
    onDecline?.();
  };

  if (!isVisible) return null;

  // Get appropriate icon and colors for call type
  const getCallIcon = () => {
    switch (type) {
      case 'voice':
        return <Phone className="h-5 w-5" />;
      case 'video':
        return <Video className="h-5 w-5" />;
      case 'teleport':
        return <Zap className="h-5 w-5" />;
    }
  };

  const getCallTypeColor = () => {
    switch (type) {
      case 'voice':
        return 'bg-blue-500';
      case 'video':
        return 'bg-green-500';
      case 'teleport':
        return 'bg-purple-500';
    }
  };

  const getCallTypeText = () => {
    switch (type) {
      case 'voice':
        return 'Voice Call';
      case 'video':
        return 'Video Call';
      case 'teleport':
        return 'Space Invitation';
    }
  };

  // Mock user data - in real implementation, you'd fetch this
  const mockUser: UIUser = {
    id: callerId,
    displayName: callerName,
    avatarUrl: null, 
    status: 'active',
    statusMessage: ''
  };

  const avatarSrc = getAvatarUrl(mockUser);
  const initials = getUserInitials(callerName);

  return (
    <Card 
      className={cn(
        "fixed top-4 right-4 z-50 w-80 border-l-4 shadow-lg animate-in slide-in-from-right duration-300",
        getCallTypeColor(),
        className
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-center space-x-3 mb-3">
          <div className="relative">
            <Avatar className="h-12 w-12">
              <AvatarImage src={avatarSrc} alt={callerName} />
              <AvatarFallback className="text-sm">
                {initials}
              </AvatarFallback>
            </Avatar>
            
            {/* Pulsing call indicator */}
            <div className={cn(
              "absolute -top-1 -right-1 h-6 w-6 rounded-full flex items-center justify-center text-white animate-pulse",
              getCallTypeColor()
            )}>
              {getCallIcon()}
            </div>
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-medium text-sm truncate">
                {callerName}
              </p>
              <Badge variant="secondary" className="text-xs">
                {getCallTypeText()}
              </Badge>
            </div>
            
            {type === 'teleport' && spaceName && (
              <p className="text-xs text-muted-foreground">
                Inviting you to: {spaceName}
              </p>
            )}
            
            <div className="flex items-center gap-2 mt-1">
              <Volume2 className="h-3 w-3 text-muted-foreground animate-pulse" />
              <p className="text-xs text-muted-foreground">
                {timeLeft}s remaining
              </p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            onClick={handleAccept}
            size="sm"
            className={cn(
              "flex-1 text-white hover:opacity-90",
              getCallTypeColor()
            )}
          >
            {type === 'teleport' ? (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Join
              </>
            ) : (
              <>
                {type === 'video' ? (
                  <Video className="h-4 w-4 mr-2" />
                ) : (
                  <Phone className="h-4 w-4 mr-2" />
                )}
                Accept
              </>
            )}
          </Button>
          
          <Button
            onClick={handleDecline}
            size="sm"
            variant="destructive"
            className="flex-1"
          >
            {type === 'teleport' ? (
              <>
                <X className="h-4 w-4 mr-2" />
                Decline
              </>
            ) : (
              <>
                {type === 'video' ? (
                  <VideoOff className="h-4 w-4 mr-2" />
                ) : (
                  <PhoneOff className="h-4 w-4 mr-2" />
                )}
                Decline
              </>
            )}
          </Button>
        </div>

        {/* Progress bar showing time left */}
        <div className="mt-3">
          <div className="w-full bg-muted rounded-full h-1">
            <div
              className={cn(
                "h-1 rounded-full transition-all duration-1000 ease-linear",
                getCallTypeColor()
              )}
              style={{
                width: `${(timeLeft / initialTime) * 100}%`
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Call Notifications Container
 * 
 * Renders all incoming call notifications
 */
export function CallNotifications() {
  const { incomingCalls } = useCalling();

  const pendingCalls = incomingCalls.filter(call => call.status === 'pending');

  return (
    <div className="fixed top-0 right-0 z-50 p-4 space-y-2">
      {pendingCalls.map((call) => (
        <CallNotification
          key={call.id}
          callId={call.id}
          callerName={call.callerName}
          callerId={call.callerId}
          type={call.type}
          spaceId={call.spaceId}
          spaceName={call.spaceName}
        />
      ))}
    </div>
  );
}