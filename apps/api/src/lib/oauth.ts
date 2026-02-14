import { GitHub, Google } from 'arctic';

// ─── Google OAuth ────────────────────────────────────────────────────

const googleClientId = process.env.GOOGLE_CLIENT_ID ?? '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';
const googleRedirectUri =
  process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:4000/api/v1/auth/oauth/google/callback';

export const googleOAuth = new Google(googleClientId, googleClientSecret, googleRedirectUri);

// ─── GitHub OAuth ────────────────────────────────────────────────────

const githubClientId = process.env.GITHUB_CLIENT_ID ?? '';
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET ?? '';
const githubRedirectUri =
  process.env.GITHUB_REDIRECT_URI ?? 'http://localhost:4000/api/v1/auth/oauth/github/callback';

export const githubOAuth = new GitHub(githubClientId, githubClientSecret, githubRedirectUri);
