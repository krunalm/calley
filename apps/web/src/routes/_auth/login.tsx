import { createFileRoute, useSearch } from '@tanstack/react-router';

import { LoginForm } from '@/components/auth/LoginForm';

export const Route = createFileRoute('/_auth/login')({
  component: LoginPage,
});

/**
 * Human-readable messages for the `?error=` values the OAuth callbacks append
 * when a provider sign-in cannot complete. Without these the user landed back
 * on a bare login form with no explanation at all.
 */
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: 'Sign-in with the provider failed. Please try again.',
  oauth_no_email:
    'That account does not expose a verified email address. Add one on the provider and try again.',
  oauth_email_exists:
    'An account with this email already exists. Sign in with your password, then connect the provider from Settings → Profile.',
  oauth_link_failed: 'Your session expired while connecting the account. Please sign in again.',
};

function LoginPage() {
  const search = useSearch({ strict: false }) as { error?: string };
  const oauthError = search.error ? OAUTH_ERROR_MESSAGES[search.error] : undefined;

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
        <p className="text-sm text-[var(--muted-foreground)]">Sign in to your account</p>
      </div>

      {oauthError && (
        <p
          role="alert"
          className="rounded-[var(--radius)] border border-[var(--destructive)]/40 px-4 py-3 text-sm text-[var(--destructive)]"
        >
          {oauthError}
        </p>
      )}

      <LoginForm />
    </div>
  );
}
