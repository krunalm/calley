import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { queryKeys } from '@/lib/query-keys';

import type { QueryClient } from '@tanstack/react-query';

export const Route = createFileRoute('/_auth')({
  beforeLoad: async ({ context }) => {
    const { queryClient } = context as { queryClient: QueryClient };
    try {
      await queryClient.ensureQueryData({
        queryKey: queryKeys.user.me,
        queryFn: () =>
          fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/auth/me`, {
            credentials: 'include',
          }).then((res) => {
            if (!res.ok) throw new Error('Not authenticated');
            return res.json();
          }),
        staleTime: 5 * 60 * 1000,
      });
      // User is authenticated — redirect to calendar
      throw redirect({ to: '/calendar' });
    } catch (err) {
      if (err instanceof Error && err.message === 'Not authenticated') {
        // User is NOT authenticated — allow access to auth pages
        return;
      }
      // Re-throw redirect errors
      throw err;
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-[var(--font-display)] text-3xl font-bold text-[var(--foreground)]">
            Calley
          </h1>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow-sm)]">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
