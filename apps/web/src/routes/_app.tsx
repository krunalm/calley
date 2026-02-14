import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { queryKeys } from '@/lib/query-keys';

import type { QueryClient } from '@tanstack/react-query';

export const Route = createFileRoute('/_app')({
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
    } catch {
      throw redirect({ to: '/login' });
    }
  },
  component: AppLayout,
});

export default function AppLayout() {
  return (
    <div className="flex h-screen flex-col">
      {/* Topbar, Sidebar, etc. will be built in section 2.4 */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
