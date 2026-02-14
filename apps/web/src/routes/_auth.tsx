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
          }).then(async (res) => {
            if (res.status === 401 || res.status === 403) {
              throw new Error('Not authenticated');
            }
            if (!res.ok) {
              const text = await res.text().catch(() => 'Unknown server error');
              throw new Error(`Server error (${res.status}): ${text}`);
            }
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
      // Re-throw redirect errors and server errors
      throw err;
    }
  },
  component: AuthLayout,
});

export default function AuthLayout() {
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
