import { createFileRoute } from '@tanstack/react-router';

import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export const Route = createFileRoute('/_auth/forgot-password')({
  component: ForgotPasswordPage,
});

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Forgot password</h2>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
