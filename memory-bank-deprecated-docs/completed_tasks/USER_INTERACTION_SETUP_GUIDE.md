# User Interaction System - Setup Guide

## Quick Start

The user interaction system is now implemented and ready to use. Here's how to integrate it into your application.

## 1. Add Context Providers

Update your main layout or app component to include the new calling context:

```typescript
// src/app/layout.tsx or wherever your providers are
import { CallingProvider } from '@/contexts/CallingContext';
import { CallNotifications } from '@/components/messaging/CallNotification';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <CompanyProvider>
            <PresenceProvider>
              <MessagingProvider>
                <CallingProvider>
                  {children}
                  {/* Add call notifications overlay */}
                  <CallNotifications />
                </CallingProvider>
              </MessagingProvider>
            </PresenceProvider>
          </CompanyProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
```

## 2. Replace Existing Avatars

### Option A: Use InteractiveUserAvatar (Recommended)

Replace existing avatar components with the new interactive version:

```typescript
// Before:
<EnhancedAvatarV2 user={user} showStatus={true} />

// After:
<InteractiveUserAvatar 
  user={user} 
  showStatus={true}
  onCall={handleUserCall}
  onTeleport={handleUserTeleport}
  onViewProfile={handleViewProfile}
/>
```

### Option B: Wrap Existing Avatars

Keep existing avatars but add interaction menu:

```typescript
import { UserInteractionMenu } from '@/components/messaging/UserInteractionMenu';

<UserInteractionMenu user={user}>
  <YourExistingAvatar user={user} />
</UserInteractionMenu>
```

## 3. Add Call Handlers (Optional)

If you want to handle calls and teleportation:

```typescript
import { useCalling } from '@/contexts/CallingContext';
import { usePresence } from '@/contexts/PresenceContext';

function MyComponent() {
  const { sendCallInvitation, sendTeleportInvitation } = useCalling();
  const { updateLocation } = usePresence();

  const handleUserCall = async (userId: string) => {
    // Send voice call invitation
    await sendCallInvitation(userId, 'voice');
  };

  const handleUserTeleport = async (spaceId: string) => {
    // Teleport current user to target space
    await updateLocation(spaceId);
  };

  const handleViewProfile = (userId: string) => {
    // Navigate to user profile or open profile modal
    router.push(`/profile/${userId}`);
  };

  return (
    <InteractiveUserAvatar
      user={user}
      onCall={handleUserCall}
      onTeleport={handleUserTeleport} 
      onViewProfile={handleViewProfile}
    />
  );
}
```

## 4. Update Existing Avatar Components

### Floor Plan Avatars

Update your floor plan avatar components:

```typescript
// src/components/floor-plan/modern/ModernUserAvatar.tsx
import { InteractiveUserAvatar } from '@/components/messaging/InteractiveUserAvatar';

// Replace the existing ModernUserAvatar implementation with:
export default function ModernUserAvatar(props: ModernUserAvatarProps) {
  return (
    <InteractiveUserAvatar
      user={props.user}
      size={props.size}
      showStatus={props.showStatus}
      className={props.className}
    />
  );
}
```

### Message Thread Avatars

Update message components to include interaction:

```typescript
// src/components/messaging/message-item.tsx
const MessageItem = ({ message }) => {
  const sender = useSenderInfo(message.senderId);
  
  return (
    <div className="flex gap-3">
      <InteractiveUserAvatar 
        user={sender}
        size="sm"
        showStatus={false}
      />
      <div className="message-content">
        {/* message content */}
      </div>
    </div>
  );
};
```

## 5. Customization Options

### Disable Certain Actions

```typescript
<InteractiveUserAvatar
  user={user}
  showCallActions={false}        // Hide call options
  showTeleportActions={false}    // Hide teleport options
  showInteractionMenu={false}    // Disable menu entirely (fallback to regular avatar)
/>
```

### Custom Styling

```typescript
<InteractiveUserAvatar
  user={user}
  className="border-2 border-primary"  // Custom avatar styling
  size="lg"                            // Size options: sm, md, lg, xl
/>
```

## What This Enables

### ✅ Direct Messaging
- Click any user avatar → Opens dropdown menu
- "Send Message" option → Instantly creates/opens direct conversation
- Integrates with existing messaging system

### ✅ Voice/Video Calling
- "Quick Call" option in avatar menu
- Sends call invitation to target user
- Real-time toast notifications for incoming calls
- Accept/decline system with 30-second timeout

### ✅ User Teleportation
- "Join User" option when user is in a space
- Sends teleport invitation to bring user to your space
- Real-time notifications with 60-second timeout
- Integrates with presence system

### ✅ Smart Status Awareness
- Shows different options based on user status
- Disables calling for busy/offline users
- Shows current location when user is in a space
- Color-coded status indicators

## Quick Test

To test the system:

1. Add `<InteractiveUserAvatar user={someUser} />` to any component
2. Click on the avatar → Should see dropdown menu
3. Click "Send Message" → Should open messaging interface
4. Click "Quick Call" → Should show call notification (if same user in different tab/device)

The system is ready to use immediately with your existing user data and messaging infrastructure!