import { z } from 'zod';

import { timezoneSchema } from './common.schema';

// ─── Signup ─────────────────────────────────────────────────────────

export const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be at most 100 characters'),
  email: z
    .string()
    .trim()
    .email('Invalid email address')
    .max(254, 'Email must be at most 254 characters')
    .transform((e) => e.toLowerCase()),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
});

export type SignupInput = z.infer<typeof signupSchema>;

// ─── Login ──────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Invalid email address')
    .max(254)
    .transform((e) => e.toLowerCase()),
  password: z.string().min(1, 'Password is required').max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ─── Forgot Password ────────────────────────────────────────────────

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Invalid email address')
    .max(254)
    .transform((e) => e.toLowerCase()),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

// ─── Reset Password ─────────────────────────────────────────────────

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ─── Update Profile ─────────────────────────────────────────────────

export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be at most 100 characters')
    .optional(),
  timezone: timezoneSchema.optional(),
  weekStart: z.union([z.literal(0), z.literal(1)]).optional(),
  timeFormat: z.enum(['12h', '24h']).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ─── Change Password ────────────────────────────────────────────────

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(128),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(128, 'New password must be at most 128 characters'),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ─── Delete Account ─────────────────────────────────────────────────

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Password is required').max(128),
});

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
