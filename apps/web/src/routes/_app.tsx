import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { useCategories } from '@/hooks/use-categories';
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
  const { data: categories = [] } = useCategories();

  return (
    <div className="flex h-screen flex-col">
      {/* Skip navigation link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[var(--z-toast)] focus:rounded-[var(--radius)] focus:bg-[var(--surface)] focus:px-4 focus:py-2 focus:shadow-[var(--shadow-md)]"
      >
        Skip to main content
      </a>

      <Topbar />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar categories={categories} />

        <main id="main-content" className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
