import { Hono } from 'hono';
import { z } from 'zod';

import {
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  updateProfileSchema,
} from '@calley/shared';

import { authMiddleware } from '../middleware/auth.middleware';
import { doubleSubmitCsrf } from '../middleware/csrf.middleware';
import { rateLimit } from '../middleware/rate-limit.middleware';
import { validate } from '../middleware/validate.middleware';
import { authService } from '../services/auth.service';

import type { AppVariables } from '../types/hono';
import type {
  ChangePasswordInput,
  DeleteAccountInput,
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
  SignupInput,
  UpdateProfileInput,
} from '@calley/shared';

const emptySchema = z.object({});

const auth = new Hono<{ Variables: AppVariables }>();

// ─── Public Routes (no auth required) ──────────────────────────────────

auth.post(
  '/auth/signup',
  rateLimit({ limit: 3, windowSeconds: 3600, keyPrefix: 'auth:signup' }),
  doubleSubmitCsrf,
  validate('json', signupSchema),
  async (c) => {
    const data = c.get('validatedBody') as SignupInput;
    const userAgent = c.req.header('user-agent') ?? null;
    const ipAddress =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || null;

    const { user, cookie } = await authService.signup(data, { userAgent, ipAddress });

    c.header('Set-Cookie', cookie.serialize(), { append: true });
    return c.json(user, 201);
  },
);

auth.post(
  '/auth/login',
  rateLimit({ limit: 5, windowSeconds: 900, keyPrefix: 'auth:login' }),
  doubleSubmitCsrf,
  validate('json', loginSchema),
  async (c) => {
    const data = c.get('validatedBody') as LoginInput;
    const userAgent = c.req.header('user-agent') ?? null;
    const ipAddress =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || null;

    const { user, cookie } = await authService.login(data, { userAgent, ipAddress });

    c.header('Set-Cookie', cookie.serialize(), { append: true });
    return c.json(user);
  },
);

auth.post(
  '/auth/forgot-password',
  rateLimit({ limit: 3, windowSeconds: 3600, keyPrefix: 'auth:forgot-password' }),
  doubleSubmitCsrf,
  validate('json', forgotPasswordSchema),
  async (c) => {
    const data = c.get('validatedBody') as ForgotPasswordInput;
    await authService.forgotPassword(data);

    // Always return the same response to prevent email enumeration
    return c.json({ message: 'If that email is registered, we sent a password reset link.' });
  },
);

auth.post(
  '/auth/reset-password',
  rateLimit({ limit: 5, windowSeconds: 3600, keyPrefix: 'auth:reset-password' }),
  doubleSubmitCsrf,
  validate('json', resetPasswordSchema),
  async (c) => {
    const data = c.get('validatedBody') as ResetPasswordInput;
    await authService.resetPassword(data);
    return c.json({ message: 'Password has been reset. Please log in with your new password.' });
  },
);

// ─── Authenticated Routes ──────────────────────────────────────────────

auth.post(
  '/auth/logout',
  authMiddleware,
  doubleSubmitCsrf,
  validate('query', emptySchema),
  async (c) => {
    const session = c.get('session')!;
    const { cookie } = await authService.logout(session.id);

    c.header('Set-Cookie', cookie.serialize(), { append: true });
    return c.body(null, 204);
  },
);

auth.get('/auth/me', authMiddleware, validate('query', emptySchema), async (c) => {
  const userId = c.get('userId')!;
  const user = await authService.getMe(userId);
  return c.json(user);
});

auth.patch(
  '/auth/me',
  authMiddleware,
  doubleSubmitCsrf,
  validate('json', updateProfileSchema),
  async (c) => {
    const userId = c.get('userId')!;
    const data = c.get('validatedBody') as UpdateProfileInput;
    const user = await authService.updateProfile(userId, data);
    return c.json(user);
  },
);

auth.patch(
  '/auth/me/password',
  authMiddleware,
  doubleSubmitCsrf,
  validate('json', changePasswordSchema),
  async (c) => {
    const userId = c.get('userId')!;
    const session = c.get('session')!;
    const data = c.get('validatedBody') as ChangePasswordInput;
    await authService.changePassword(userId, session.id, data);
    return c.json({ message: 'Password changed successfully' });
  },
);

auth.delete(
  '/auth/me',
  authMiddleware,
  doubleSubmitCsrf,
  validate('json', deleteAccountSchema),
  async (c) => {
    const userId = c.get('userId')!;
    const data = c.get('validatedBody') as DeleteAccountInput;
    await authService.deleteAccount(userId, data);

    const blankCookie = (await import('../lib/lucia')).lucia.createBlankSessionCookie();
    c.header('Set-Cookie', blankCookie.serialize(), { append: true });
    return c.body(null, 204);
  },
);

export default auth;
