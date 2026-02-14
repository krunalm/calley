import { Hono } from 'hono';

import {
  changePasswordSchema,
  deleteAccountSchema,
  loginSchema,
  signupSchema,
  updateProfileSchema,
} from '@calley/shared';

import { authMiddleware } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rate-limit.middleware';
import { validate } from '../middleware/validate.middleware';
import { authService } from '../services/auth.service';

import type { AppVariables } from '../types/hono';
import type {
  ChangePasswordInput,
  DeleteAccountInput,
  LoginInput,
  SignupInput,
  UpdateProfileInput,
} from '@calley/shared';

const auth = new Hono<{ Variables: AppVariables }>();

// ─── Public Routes (no auth required) ──────────────────────────────────

auth.post(
  '/auth/signup',
  rateLimit({ limit: 3, windowSeconds: 3600, keyPrefix: 'auth:signup' }),
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

// ─── Authenticated Routes ──────────────────────────────────────────────

auth.post('/auth/logout', authMiddleware, async (c) => {
  const session = c.get('session')!;
  const { cookie } = await authService.logout(session.id);

  c.header('Set-Cookie', cookie.serialize(), { append: true });
  return c.body(null, 204);
});

auth.get('/auth/me', authMiddleware, async (c) => {
  const userId = c.get('userId')!;
  const user = await authService.getMe(userId);
  return c.json(user);
});

auth.patch('/auth/me', authMiddleware, validate('json', updateProfileSchema), async (c) => {
  const userId = c.get('userId')!;
  const data = c.get('validatedBody') as UpdateProfileInput;
  const user = await authService.updateProfile(userId, data);
  return c.json(user);
});

auth.patch(
  '/auth/me/password',
  authMiddleware,
  validate('json', changePasswordSchema),
  async (c) => {
    const userId = c.get('userId')!;
    const session = c.get('session')!;
    const data = c.get('validatedBody') as ChangePasswordInput;
    await authService.changePassword(userId, session.id, data);
    return c.json({ message: 'Password changed successfully' });
  },
);

auth.delete('/auth/me', authMiddleware, validate('json', deleteAccountSchema), async (c) => {
  const userId = c.get('userId')!;
  const data = c.get('validatedBody') as DeleteAccountInput;
  await authService.deleteAccount(userId, data);

  const blankCookie = (await import('../lib/lucia')).lucia.createBlankSessionCookie();
  c.header('Set-Cookie', blankCookie.serialize(), { append: true });
  return c.body(null, 204);
});

export default auth;
