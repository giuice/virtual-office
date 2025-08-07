import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { EnhancedAvatarV2 } from '../src/components/ui/enhanced-avatar-v2';
import { User } from '@/types/database';
import * as avatarUtils from '@/lib/avatar-utils';

// Mock the avatar utils
vi.mock('@/lib/avatar-utils', () => ({
  getAvatarUrl: vi.fn(),
  getUserInitials: vi.fn(),
  getUserColor: vi.fn(),
  handleAvatarLoadError: vi.fn(),
  logAvatarLoadError: vi.fn(),
}));

// Mock Lucide icons
vi.mock('lucide-react', () => ({
  Loader2: () => <div data-testid="loader" />,
  RefreshCw: () => <div data-testid="refresh" />,
  AlertCircle: () => <div data-testid="alert" />,
}));

// Mock the UI components
vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className, ...props }: any) => (
    <div data-testid="avatar" className={className} {...props}>
      {children}
    </div>
  ),
  AvatarImage: ({ src, alt, ...props }: any) => (
    <img data-testid="avatar-image" src={src} alt={alt} {...props} />
  ),
  AvatarFallback: ({ children, className }: any) => (
    <div data-testid="avatar-fallback" className={className}>
      {children}
    </div>
  ),
}));

// Mock utils
vi.mock('@/lib/utils', () => ({
  cn: (...classes: any[]) => classes.filter(Boolean).join(' '),
}));

describe('EnhancedAvatarV2 - Basic Tests', () => {
  const mockUser: User = {
    id: 'user-1',
    companyId: 'company-1',
    supabase_uid: 'supabase-uid-1',
    email: 'test@example.com',
    displayName: 'John Doe',
    avatarUrl: 'https://example.com/avatar.jpg',
    status: 'online',
    preferences: {},
    role: 'member',
    lastActive: '2024-01-01T00:00:00Z',
    createdAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock implementations
    (avatarUtils.getAvatarUrl as any).mockReturnValue('https://example.com/avatar.jpg');
    (avatarUtils.getUserInitials as any).mockReturnValue('JD');
    (avatarUtils.getUserColor as any).mockReturnValue('#3B82F6');
  });

  describe('Basic Rendering', () => {
    it('renders without crashing', () => {
      render(<EnhancedAvatarV2 user={mockUser} />);
      
      const avatar = screen.getByTestId('avatar');
      expect(avatar).toBeDefined();
    });

    it('calls getAvatarUrl with the user', () => {
      render(<EnhancedAvatarV2 user={mockUser} />);
      
      expect(avatarUtils.getAvatarUrl).toHaveBeenCalledWith(mockUser);
    });

    it('renders with null user', () => {
      render(<EnhancedAvatarV2 user={null} />);
      
      const avatar = screen.getByTestId('avatar');
      expect(avatar).toBeDefined();
      expect(avatarUtils.getAvatarUrl).toHaveBeenCalledWith(null);
    });
  });

  describe('Size Variants', () => {
    it('applies small size classes', () => {
      render(<EnhancedAvatarV2 user={mockUser} size="sm" />);
      
      const avatar = screen.getByTestId('avatar');
      expect(avatar.className).toContain('h-8');
      expect(avatar.className).toContain('w-8');
    });

    it('applies medium size classes (default)', () => {
      render(<EnhancedAvatarV2 user={mockUser} size="md" />);
      
      const avatar = screen.getByTestId('avatar');
      expect(avatar.className).toContain('h-12');
      expect(avatar.className).toContain('w-12');
    });

    it('applies large size classes', () => {
      render(<EnhancedAvatarV2 user={mockUser} size="lg" />);
      
      const avatar = screen.getByTestId('avatar');
      expect(avatar.className).toContain('h-16');
      expect(avatar.className).toContain('w-16');
    });

    it('applies extra large size classes', () => {
      render(<EnhancedAvatarV2 user={mockUser} size="xl" />);
      
      const avatar = screen.getByTestId('avatar');
      expect(avatar.className).toContain('h-24');
      expect(avatar.className).toContain('w-24');
    });
  });

  describe('Loading States', () => {
    it('shows loading state for external URLs', () => {
      (avatarUtils.getAvatarUrl as any).mockReturnValue('https://example.com/avatar.jpg');
      
      render(<EnhancedAvatarV2 user={mockUser} showLoadingState={true} />);
      
      // Should show loader initially for external URLs
      const loader = screen.getByTestId('loader');
      expect(loader).toBeDefined();
    });

    it('does not show loading state for data URIs', () => {
      (avatarUtils.getAvatarUrl as any).mockReturnValue('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=');
      
      render(<EnhancedAvatarV2 user={mockUser} showLoadingState={true} />);
      
      // Should not show loader for data URIs
      const loader = screen.queryByTestId('loader');
      expect(loader).toBeNull();
    });
  });

  describe('Click Handling', () => {
    it('handles click events when onClick is provided', () => {
      const onClick = vi.fn();
      
      render(<EnhancedAvatarV2 user={mockUser} onClick={onClick} />);
      
      const avatar = screen.getByTestId('avatar');
      expect(avatar.className).toContain('cursor-pointer');
      
      avatar.click();
      expect(onClick).toHaveBeenCalled();
    });

    it('does not add click styles when onClick is not provided', () => {
      render(<EnhancedAvatarV2 user={mockUser} />);
      
      const avatar = screen.getByTestId('avatar');
      expect(avatar.className).not.toContain('cursor-pointer');
    });
  });

  describe('Accessibility', () => {
    it('sets correct aria-label', () => {
      render(<EnhancedAvatarV2 user={mockUser} />);
      
      const avatar = screen.getByTestId('avatar');
      expect(avatar.getAttribute('aria-label')).toBe("John Doe's avatar");
    });

    it('uses custom aria-label when provided', () => {
      render(<EnhancedAvatarV2 user={mockUser} aria-label="Custom label" />);
      
      const avatar = screen.getByTestId('avatar');
      expect(avatar.getAttribute('aria-label')).toBe('Custom label');
    });

    it('sets role and tabIndex when clickable', () => {
      const onClick = vi.fn();
      
      render(<EnhancedAvatarV2 user={mockUser} onClick={onClick} />);
      
      const avatar = screen.getByTestId('avatar');
      expect(avatar.getAttribute('role')).toBe('button');
      expect(avatar.getAttribute('tabIndex')).toBe('0');
    });

    it('does not set role and tabIndex when not clickable', () => {
      render(<EnhancedAvatarV2 user={mockUser} />);
      
      const avatar = screen.getByTestId('avatar');
      expect(avatar.getAttribute('role')).toBeNull();
      expect(avatar.getAttribute('tabIndex')).toBeNull();
    });
  });

  describe('Custom Styling', () => {
    it('applies custom className', () => {
      render(<EnhancedAvatarV2 user={mockUser} className="custom-class" />);
      
      const avatar = screen.getByTestId('avatar');
      expect(avatar.className).toContain('custom-class');
    });

    it('maintains default classes with custom className', () => {
      render(<EnhancedAvatarV2 user={mockUser} className="custom-class" />);
      
      const avatar = screen.getByTestId('avatar');
      expect(avatar.className).toContain('custom-class');
      expect(avatar.className).toContain('h-12');
      expect(avatar.className).toContain('w-12');
      expect(avatar.className).toContain('border');
    });
  });

  describe('Fallback Behavior', () => {
    it('uses fallbackName when provided', () => {
      (avatarUtils.getUserInitials as any).mockReturnValue('FB');
      
      render(<EnhancedAvatarV2 user={mockUser} fallbackName="Fallback Name" />);
      
      expect(avatarUtils.getUserInitials).toHaveBeenCalledWith('Fallback Name');
    });

    it('uses user displayName when fallbackName is not provided', () => {
      render(<EnhancedAvatarV2 user={mockUser} />);
      
      expect(avatarUtils.getUserInitials).toHaveBeenCalledWith('John Doe');
    });

    it('uses default name for null user', () => {
      render(<EnhancedAvatarV2 user={null} />);
      
      expect(avatarUtils.getUserInitials).toHaveBeenCalledWith('User');
    });
  });
});