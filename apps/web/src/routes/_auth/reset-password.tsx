import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

const searchSchema = z.object({
  token: z.string().catch(''),
});

export const Route = createFileRoute('/_auth/reset-password')({
  validateSearch: searchSchema,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Invalid link</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          This password reset link is invalid or has expired. Please request a new one.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Reset password</h2>
      </div>
      <ResetPasswordForm token={token} />
    </div>
  );
}
