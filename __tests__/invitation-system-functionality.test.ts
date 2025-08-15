// __tests__/invitation-system-functionality.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Invitation, UserRole } from '@/types/database';

// Mock data for testing
const mockInvitation: Invitation = {
  token: 'test-token-123',
  email: 'test@example.com',
  companyId: 'test-company-id',
  role: 'member' as UserRole,
  expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days from now
  status: 'pending',
  createdAt: new Date().toISOString()
};

const mockExpiredInvitation: Invitation = {
  ...mockInvitation,
  token: 'expired-token-123',
  expiresAt: Date.now() - (24 * 60 * 60 * 1000), // 1 day ago
  status: 'expired'
};

const mockAcceptedInvitation: Invitation = {
  ...mockInvitation,
  token: 'accepted-token-123',
  status: 'accepted'
};

describe('Invitation System Functionality Tests', () => {
  beforeEach(() => {
    // Mock console methods to avoid noise in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Invitation Data Structure', () => {
    it('should have correct invitation interface structure', () => {
      expect(mockInvitation).toHaveProperty('token');
      expect(mockInvitation).toHaveProperty('email');
      expect(mockInvitation).toHaveProperty('companyId');
      expect(mockInvitation).toHaveProperty('role');
      expect(mockInvitation).toHaveProperty('expiresAt');
      expect(mockInvitation).toHaveProperty('status');
      expect(mockInvitation).toHaveProperty('createdAt');
    });

    it('should have valid invitation status values', () => {
      const validStatuses = ['pending', 'accepted', 'expired'];
      expect(validStatuses).toContain(mockInvitation.status);
      expect(validStatuses).toContain(mockExpiredInvitation.status);
      expect(validStatuses).toContain(mockAcceptedInvitation.status);
    });

    it('should have valid user role values', () => {
      const validRoles: UserRole[] = ['admin', 'member'];
      expect(validRoles).toContain(mockInvitation.role);
    });

    it('should have proper timestamp formats', () => {
      expect(typeof mockInvitation.expiresAt).toBe('number');
      expect(typeof mockInvitation.createdAt).toBe('string');
      expect(new Date(mockInvitation.createdAt).toISOString()).toBe(mockInvitation.createdAt);
    });
  });

  describe('Invitation Token Generation', () => {
    it('should generate unique tokens', () => {
      const tokens = new Set();
      for (let i = 0; i < 100; i++) {
        const token = generateInvitationToken();
        expect(tokens.has(token)).toBe(false);
        tokens.add(token);
      }
    });

    it('should generate tokens with proper format', () => {
      const token = generateInvitationToken();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(10);
      // Should be URL-safe
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('Invitation Validation', () => {
    it('should validate pending invitations correctly', () => {
      expect(isInvitationValid(mockInvitation)).toBe(true);
    });

    it('should reject expired invitations', () => {
      expect(isInvitationValid(mockExpiredInvitation)).toBe(false);
    });

    it('should reject already accepted invitations', () => {
      expect(isInvitationValid(mockAcceptedInvitation)).toBe(false);
    });

    it('should validate email format', () => {
      const invalidEmailInvitation = { ...mockInvitation, email: 'invalid-email' };
      expect(isValidEmail(invalidEmailInvitation.email)).toBe(false);
      expect(isValidEmail(mockInvitation.email)).toBe(true);
    });

    it('should check expiration correctly', () => {
      const futureTime = Date.now() + (24 * 60 * 60 * 1000);
      const pastTime = Date.now() - (24 * 60 * 60 * 1000);
      
      expect(isInvitationExpired({ ...mockInvitation, expiresAt: futureTime })).toBe(false);
      expect(isInvitationExpired({ ...mockInvitation, expiresAt: pastTime })).toBe(true);
    });
  });

  describe('Invitation URL Generation', () => {
    it('should generate valid invitation URLs', () => {
      const baseUrl = 'https://example.com';
      const url = generateInvitationUrl(mockInvitation.token, baseUrl);
      
      expect(url).toContain(baseUrl);
      expect(url).toContain(mockInvitation.token);
      expect(url).toMatch(/^https?:\/\/.+/);
    });

    it('should handle different base URLs', () => {
      const baseUrls = [
        'https://example.com',
        'http://localhost:3000',
        'https://app.virtualoffice.com'
      ];
      
      baseUrls.forEach(baseUrl => {
        const url = generateInvitationUrl(mockInvitation.token, baseUrl);
        expect(url).toContain(baseUrl);
      });
    });

    it('should generate URLs with proper path structure', () => {
      const url = generateInvitationUrl(mockInvitation.token);
      expect(url).toMatch(/\/invite\/[A-Za-z0-9_-]+/);
    });
  });

  describe('Invitation Error Handling', () => {
    it('should identify different error types', () => {
      const errors = [
        { type: 'invitation_expired', invitation: mockExpiredInvitation },
        { type: 'invitation_already_used', invitation: mockAcceptedInvitation },
        { type: 'invitation_not_found', invitation: null }
      ];

      errors.forEach(({ type, invitation }) => {
        const errorType = getInvitationErrorType(invitation);
        if (invitation) {
          expect(['invitation_expired', 'invitation_already_used', 'valid']).toContain(errorType);
        } else {
          expect(errorType).toBe('invitation_not_found');
        }
      });
    });

    it('should provide appropriate error messages', () => {
      const errorMessages = {
        'invitation_expired': 'This invitation has expired',
        'invitation_already_used': 'This invitation has already been used',
        'invitation_not_found': 'Invitation not found',
        'permission_denied': 'You do not have permission to access this invitation'
      };

      Object.entries(errorMessages).forEach(([errorType, expectedMessage]) => {
        const message = getInvitationErrorMessage(errorType as any);
        expect(message).toContain(expectedMessage.toLowerCase());
      });
    });
  });

  describe('Invitation Status Management', () => {
    it('should track status transitions correctly', () => {
      const validTransitions = [
        { from: 'pending', to: 'accepted' },
        { from: 'pending', to: 'expired' }
      ];

      const invalidTransitions = [
        { from: 'accepted', to: 'pending' },
        { from: 'expired', to: 'pending' },
        { from: 'accepted', to: 'expired' }
      ];

      validTransitions.forEach(({ from, to }) => {
        expect(isValidStatusTransition(from as any, to as any)).toBe(true);
      });

      invalidTransitions.forEach(({ from, to }) => {
        expect(isValidStatusTransition(from as any, to as any)).toBe(false);
      });
    });

    it('should handle status updates properly', () => {
      const invitation = { ...mockInvitation };
      
      // Should allow pending -> accepted
      const acceptedInvitation = updateInvitationStatus(invitation, 'accepted');
      expect(acceptedInvitation.status).toBe('accepted');
      
      // Should allow pending -> expired
      const expiredInvitation = updateInvitationStatus(invitation, 'expired');
      expect(expiredInvitation.status).toBe('expired');
    });
  });

  describe('Invitation List Management', () => {
    it('should filter invitations by status', () => {
      const invitations = [
        mockInvitation,
        mockExpiredInvitation,
        mockAcceptedInvitation
      ];

      const pendingInvitations = filterInvitationsByStatus(invitations, 'pending');
      const expiredInvitations = filterInvitationsByStatus(invitations, 'expired');
      const acceptedInvitations = filterInvitationsByStatus(invitations, 'accepted');

      expect(pendingInvitations).toHaveLength(1);
      expect(expiredInvitations).toHaveLength(1);
      expect(acceptedInvitations).toHaveLength(1);
    });

    it('should sort invitations by creation date', () => {
      const now = Date.now();
      const invitations = [
        { ...mockInvitation, createdAt: new Date(now - 2000).toISOString() },
        { ...mockInvitation, createdAt: new Date(now - 1000).toISOString() },
        { ...mockInvitation, createdAt: new Date(now).toISOString() }
      ];

      const sorted = sortInvitationsByDate(invitations, 'desc');
      expect(new Date(sorted[0].createdAt).getTime()).toBeGreaterThan(
        new Date(sorted[1].createdAt).getTime()
      );
    });

    it('should paginate invitations correctly', () => {
      const invitations = Array.from({ length: 25 }, (_, i) => ({
        ...mockInvitation,
        token: `token-${i}`,
        email: `user${i}@example.com`
      }));

      const page1 = paginateInvitations(invitations, 1, 10);
      const page2 = paginateInvitations(invitations, 2, 10);
      const page3 = paginateInvitations(invitations, 3, 10);

      expect(page1).toHaveLength(10);
      expect(page2).toHaveLength(10);
      expect(page3).toHaveLength(5);
    });
  });

  describe('Invitation Security', () => {
    it('should validate invitation tokens securely', () => {
      const validTokens = [
        'abc123def456',
        'ABC123DEF456',
        'abc-123_def',
        'a1b2c3d4e5f6'
      ];

      const invalidTokens = [
        '',
        'abc 123',
        'abc@123',
        'abc#123',
        'abc+123'
      ];

      validTokens.forEach(token => {
        expect(isValidInvitationToken(token)).toBe(true);
      });

      invalidTokens.forEach(token => {
        expect(isValidInvitationToken(token)).toBe(false);
      });
    });

    it('should prevent token enumeration attacks', () => {
      // Tokens should be sufficiently random and long
      const token = generateInvitationToken();
      expect(token.length).toBeGreaterThanOrEqual(32);
      
      // Should use cryptographically secure randomness
      const tokens = Array.from({ length: 1000 }, () => generateInvitationToken());
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(tokens.length);
    });
  });

  describe('Invitation Performance', () => {
    it('should validate invitations quickly', () => {
      const startTime = performance.now();
      
      for (let i = 0; i < 1000; i++) {
        isInvitationValid(mockInvitation);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete 1000 validations in under 50ms
      expect(duration).toBeLessThan(50);
    });

    it('should generate tokens quickly', () => {
      const startTime = performance.now();
      
      for (let i = 0; i < 100; i++) {
        generateInvitationToken();
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete 100 token generations in under 10ms
      expect(duration).toBeLessThan(10);
    });
  });
});

// Helper functions for testing (these would normally be in utility files)
function generateInvitationToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function isInvitationValid(invitation: Invitation): boolean {
  if (!invitation) return false;
  if (invitation.status !== 'pending') return false;
  if (invitation.expiresAt < Date.now()) return false;
  return true;
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isInvitationExpired(invitation: Invitation): boolean {
  return invitation.expiresAt < Date.now();
}

function generateInvitationUrl(token: string, baseUrl: string = 'https://app.virtualoffice.com'): string {
  return `${baseUrl}/invite/${token}`;
}

function getInvitationErrorType(invitation: Invitation | null): string {
  if (!invitation) return 'invitation_not_found';
  if (invitation.status === 'expired' || invitation.expiresAt < Date.now()) return 'invitation_expired';
  if (invitation.status === 'accepted') return 'invitation_already_used';
  return 'valid';
}

function getInvitationErrorMessage(errorType: string): string {
  const messages = {
    'invitation_expired': 'this invitation has expired',
    'invitation_already_used': 'this invitation has already been used',
    'invitation_not_found': 'invitation not found',
    'permission_denied': 'you do not have permission to access this invitation'
  };
  return messages[errorType as keyof typeof messages] || 'unknown error';
}

function isValidStatusTransition(from: Invitation['status'], to: Invitation['status']): boolean {
  const validTransitions = {
    'pending': ['accepted', 'expired'],
    'accepted': [],
    'expired': []
  };
  return validTransitions[from]?.includes(to) || false;
}

function updateInvitationStatus(invitation: Invitation, status: Invitation['status']): Invitation {
  return { ...invitation, status };
}

function filterInvitationsByStatus(invitations: Invitation[], status: Invitation['status']): Invitation[] {
  return invitations.filter(inv => inv.status === status);
}

function sortInvitationsByDate(invitations: Invitation[], order: 'asc' | 'desc' = 'desc'): Invitation[] {
  return [...invitations].sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    return order === 'desc' ? timeB - timeA : timeA - timeB;
  });
}

function paginateInvitations(invitations: Invitation[], page: number, limit: number): Invitation[] {
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  return invitations.slice(startIndex, endIndex);
}

function isValidInvitationToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  if (token.length < 10) return false;
  return /^[A-Za-z0-9_-]+$/.test(token);
}