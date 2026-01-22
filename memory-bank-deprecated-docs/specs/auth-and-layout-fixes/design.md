# Design Document

## Overview

This design addresses critical foundational issues in the Virtual Office application that are preventing proper testing and user experience. The solution focuses on four main areas: multi-account authentication support, user invitation system, layout consistency improvements, and enhanced theming system. These fixes will enable proper avatar testing and overall application functionality by resolving authentication conflicts, implementing company-based user management, and establishing a cohesive visual design system.

The implementation will build upon the existing Next.js 15.3.0 + TypeScript architecture with Supabase authentication, TailwindCSS 4.1.3 + Shadcn/UI components, and TanStack Query for state management.

## Architecture

### Authentication Architecture

The authentication system will be enhanced to support multiple Google accounts and proper session management:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client App    │    │  Supabase Auth   │    │   Database      │
│                 │    │                  │    │                 │
│ - Auth Context  │◄──►│ - Google OAuth   │◄──►│ - Users Table   │
│ - Session Mgmt  │    │ - Session Mgmt   │    │ - Companies     │
│ - Error Handling│    │ - Token Refresh  │    │ - Invitations   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Invitation System Architecture

A secure invitation system will be implemented with proper access control:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Admin Dashboard│    │  Invitation API  │    │   Database      │
│                 │    │                  │    │                 │
│ - Invite UI     │◄──►│ - Generate Links │◄──►│ - Invitations   │
│ - Member List   │    │ - Validate Tokens│    │ - Companies     │
│ - Role Mgmt     │    │ - Auto-assign    │    │ - Users         │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Theming System Architecture

Enhanced theming will extend the existing Shadcn/TailwindCSS foundation:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Theme Provider │    │  CSS Variables   │    │  Components     │
│                 │    │                  │    │                 │
│ - Theme Context │◄──►│ - Color Tokens   │◄──►│ - Shadcn UI     │
│ - Dynamic Vars  │    │ - Typography     │    │ - Custom Comps  │
│ - Persistence   │    │ - Spacing Scale  │    │ - Layout Shell  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Components and Interfaces

### Authentication Components

**AuthProvider Enhancement**
The existing AuthProvider will be enhanced to support multi-account scenarios:
```typescript
interface AuthContextType {
  // Existing properties from current implementation
  session: Session | null;
  user: User | null;
  loading: boolean;
  error: string | null;
  
  // Existing auth actions
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  
  // Action-specific states
  actionLoading: boolean;
  actionError: string | null;
  
  // New multi-account support methods
  clearAuthState: () => void;
  refreshSession: () => Promise<void>;
  switchAccount: () => Promise<void>;
}
```

**Multi-Account Session Manager**
```typescript
interface SessionManager {
  clearBrowserData: () => void;
  validateSession: () => Promise<boolean>;
  handleAuthConflicts: (error: AuthError) => Promise<void>;
  switchAccount: () => Promise<void>;
}
```

### Invitation System Components

**InvitationManager**
```typescript
interface InvitationManager {
  generateInvite: (companyId: string, role: UserRole) => Promise<Invitation>;
  validateInvite: (token: string) => Promise<InvitationValidation>;
  acceptInvite: (token: string, userId: string) => Promise<void>;
  revokeInvite: (inviteId: string) => Promise<void>;
}

interface Invitation {
  id: string;
  companyId: string;
  token: string;
  email?: string;
  role: UserRole;
  expiresAt: Date;
  createdBy: string;
  isUsed: boolean;
}
```

**Admin Dashboard Components**
- `InviteUserDialog`: Modal for creating invitations
- `MemberList`: Display company members with roles
- `InvitationList`: Manage pending invitations
- `RoleSelector`: Role assignment interface

### Layout and Theming Components

**Enhanced Theme Provider**
```typescript
interface ThemeContextType {
  theme: ThemeConfig;
  setTheme: (theme: Partial<ThemeConfig>) => void;
  resetTheme: () => void;
  applyCustomColors: (colors: ColorScheme) => void;
}

interface ThemeConfig {
  colorScheme: 'light' | 'dark' | 'auto';
  primaryColor: string;
  accentColor: string;
  borderRadius: 'none' | 'sm' | 'md' | 'lg';
  fontScale: 'sm' | 'base' | 'lg';
}
```

**Layout Shell Enhancement**
- `AppShell`: Main application layout wrapper
- `NavigationSidebar`: Enhanced navigation with proper styling
- `HeaderBar`: Consistent header across all pages
- `ContentArea`: Responsive content container

## Data Models

### Enhanced User Model
```typescript
interface User {
  id: string;
  supabaseUid: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  companyId?: string;
  role: UserRole;
  status: UserStatus;
  preferences: UserPreferences;
  lastActiveAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface UserPreferences {
  theme: ThemeConfig;
  notifications: boolean;
  language: string;
}
```

### Invitation Model
```typescript
interface Invitation {
  id: string;
  companyId: string;
  token: string;
  email?: string;
  role: UserRole;
  expiresAt: Date;
  createdBy: string;
  isUsed: boolean;
  usedBy?: string;
  usedAt?: Date;
  createdAt: Date;
}
```

### Company Model Enhancement
```typescript
interface Company {
  id: string;
  name: string;
  slug: string;
  settings: CompanySettings;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface CompanySettings {
  allowPublicSignup: boolean;
  defaultMemberRole: UserRole;
  invitationExpiryDays: number;
  themeOverrides?: Partial<ThemeConfig>;
}
```

## Error Handling

### Authentication Error Handling

**Error Types and Recovery**
```typescript
enum AuthErrorType {
  SESSION_EXPIRED = 'session_expired',
  ACCOUNT_CONFLICT = 'account_conflict',
  INVALID_CREDENTIALS = 'invalid_credentials',
  NETWORK_ERROR = 'network_error',
  RATE_LIMITED = 'rate_limited'
}

interface AuthErrorHandler {
  handleError: (error: AuthError) => Promise<AuthRecoveryAction>;
  showUserFriendlyMessage: (error: AuthError) => string;
  suggestRecoveryActions: (error: AuthError) => RecoveryAction[];
}
```

**Recovery Strategies**
- Automatic token refresh for expired sessions
- Clear browser data option for account conflicts
- Retry mechanisms for network errors
- User-friendly error messages with actionable steps

### Invitation Error Handling

**Validation and Error States**
- Expired invitation handling with regeneration option
- Invalid token detection with clear messaging
- Duplicate invitation prevention
- Company capacity limits enforcement

### Layout Error Boundaries

**Component-Level Error Handling**
- Error boundaries for each major layout section
- Graceful degradation for styling failures
- Fallback UI components for broken layouts
- Development-mode error overlays

## Testing Strategy

### Authentication Testing

**Multi-Account Testing**
```typescript
describe('Multi-Account Authentication', () => {
  test('should allow switching between Google accounts');
  test('should handle session conflicts gracefully');
  test('should clear auth state completely on signout');
  test('should maintain separate user profiles');
});
```

**Integration Tests**
- End-to-end authentication flows
- Cross-browser session management
- Error recovery scenarios
- Performance under load

### Invitation System Testing

**Invitation Flow Testing**
```typescript
describe('Invitation System', () => {
  test('should generate valid invitation links');
  test('should prevent expired invitation usage');
  test('should auto-assign users to companies');
  test('should handle concurrent invitation acceptance');
});
```

**Security Testing**
- Token validation and expiry
- Authorization checks for admin actions
- Rate limiting for invitation generation
- SQL injection prevention

### Layout and Theming Testing

**Visual Regression Testing**
- Screenshot comparisons across theme changes
- Responsive layout testing
- Component styling consistency
- Cross-browser compatibility

**Accessibility Testing**
- Keyboard navigation support
- Screen reader compatibility
- Color contrast validation
- Focus management

### Performance Testing

**Authentication Performance**
- Session validation speed
- Token refresh latency
- Database query optimization
- Caching effectiveness

**UI Performance**
- Theme switching responsiveness
- Layout rendering performance
- Component re-render optimization
- Bundle size impact

## Implementation Approach

### Phase 1: Authentication Fixes
1. Enhance AuthProvider with proper session management
2. Implement multi-account support and conflict resolution
3. Add comprehensive error handling and user feedback
4. Create session cleanup utilities

### Phase 2: Invitation System
1. Design and implement invitation database schema
2. Create invitation generation and validation APIs
3. Build admin dashboard components for user management
4. Implement invitation acceptance flow

### Phase 3: Layout and Theming
1. Audit existing layout issues and create fix plan
2. Enhance theme system with custom CSS properties
3. Implement responsive layout improvements
4. Create consistent component styling

### Phase 4: Integration and Testing
1. Integrate all systems with proper error handling
2. Implement comprehensive test coverage
3. Performance optimization and monitoring
4. Documentation and deployment preparation

## Design Decisions and Rationales

### Authentication Architecture Decisions

**Decision**: Use Supabase Auth with enhanced session management
**Rationale**: Leverages existing infrastructure while adding necessary multi-account support and conflict resolution

**Decision**: Implement client-side session cleanup utilities
**Rationale**: Provides developers with tools to resolve authentication conflicts during testing

### Invitation System Decisions

**Decision**: Token-based invitation system with expiration
**Rationale**: Provides security through time-limited access while maintaining simplicity for users

**Decision**: Company-based auto-assignment on invitation acceptance
**Rationale**: Streamlines onboarding process and ensures proper access control

### Theming System Decisions

**Decision**: Enhance existing TailwindCSS 4.1.3 + Shadcn/UI theming system
**Rationale**: The project already has a comprehensive theming system with CSS custom properties and dark/light mode support. We'll extend this foundation rather than rebuild it.

**Decision**: Leverage existing CSS custom properties and next-themes integration
**Rationale**: The current implementation already supports runtime theme changes with CSS variables. We'll enhance the existing system for better consistency and additional customization options.

### Error Handling Decisions

**Decision**: Comprehensive error boundaries with fallback UI
**Rationale**: Ensures application stability and provides clear feedback to users during failures

**Decision**: Actionable error messages with recovery suggestions
**Rationale**: Improves developer experience during testing and user experience in production