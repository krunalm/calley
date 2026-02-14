import { createFileRoute } from '@tanstack/react-router';

import { SignupForm } from '@/components/auth/SignupForm';

export const Route = createFileRoute('/_auth/signup')({
  component: SignupPage,
});

function SignupPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Create an account</h2>
        <p className="text-sm text-[var(--muted-foreground)]">Get started with Calley</p>
      </div>
      <SignupForm />
    </div>
  );
}
