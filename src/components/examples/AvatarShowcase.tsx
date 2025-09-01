'use client';

import React from 'react';
import { EnhancedAvatarV2 } from '@/components/ui/enhanced-avatar-v2';
import { UploadableAvatar } from '@/components/profile/UploadableAvatar';
import { User } from '@/types/database';
import { UIUser } from '@/types/ui';

// Example users for demonstration - using Pick from User type for consistency
const exampleUsers: Pick<User, 'id' | 'displayName' | 'avatarUrl' | 'status'>[] = [
    {
        id: 'user-1',
        displayName: 'John Doe',
        avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
        status: 'online',
    },
    {
        id: 'user-2',
        displayName: 'Jane Smith',
        avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
        status: 'away',
    },
    {
        id: 'user-3',
        displayName: 'Bob Wilson',
        avatarUrl: 'https://invalid-url-to-test-fallback.com/avatar.jpg', // This will fail and show fallback
        status: 'busy',
    },
    {
        id: 'user-4',
        displayName: 'Alice Johnson',
        avatarUrl: undefined, // No avatar URL - will show initials
        status: 'offline',
    },
];

export function AvatarShowcase() {
    const [selectedUser, setSelectedUser] = React.useState<string | null>(null);

    const handleAvatarClick = (userId: string) => {
        setSelectedUser(selectedUser === userId ? null : userId);
    };

    return (
        <div className="p-8 space-y-8">
            <div>
                <h2 className="text-2xl font-bold mb-4">Enhanced Avatar Component Showcase</h2>
                <p className="text-muted-foreground mb-6">
                    Demonstrating the enhanced Avatar component with loading states, error handling,
                    retry logic, and fallback behavior.
                </p>
            </div>

            {/* Size Variants */}
            <div>
                <h3 className="text-lg font-semibold mb-4">Size Variants</h3>
                <div className="flex items-center gap-4">
                    <div className="text-center">
                        <EnhancedAvatarV2 user={exampleUsers[0]} size="sm" showStatus />
                        <p className="text-xs mt-2">Small</p>
                    </div>
                    <div className="text-center">
                        <EnhancedAvatarV2 user={exampleUsers[0]} size="md" showStatus />
                        <p className="text-xs mt-2">Medium</p>
                    </div>
                    <div className="text-center">
                        <EnhancedAvatarV2 user={exampleUsers[0]} size="lg" showStatus />
                        <p className="text-xs mt-2">Large</p>
                    </div>
                    <div className="text-center">
                        <EnhancedAvatarV2 user={exampleUsers[0]} size="xl" showStatus />
                        <p className="text-xs mt-2">Extra Large</p>
                    </div>
                </div>
            </div>

            {/* Status Indicators */}
            <div>
                <h3 className="text-lg font-semibold mb-4">Status Indicators</h3>
                <div className="flex items-center gap-6">
                    {exampleUsers.map((user) => (
                        <div key={user.id} className="text-center">
                            <EnhancedAvatarV2
                                user={user}
                                size="lg"
                                showStatus
                                showLoadingState
                                enableRetry
                                maxRetries={2}
                            />
                            <p className="text-sm mt-2">{user.displayName}</p>
                            <p className="text-xs text-muted-foreground capitalize">{(user as any).status}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Interactive Avatars */}
            <div>
                <h3 className="text-lg font-semibold mb-4">Interactive Avatars</h3>
                <p className="text-sm text-muted-foreground mb-4">Click on avatars to select them</p>
                <div className="flex items-center gap-4">
                    {exampleUsers.map((user) => (
                        <div key={user.id} className="text-center">
                            <EnhancedAvatarV2
                                user={user}
                                size="lg"
                                showStatus
                                onClick={() => handleAvatarClick(user.id)}
                                className={selectedUser === user.id ? 'ring-2 ring-primary ring-offset-2' : ''}
                                enableRetry
                                maxRetries={1}
                                retryDelay={500}
                            />
                            <p className="text-sm mt-2">{user.displayName}</p>
                            {selectedUser === user.id && (
                                <p className="text-xs text-primary">Selected</p>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Error Handling Demo */}
            <div>
                <h3 className="text-lg font-semibold mb-4">Error Handling & Fallback</h3>
                <p className="text-sm text-muted-foreground mb-4">
                    The third avatar has an invalid URL to demonstrate error handling and fallback to initials.
                    The fourth avatar has no URL and shows initials immediately.
                </p>
                <div className="flex items-center gap-4">
                    <div className="text-center">
                        <EnhancedAvatarV2
                            user={exampleUsers[2]}
                            size="lg"
                            showStatus
                            enableRetry
                            maxRetries={1}
                            retryDelay={1000}
                            showErrorIndicator
                            onError={(error) => console.log('Avatar error:', error)}
                            onRetry={(url, attempt) => console.log('Retrying avatar:', url, 'attempt:', attempt)}
                        />
                        <p className="text-sm mt-2">Invalid URL</p>
                        <p className="text-xs text-muted-foreground">Will retry then fallback</p>
                    </div>
                    <div className="text-center">
                        <EnhancedAvatarV2
                            user={exampleUsers[3]}
                            size="lg"
                            showStatus
                        />
                        <p className="text-sm mt-2">No Avatar URL</p>
                        <p className="text-xs text-muted-foreground">Shows initials</p>
                    </div>
                </div>
            </div>

            {/* Custom Styling */}
            <div>
                <h3 className="text-lg font-semibold mb-4">Custom Styling</h3>
                <div className="flex items-center gap-4">
                    <EnhancedAvatarV2
                        user={exampleUsers[0]}
                        size="lg"
                        showStatus
                        className="border-4 border-blue-500 shadow-lg"
                    />
                    <EnhancedAvatarV2
                        user={exampleUsers[1]}
                        size="lg"
                        showStatus
                        className="border-4 border-green-500 shadow-lg rounded-lg"
                    />
                    <EnhancedAvatarV2
                        user={exampleUsers[2]}
                        size="lg"
                        showStatus
                        className="border-4 border-purple-500 shadow-lg"
                    />
                </div>
            </div>

            {/* Uploadable Avatar Demo */}
            <div>
                <h3 className="text-lg font-semibold mb-4">Uploadable Avatar</h3>
                <p className="text-sm text-muted-foreground mb-4">
                    The UploadableAvatar component includes built-in upload functionality with progress tracking.
                </p>
                <div className="flex items-center gap-6">
                    <div className="text-center">
                        <UploadableAvatar
                            user={exampleUsers[0]}
                            size="xl"
                            onAvatarChange={async (file: File) => {
                                console.log('Demo upload:', file.name);
                                // Simulate upload delay
                                await new Promise(resolve => setTimeout(resolve, 2000));
                            }}
                        />
                        <p className="text-sm mt-2">Hover to see upload button</p>
                    </div>
                    <div className="text-center">
                        <UploadableAvatar
                            user={exampleUsers[3]}
                            size="xl"
                            showUploadButton
                            onAvatarChange={async (file: File) => {
                                console.log('Demo upload:', file.name);
                                await new Promise(resolve => setTimeout(resolve, 1500));
                            }}
                        />
                        <p className="text-sm mt-2">Always show upload button</p>
                    </div>
                </div>
            </div>
        </div>
    );
}