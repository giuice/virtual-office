'use client';

import { useState, useRef, useEffect } from 'react';
import { User } from '@/types/database';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { 
  Camera, 
  Upload, 
  X,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getUserInitials } from '@/lib/avatar-utils';
import { logAvatarDiagnostics } from '@/lib/avatar-debug';

interface ProfileAvatarProps {
  user: User | UserWithPhoto;
  onAvatarChange?: (file: File) => Promise<void>;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  uploading?: boolean;
}

// Extend the User type to include photoURL from Firebase Auth
interface UserWithPhoto extends User {
  photoURL?: string;
}

export function ProfileAvatar({ 
  user, 
  onAvatarChange, 
  size = 'lg',
  className,
  uploading = false
}: ProfileAvatarProps) {
  const [hovered, setHovered] = useState(false);
  const [isUploading, setIsUploading] = useState(uploading);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get appropriate size classes
  const sizeClasses = {
    sm: 'h-12 w-12',
    md: 'h-20 w-20',
    lg: 'h-24 w-24',
    xl: 'h-32 w-32',
  };

  // Calculate button size based on avatar size
  const buttonSize = {
    sm: 'h-6 w-6 text-xs',
    md: 'h-8 w-8 text-sm',
    lg: 'h-10 w-10 text-base',
    xl: 'h-12 w-12 text-lg',
  };
  // Determine avatar source - previewUrl takes precedence during upload
  // otherwise use the central getAvatarUrl utility for consistent resolution
  const { getAvatarUrl } = require('@/lib/avatar-utils'); // Import here to avoid circular dependencies
  const avatarSrc = previewUrl || getAvatarUrl(user);
  const [cacheKey, setCacheKey] = useState<string>(Date.now().toString());
  const [avatarError, setAvatarError] = useState<boolean>(false);
  
  // Log detailed diagnostics about the avatar URL
  useEffect(() => {
    if (avatarSrc && process.env.NODE_ENV === 'development') {
      // Only diagnose Supabase storage URLs (likely to have issues)
      if (avatarSrc.includes('supabase.co/storage')) {
        logAvatarDiagnostics(avatarSrc, String(user.id), 'ProfileAvatar');
      }
    }
  }, [avatarSrc, user.id]);
  
  // Use cache busting for potentially problematic URLs
  const getImageUrl = () => {
    if (!avatarSrc) return '';
    
    // Add cache-busting for Supabase storage URLs in development
    if (process.env.NODE_ENV === 'development' && 
        avatarSrc.includes('supabase.co/storage') && 
        !avatarSrc.includes('?')) {
      return `${avatarSrc}?t=${cacheKey}`;
    }
    
    return avatarSrc;
  };
  
  // Get initials for fallback
  const initials = getUserInitials(user.displayName || 'User');

  // Handle file input change
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Create preview URL
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    if (onAvatarChange) {
      setIsUploading(true);
      try {
        await onAvatarChange(file);
      } catch (error) {
        console.error('Error uploading avatar:', error);
        // Reset preview on error
        setPreviewUrl(null);
      } finally {
        setIsUploading(false);
      }
    }

    // Clean up file input
    e.target.value = '';
  };

  // Trigger file input click
  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  // Remove the avatar
  const removeAvatar = async () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    
    if (onAvatarChange) {
      // Pass null or empty file to indicate removal
      // This will depend on how your backend handles avatar removal
      setIsUploading(true);
      try {
        // Implementation depends on how your backend handles avatar removal
        // This is just a placeholder
        // await onAvatarChange(null);
      } catch (error) {
        console.error('Error removing avatar:', error);
      } finally {
        setIsUploading(false);
      }
    }
  };

  return (
    <div className="relative">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
        aria-label="Upload profile picture"
      />
      
      {/* Avatar with hover state for upload button */}
      <div 
        className="relative"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <Avatar 
          className={cn(
            sizeClasses[size], 
            "border-2 border-background",
            className
          )}
        >
          {avatarSrc && (
            <AvatarImage 
              src={getImageUrl()} 
              alt={user.displayName || 'User'} 
              className={isUploading ? 'opacity-50' : ''}
              onError={(e) => {
                console.warn(`[ProfileAvatar] Failed to load avatar for ${user.displayName || 'User'}`);
                console.warn(`[ProfileAvatar] URL: ${avatarSrc}`);
                setAvatarError(true);
                
                // If in development mode and it's a Supabase URL, try cache busting
                if (process.env.NODE_ENV === 'development' && 
                    avatarSrc.includes('supabase.co/storage') && 
                    !avatarSrc.includes('?')) {
                  console.log(`[ProfileAvatar] Attempting cache-busting`);
                  setCacheKey(Date.now().toString());
                }
              }}
            />
          )}
          <AvatarFallback className="bg-primary/10 text-primary">
            {isUploading ? (
              <Loader2 className="animate-spin" />
            ) : (
              initials
            )}
          </AvatarFallback>
          
          {/* Show error indicator for broken Supabase storage URLs in dev mode */}
          {process.env.NODE_ENV === 'development' && 
           avatarError && 
           avatarSrc?.includes('supabase.co/storage') && (
            <div className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1" 
                title="Avatar URL error">
              <AlertCircle className="h-3 w-3" />
            </div>
          )}
        </Avatar>
        
        {/* Status indicator */}
        {user.status && (
          <div 
            className={cn(
              "absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-background",
              user.status === 'online' && "bg-emerald-500",
              user.status === 'away' && "bg-amber-500",
              user.status === 'busy' && "bg-rose-500",
              user.status === 'offline' && "bg-gray-400"
            )}
          />
        )}
        
        {/* Upload buttons (shown on hover) */}
        {onAvatarChange && hovered && !isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-full">
            <div className="flex gap-2">
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className={buttonSize[size]}
                onClick={triggerFileUpload}
                title="Upload new avatar"
              >
                <Camera className="h-4 w-4" />
                <span className="sr-only">Upload new avatar</span>
              </Button>
              
              {avatarSrc && (
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className={buttonSize[size]}
                  onClick={removeAvatar}
                  title="Remove avatar"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Remove avatar</span>
                </Button>
              )}
            </div>
          </div>
        )}
        
        {/* Loading spinner */}
        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-full">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
      </div>
      
      {/* Optional label for the avatar */}
      {onAvatarChange && (
        <Label 
          htmlFor="avatar-upload" 
          className="mt-2 block text-center text-xs text-muted-foreground cursor-pointer"
          onClick={triggerFileUpload}
        >
          Change avatar
        </Label>
      )}
    </div>
  );
}
