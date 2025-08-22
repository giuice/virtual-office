'use client';

import { useState, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar-system';
import { Button } from '@/components/ui/button';
import { EnhancedAvatarV2 } from '@/components/ui/enhanced-avatar-v2';
import { 
  Camera, 
  X,
  Loader2,
  AlertCircle,
  FileWarning,
  CheckCircle,
  Upload
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getUserInitials } from '@/lib/avatar-utils';
import { useImageUpload } from '@/hooks/useImageUpload';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';

interface UploadableAvatarProps {
  userId: string;
  displayName: string;
  currentAvatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  onAvatarChange?: (url: string) => void;
  status?: 'online' | 'away' | 'busy' | 'offline';
  enableHoverActions?: boolean;
}

export function UploadableAvatar({
  userId,
  displayName,
  currentAvatarUrl,
  size = 'md',
  className,
  onAvatarChange,
  status,
  enableHoverActions = true,
}: UploadableAvatarProps) {
  const [hovered, setHovered] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Size classes for the avatar and buttons
  const sizeClasses = {
    sm: 'h-12 w-12',
    md: 'h-16 w-16',
    lg: 'h-24 w-24',
    xl: 'h-32 w-32',
  };
  
  const buttonSizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
    xl: 'h-12 w-12',
  };
  
  // Initialize image upload hook
  const { 
    upload, 
    state, 
    progress, 
    preview, 
    error, 
    reset 
  } = useImageUpload({
    endpoint: '/api/users/avatar',
    validation: {
      maxSize: 2 * 1024 * 1024, // 2MB
      allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    },
    compression: {
      enabled: true,
      maxWidth: 400,
      maxHeight: 400,
      quality: 0.8,
    },
    uploadOptions: {
      formFieldName: 'avatar',
      additionalData: { userId },
    },
    onSuccess: (response) => {
      if (response.avatarUrl && onAvatarChange) {
        onAvatarChange(response.avatarUrl);
      }
    },
  });
  
  // Get active avatar URL (preview or current)
  const avatarUrl = preview || (currentAvatarUrl ? fixSupabaseStorageUrl(currentAvatarUrl) : null);
  
  // Get initials for fallback
  const initials = getUserInitials(displayName);
  
  // Trigger file input click
  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };
  
  // Handle file selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        await upload(file);
      } catch (err) {
        console.error('Avatar upload failed:', err);
      }
    }
    
    // Reset the input to allow selecting the same file again
    e.target.value = '';
  };
  
  // Handle avatar removal
  const handleRemoveAvatar = () => {
    setShowRemoveDialog(true);
  };
  
  // Confirm avatar removal
  const confirmRemoveAvatar = async () => {
    try {
      // Make API call to remove avatar
      const response = await fetch('/api/users/avatar/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      
      if (response.ok) {
        reset();
        if (onAvatarChange) {
          onAvatarChange('');
        }
      } else {
        throw new Error('Failed to remove avatar');
      }
    } catch (err) {
      console.error('Error removing avatar:', err);
    } finally {
      setShowRemoveDialog(false);
    }
  };
  
  // Get status indicator color
  const getStatusColor = () => {
    switch (status) {
      case 'online': return 'bg-emerald-500';
      case 'away': return 'bg-amber-500';
      case 'busy': return 'bg-rose-500';
      case 'offline': return 'bg-gray-400';
      default: return '';
    }
  };
  
  // Determine if avatar is in an active state (uploading, error, etc.)
  const isActive = state !== 'idle' && state !== 'success';
  
  // Get state icon
  const getStateIcon = () => {
    switch (state) {
      case 'validating':
        return <Loader2 className="h-5 w-5 animate-spin" />;
      case 'compressing':
        return <Loader2 className="h-5 w-5 animate-spin" />;
      case 'uploading':
        return <Upload className="h-5 w-5" />;
      case 'success':
        return <CheckCircle className="h-5 w-5 text-emerald-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-rose-500" />;
      default:
        return null;
    }
  };
  
  return (
    <>
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        aria-label="Upload avatar"
      />
      
      {/* Avatar with hover controls */}
      <div
        className="relative"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <EnhancedAvatarV2
          user={{ 
            id: userId, 
            displayName, 
            avatarUrl,
            status
          }}
          size={size}
          showStatus={!!status}
          isActive={isActive}
          className={cn(sizeClasses[size], 'border-2 border-background', className)}
        />
        
        
        
        {/* Upload controls (on hover) */}
        {hovered && !isActive && (enableHoverActions !== false) && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-full">
            <div className="flex gap-2">
              <TooltipProvider>
                <Tooltip>
                                                              {enableHoverActions !== false && (
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="secondary"
                                      className={buttonSizeClasses[size]}
                                      onClick={triggerFileSelect}
                                    >
                                      <Camera className="h-4 w-4" />
                                      <span className="sr-only">Upload avatar</span>
                                    </Button>
                                  </TooltipTrigger>
                                )}
                  <TooltipContent>Upload new avatar</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              {avatarUrl && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Button
                        size="icon"
                        variant="destructive"
                        className={buttonSizeClasses[size]}
                        onClick={handleRemoveAvatar}
                      >
                        <X className="h-4 w-4" />
                        <span className="sr-only">Remove avatar</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Remove avatar</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        )}
        
        {/* State indicator (when uploading, error, etc.) */}
        {isActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/50 rounded-full">
            {getStateIcon()}
            
            {/* Progress bar for upload */}
            {state === 'uploading' && (
              <div className="w-3/4 mt-2">
                <Progress value={progress} className="h-1" />
              </div>
            )}
            
            {/* Error display */}
            {state === 'error' && error && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <div className="text-rose-500">
                      <FileWarning className="h-5 w-5" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">{error.message}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}
      </div>
      
      {/* Remove confirmation dialog */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Avatar</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove your avatar? This will reset it to the default initials display.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmRemoveAvatar}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
function fixSupabaseStorageUrl(url: string): string {
  if (url.includes('supabase.co') && url.includes('/storage/v1/object/public/')) {
    return url;
  }
  return url;
}

