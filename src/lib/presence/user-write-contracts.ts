import { z } from 'zod';

export const presenceAvailabilitySchema = z.enum(['online', 'away', 'busy']);

const userPreferencesSchema = z
  .object({
    theme: z.string().max(64).optional(),
    notifications: z.boolean().optional(),
    defaultRoom: z.string().uuid().optional(),
  })
  .strict();

export const selfProfileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(100).optional(),
    status: presenceAvailabilitySchema.optional(),
    statusMessage: z.string().trim().max(280).optional(),
    preferences: userPreferencesSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one profile field is required',
  });

export const adminUserRoleUpdateSchema = z
  .object({ role: z.enum(['admin', 'member']) })
  .strict();

export const syncUserProfileSchema = z
  .object({
    supabaseUid: z.string().min(1),
    email: z.string().email(),
    displayName: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export const removeAvatarSchema = z
  .object({ userId: z.string().uuid().optional() })
  .strict();
