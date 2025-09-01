'use client';

import { useState, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
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

import { User } from '@/types/database';

// Use canonical User type for consistency
interface UploadableAvatarProps {
  user: Pick<User, 'id' | 'displayName' | 'avatarUrl' | 'status'>;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  onAvatarChange?: (file: File) => Promise<void>;
  uploading?: boolean;
  showUploadButton?: boolean;
}

export function UploadableAvatar({
  user,
  size = 'md',
  className,
  onAvatarChange,
  uploading = false,
  showUploadButton = false,
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
      additionalData: { userId: user.id },
    },
    onSuccess: (response) => {
      // The component now handles file uploads internally
      // If onAvatarChange is provided, it's for external handling
    },
  });
  
  // Get active avatar URL (preview or current)
  const avatarUrl = preview || user.avatarUrl;
  
  // Get initials for fallback
  const initials = getUserInitials(user.displayName);
  
  // Trigger file input click
  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };
  
  // Handle file selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        if (onAvatarChange) {
          await onAvatarChange(file);
        } else {
          // Fallback to internal upload if no callback provided
          await upload(file);
        }
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
        body: JSON.stringify({ userId: user.id }),
      });
      
      if (response.ok) {
        reset();
        // Note: onAvatarChange expects a File, not a string for removal
        // For removal, we just reset the internal state
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
    switch (user.status) {
      case 'online': return 'bg-emerald-500';
      case 'away': return 'bg-amber-500';
      case 'busy': return 'bg-rose-500';
      case 'offline': return 'bg-gray-400';
      default: return '';
    }
  };
  
  // Determine if avatar is in an active state (uploading, error, etc.)
  const isActive = state !== 'idle' && state !== 'success' || uploading;
  
  // Get state icon
  const getStateIcon = () => {
    // Show external uploading state first
    if (uploading) {
      return <Loader2 className="h-5 w-5 animate-spin" />;
    }
    
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
        <Avatar
          className={cn(
            sizeClasses[size],
            'border-2 border-background',
            className
          )}
        >
          {avatarUrl && (
            <AvatarImage
              src={avatarUrl}
              alt={user.displayName}
              className={isActive ? 'opacity-50' : ''}
            />
          )}
          <AvatarFallback className="bg-primary/10 text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        
        {/* Status indicator */}
        {user.status && (
          <span
            className={cn(
              'absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background',
              getStatusColor()
            )}
          />
        )}
        
        {/* Upload controls (on hover) */}
        {hovered && !isActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-full">
            <div className="flex gap-2">
              <TooltipProvider>
                <Tooltip>
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
                  <TooltipContent>Upload new avatar</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              {avatarUrl && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
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
                  <TooltipTrigger asChild>
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
