// __tests__/repositories/SupabasePlatformAdminRepository.test.ts
// Story: story-platform-admin - Unit tests for Platform Admin Repository

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { SupabasePlatformAdminRepository } from '@/repositories/implementations/supabase/SupabasePlatformAdminRepository';
import { SupabaseClient } from '@supabase/supabase-js';

// Mock Supabase client
const createMockSupabase = () => {
	const mockFrom = vi.fn();
	const mockSelect = vi.fn().mockReturnThis();
	const mockEq = vi.fn().mockReturnThis();
	const mockMaybeSingle = vi.fn();

	mockFrom.mockReturnValue({
		select: mockSelect,
		eq: mockEq,
		maybeSingle: mockMaybeSingle,
	});

	// Chain support
	mockSelect.mockReturnValue({
		eq: mockEq,
		maybeSingle: mockMaybeSingle,
	});

	mockEq.mockReturnValue({
		maybeSingle: mockMaybeSingle,
	});

	return {
		from: mockFrom,
		_mocks: { mockFrom, mockSelect, mockEq, mockMaybeSingle },
	} as unknown as SupabaseClient & {
		_mocks: {
			mockFrom: Mock;
			mockSelect: Mock;
			mockEq: Mock;
			mockMaybeSingle: Mock;
		};
	};
};

describe('SupabasePlatformAdminRepository', () => {
	let mockSupabase: ReturnType<typeof createMockSupabase>;
	let repository: SupabasePlatformAdminRepository;

	beforeEach(() => {
		vi.clearAllMocks();
		mockSupabase = createMockSupabase();
		repository = new SupabasePlatformAdminRepository(mockSupabase as unknown as SupabaseClient);
	});

	describe('isUserPlatformAdmin', () => {
		it('should return true when user is a platform admin', async () => {
			const authUid = 'test-auth-uid-123';
			mockSupabase._mocks.mockMaybeSingle.mockResolvedValue({
				data: { id: 'platform-admin-id-123' },
				error: null,
			});

			const result = await repository.isUserPlatformAdmin(authUid);

			expect(result).toBe(true);
			expect(mockSupabase._mocks.mockFrom).toHaveBeenCalledWith('platform_admins');
			expect(mockSupabase._mocks.mockEq).toHaveBeenCalledWith('user_id', authUid);
		});

		it('should return false when user is not a platform admin', async () => {
			const authUid = 'regular-user-uid';
			mockSupabase._mocks.mockMaybeSingle.mockResolvedValue({
				data: null,
				error: null,
			});

			const result = await repository.isUserPlatformAdmin(authUid);

			expect(result).toBe(false);
		});

		it('should return false when query errors', async () => {
			const authUid = 'test-uid';
			mockSupabase._mocks.mockMaybeSingle.mockResolvedValue({
				data: null,
				error: { message: 'Database error' },
			});

			const result = await repository.isUserPlatformAdmin(authUid);

			expect(result).toBe(false);
		});
	});

	describe('getByAuthUid', () => {
		it('should return platform admin data when found', async () => {
			const authUid = 'test-auth-uid';
			const mockData = {
				id: 'platform-admin-id',
				user_id: authUid,
				created_at: '2025-01-01T00:00:00Z',
			};
			mockSupabase._mocks.mockMaybeSingle.mockResolvedValue({
				data: mockData,
				error: null,
			});

			const result = await repository.getByAuthUid(authUid);

			expect(result).toEqual({
				id: 'platform-admin-id',
				userId: authUid,
				createdAt: '2025-01-01T00:00:00Z',
			});
		});

		it('should return null when platform admin not found', async () => {
			mockSupabase._mocks.mockMaybeSingle.mockResolvedValue({
				data: null,
				error: null,
			});

			const result = await repository.getByAuthUid('unknown-uid');

			expect(result).toBeNull();
		});

		it('should return null on error', async () => {
			mockSupabase._mocks.mockMaybeSingle.mockResolvedValue({
				data: null,
				error: { message: 'Query failed' },
			});

			const result = await repository.getByAuthUid('test-uid');

			expect(result).toBeNull();
		});
	});

	describe('AC 1.2: Platform admin users have company_id as NULL', () => {
		it('should return platform admin without requiring company association', async () => {
			// This test validates AC 1.2 by ensuring the repository
			// doesn't require a company_id for platform admins
			const authUid = 'platform-admin-no-company';
			const mockData = {
				id: 'pa-id',
				user_id: authUid,
				created_at: '2025-01-01T00:00:00Z',
				// Note: No company_id field - platform admins exist independently
			};
			mockSupabase._mocks.mockMaybeSingle.mockResolvedValue({
				data: mockData,
				error: null,
			});

			const result = await repository.getByAuthUid(authUid);

			expect(result).toBeDefined();
			expect(result?.userId).toBe(authUid);
			// Platform admin type doesn't include companyId - verified
		});
	});
});
