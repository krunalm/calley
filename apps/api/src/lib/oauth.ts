import { GitHub, Google } from 'arctic';

import { logger } from './logger';

// ─── Google OAuth ────────────────────────────────────────────────────

const googleClientId = process.env.GOOGLE_CLIENT_ID ?? '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';
const googleRedirectUri =
  process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:4000/api/v1/auth/oauth/google/callback';

if (!googleClientId || !googleClientSecret) {
  logger.warn('Google OAuth credentials not configured — Google login will be unavailable');
}

export const googleOAuth = new Google(googleClientId, googleClientSecret, googleRedirectUri);

/** Whether Google OAuth has been fully configured with credentials. */
export const isGoogleOAuthConfigured = !!(googleClientId && googleClientSecret);

// ─── GitHub OAuth ────────────────────────────────────────────────────

const githubClientId = process.env.GITHUB_CLIENT_ID ?? '';
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET ?? '';
const githubRedirectUri =
  process.env.GITHUB_REDIRECT_URI ?? 'http://localhost:4000/api/v1/auth/oauth/github/callback';

if (!githubClientId || !githubClientSecret) {
  logger.warn('GitHub OAuth credentials not configured — GitHub login will be unavailable');
}

export const githubOAuth = new GitHub(githubClientId, githubClientSecret, githubRedirectUri);

/** Whether GitHub OAuth has been fully configured with credentials. */
export const isGithubOAuthConfigured = !!(githubClientId && githubClientSecret);
