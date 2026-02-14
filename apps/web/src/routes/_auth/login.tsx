import { createFileRoute } from '@tanstack/react-router';

import { LoginForm } from '@/components/auth/LoginForm';

export const Route = createFileRoute('/_auth/login')({
  component: LoginPage,
});

function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
        <p className="text-sm text-[var(--muted-foreground)]">Sign in to your account</p>
      </div>
      <LoginForm />
    </div>
  );
}
