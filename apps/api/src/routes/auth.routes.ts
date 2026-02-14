import { generateCodeVerifier, generateState } from 'arctic';
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
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

import { clearCsrfCookie, generateCsrfToken, setCsrfCookie } from '../lib/csrf';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { githubOAuth, googleOAuth } from '../lib/oauth';
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

// ─── Helpers ──────────────────────────────────────────────────────────

/** Extract client IP address from request headers. */
function getIpAddress(c: { req: { header: (name: string) => string | undefined } }): string | null {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || null
  );
}

// ─── Public Routes (no auth required) ──────────────────────────────────

auth.post(
  '/auth/signup',
  rateLimit({ limit: 3, windowSeconds: 3600, keyPrefix: 'auth:signup' }),
  doubleSubmitCsrf,
  validate('json', signupSchema),
  async (c) => {
    const data = c.get('validatedBody') as SignupInput;
    const userAgent = c.req.header('user-agent') ?? null;
    const ipAddress = getIpAddress(c);

    const { user, cookie } = await authService.signup(data, { userAgent, ipAddress });

    // Set session cookie
    c.header('Set-Cookie', cookie.serialize(), { append: true });

    // Set CSRF cookie for subsequent requests
    const csrfToken = generateCsrfToken();
    setCsrfCookie(c, csrfToken);

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
    const ipAddress = getIpAddress(c);

    const { user, cookie } = await authService.login(data, { userAgent, ipAddress });

    // Set session cookie
    c.header('Set-Cookie', cookie.serialize(), { append: true });

    // Set CSRF cookie for subsequent requests
    const csrfToken = generateCsrfToken();
    setCsrfCookie(c, csrfToken);

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
    const userId = c.get('userId')!;
    const userAgent = c.req.header('user-agent') ?? null;
    const ipAddress = getIpAddress(c);

    const { cookie } = await authService.logout(session.id, userId, { userAgent, ipAddress });

    c.header('Set-Cookie', cookie.serialize(), { append: true });

    // Clear the CSRF cookie on logout
    clearCsrfCookie(c);

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
    const userAgent = c.req.header('user-agent') ?? null;
    const ipAddress = getIpAddress(c);

    await authService.changePassword(userId, session.id, data, { userAgent, ipAddress });
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
    const userAgent = c.req.header('user-agent') ?? null;
    const ipAddress = getIpAddress(c);

    await authService.deleteAccount(userId, data, { userAgent, ipAddress });

    const blankCookie = (await import('../lib/lucia')).lucia.createBlankSessionCookie();
    c.header('Set-Cookie', blankCookie.serialize(), { append: true });

    // Clear the CSRF cookie
    clearCsrfCookie(c);

    return c.body(null, 204);
  },
);

// ─── Session Management (§1.8) ──────────────────────────────────────

/**
 * GET /auth/sessions — List all active sessions for the current user.
 * Returns session info with a `isCurrent` flag for the active session.
 */
auth.get('/auth/sessions', authMiddleware, async (c) => {
  const userId = c.get('userId')!;
  const session = c.get('session')!;

  const sessions = await authService.listSessions(userId, session.id);
  return c.json(sessions);
});

/**
 * DELETE /auth/sessions/:id — Revoke a specific session.
 * Cannot revoke the current session (use logout instead).
 */
auth.delete('/auth/sessions/:id', authMiddleware, doubleSubmitCsrf, async (c) => {
  const userId = c.get('userId')!;
  const session = c.get('session')!;
  const targetSessionId = c.req.param('id');

  await authService.revokeSession(userId, session.id, targetSessionId);
  return c.body(null, 204);
});

/**
 * DELETE /auth/sessions — Revoke all sessions except the current one.
 */
auth.delete('/auth/sessions', authMiddleware, doubleSubmitCsrf, async (c) => {
  const userId = c.get('userId')!;
  const session = c.get('session')!;

  const result = await authService.revokeAllOtherSessions(userId, session.id);
  return c.json({
    message: `Revoked ${result.revokedCount} session(s)`,
    revokedCount: result.revokedCount,
  });
});

// ─── OAuth Constants & Schemas ────────────────────────────────────────

const OAUTH_STATE_COOKIE_MAX_AGE = 10 * 60; // 10 minutes
const FRONTEND_URL = process.env.CORS_ORIGIN || 'http://localhost:5173';

/**
 * Zod schema for OAuth callback query parameters.
 * Both Google and GitHub return `code` and `state` on successful authorization.
 */
const oauthCallbackQuerySchema = z.object({
  code: z.string().min(1, 'Authorization code is required').max(2048),
  state: z.string().min(1, 'State parameter is required').max(512),
});

/**
 * Helper to set short-lived OAuth cookies for state and code verifier.
 * Cookies are HttpOnly, scoped to the OAuth callback path, and expire after 10 minutes.
 */
function setOAuthCookie(c: Parameters<typeof setCookie>[0], name: string, value: string): void {
  setCookie(c, name, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/auth/oauth',
    maxAge: OAUTH_STATE_COOKIE_MAX_AGE,
  });
}

// ─── Google OAuth ─────────────────────────────────────────────────────

/**
 * GET /auth/oauth/google
 * Initiates Google OAuth flow.
 * Generates state + PKCE code verifier, stores in cookies, redirects to Google.
 *
 * Rate limited: 10 initiations per 15 minutes per IP to prevent abuse.
 */
auth.get(
  '/auth/oauth/google',
  rateLimit({ limit: 10, windowSeconds: 900, keyPrefix: 'auth:oauth:google' }),
  async (c) => {
    const state = generateState();
    const codeVerifier = generateCodeVerifier();

    const url = googleOAuth.createAuthorizationURL(state, codeVerifier, [
      'openid',
      'profile',
      'email',
    ]);

    setOAuthCookie(c, 'google_oauth_state', state);
    setOAuthCookie(c, 'google_oauth_code_verifier', codeVerifier);

    return c.redirect(url.toString());
  },
);

/**
 * GET /auth/oauth/google/callback
 * Handles Google OAuth callback.
 * Verifies state, exchanges code for tokens, fetches profile, creates/links account.
 *
 * CSRF: Standard double-submit CSRF is not used here because OAuth callbacks are
 * browser-initiated redirects from the provider (no custom headers possible).
 * Instead, CSRF is mitigated via the `state` parameter — a cryptographically random
 * value generated by `generateState()`, stored in an HttpOnly SameSite=Lax cookie,
 * and verified against the query parameter returned by Google. This is the
 * OAuth 2.0-standard CSRF protection mechanism (RFC 6749 §10.12).
 *
 * Rate limited: 10 callbacks per 15 minutes per IP.
 */
auth.get(
  '/auth/oauth/google/callback',
  rateLimit({ limit: 10, windowSeconds: 900, keyPrefix: 'auth:oauth:google:cb' }),
  validate('query', oauthCallbackQuerySchema),
  async (c) => {
    const { code, state } = c.get('validatedQuery') as z.infer<typeof oauthCallbackQuerySchema>;
    const storedState = getCookie(c, 'google_oauth_state');
    const storedCodeVerifier = getCookie(c, 'google_oauth_code_verifier');

    // Verify OAuth state cookie matches the state returned by the provider
    if (!storedState || !storedCodeVerifier || state !== storedState) {
      logger.warn({ storedState: !!storedState }, 'Google OAuth: state mismatch');
      return c.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
    }

    try {
      // Exchange code for tokens
      const tokens = await googleOAuth.validateAuthorizationCode(code, storedCodeVerifier);
      const accessToken = tokens.accessToken();

      // Fetch user profile from Google
      const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        logger.error({ status: response.status }, 'Google OAuth: failed to fetch user profile');
        return c.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
      }

      const googleProfile = (await response.json()) as {
        sub: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
        picture?: string;
      };

      // Only use verified emails from Google
      const email = googleProfile.email_verified ? (googleProfile.email ?? null) : null;

      const userAgent = c.req.header('user-agent') ?? null;
      const ipAddress = getIpAddress(c);

      const { cookie } = await authService.handleOAuthCallback(
        'google',
        {
          providerAccountId: googleProfile.sub,
          email,
          name: googleProfile.name || '',
          avatarUrl: googleProfile.picture || null,
        },
        { userAgent, ipAddress },
      );

      c.header('Set-Cookie', cookie.serialize(), { append: true });

      // Set CSRF cookie for subsequent requests
      const csrfToken = generateCsrfToken();
      setCsrfCookie(c, csrfToken);

      return c.redirect(`${FRONTEND_URL}/calendar`);
    } catch (err) {
      if (err instanceof AppError) {
        logger.warn({ code: err.code, message: err.message }, 'Google OAuth: handled error');
        return c.redirect(`${FRONTEND_URL}/login?error=oauth_no_email`);
      }
      logger.error({ err }, 'Google OAuth: unexpected error during callback');
      return c.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
    }
  },
);

// ─── GitHub OAuth ─────────────────────────────────────────────────────

/**
 * GET /auth/oauth/github
 * Initiates GitHub OAuth flow.
 * Generates state, stores in cookie, redirects to GitHub.
 *
 * Rate limited: 10 initiations per 15 minutes per IP.
 */
auth.get(
  '/auth/oauth/github',
  rateLimit({ limit: 10, windowSeconds: 900, keyPrefix: 'auth:oauth:github' }),
  async (c) => {
    const state = generateState();

    const url = githubOAuth.createAuthorizationURL(state, ['user:email']);

    setOAuthCookie(c, 'github_oauth_state', state);

    return c.redirect(url.toString());
  },
);

/**
 * GET /auth/oauth/github/callback
 * Handles GitHub OAuth callback.
 * Verifies state, exchanges code for tokens, fetches profile + email, creates/links account.
 *
 * CSRF: Same as Google callback — the `state` parameter serves as the CSRF token.
 * See the Google callback comment for the full explanation (RFC 6749 §10.12).
 *
 * Rate limited: 10 callbacks per 15 minutes per IP.
 */
auth.get(
  '/auth/oauth/github/callback',
  rateLimit({ limit: 10, windowSeconds: 900, keyPrefix: 'auth:oauth:github:cb' }),
  validate('query', oauthCallbackQuerySchema),
  async (c) => {
    const { code, state } = c.get('validatedQuery') as z.infer<typeof oauthCallbackQuerySchema>;
    const storedState = getCookie(c, 'github_oauth_state');

    // Verify OAuth state cookie matches the state returned by the provider
    if (!storedState || state !== storedState) {
      logger.warn({ storedState: !!storedState }, 'GitHub OAuth: state mismatch');
      return c.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
    }

    try {
      // Exchange code for tokens
      const tokens = await githubOAuth.validateAuthorizationCode(code);
      const accessToken = tokens.accessToken();

      // Fetch user profile from GitHub
      const [userResponse, emailsResponse] = await Promise.all([
        fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'Calley-App',
          },
        }),
        fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'Calley-App',
          },
        }),
      ]);

      if (!userResponse.ok) {
        logger.error({ status: userResponse.status }, 'GitHub OAuth: failed to fetch user profile');
        return c.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
      }

      const githubUser = (await userResponse.json()) as {
        id: number;
        login: string;
        name: string | null;
        avatar_url: string;
      };

      // Determine the primary verified email
      let email: string | null = null;

      if (emailsResponse.ok) {
        const emails = (await emailsResponse.json()) as Array<{
          email: string;
          primary: boolean;
          verified: boolean;
        }>;

        // Prefer the primary verified email
        const primaryEmail = emails.find((e) => e.primary && e.verified);
        // Fall back to any verified email
        const verifiedEmail = primaryEmail || emails.find((e) => e.verified);

        email = verifiedEmail?.email ?? null;
      }

      const userAgent = c.req.header('user-agent') ?? null;
      const ipAddress = getIpAddress(c);

      const { cookie } = await authService.handleOAuthCallback(
        'github',
        {
          providerAccountId: String(githubUser.id),
          email,
          name: githubUser.name || githubUser.login,
          avatarUrl: githubUser.avatar_url || null,
        },
        { userAgent, ipAddress },
      );

      c.header('Set-Cookie', cookie.serialize(), { append: true });

      // Set CSRF cookie for subsequent requests
      const csrfToken = generateCsrfToken();
      setCsrfCookie(c, csrfToken);

      return c.redirect(`${FRONTEND_URL}/calendar`);
    } catch (err) {
      if (err instanceof AppError) {
        logger.warn({ code: err.code, message: err.message }, 'GitHub OAuth: handled error');
        return c.redirect(`${FRONTEND_URL}/login?error=oauth_no_email`);
      }
      logger.error({ err }, 'GitHub OAuth: unexpected error during callback');
      return c.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
    }
  },
);

export default auth;
