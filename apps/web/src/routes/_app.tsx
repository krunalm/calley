import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { lazy, Suspense, useCallback, useState } from 'react';

import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '@/hooks/use-categories';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { queryKeys } from '@/lib/query-keys';

import type { QueryClient } from '@tanstack/react-query';

// Lazy load global overlays — they aren't needed until user interaction
const LazyEventDrawer = lazy(() =>
  import('@/components/calendar/EventDrawer').then((m) => ({ default: m.EventDrawer })),
);
const LazySearchModal = lazy(() =>
  import('@/components/search/SearchModal').then((m) => ({ default: m.SearchModal })),
);
const LazyKeyboardShortcutsHelp = lazy(() =>
  import('@/components/search/KeyboardShortcutsHelp').then((m) => ({
    default: m.KeyboardShortcutsHelp,
  })),
);

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
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);

  const handleToggleShortcutsHelp = useCallback(() => {
    setShortcutsHelpOpen((prev) => !prev);
  }, []);

  // Register global keyboard shortcuts
  useKeyboardShortcuts(handleToggleShortcutsHelp);

  const handleCreateCategory = useCallback(
    (data: { name: string; color: string }) => {
      createCategory.mutate(data);
    },
    [createCategory],
  );

  const handleUpdateCategory = useCallback(
    (categoryId: string, data: { name?: string; color?: string }) => {
      updateCategory.mutate({ categoryId, data });
    },
    [updateCategory],
  );

  const handleDeleteCategory = useCallback(
    (categoryId: string) => {
      deleteCategory.mutate(categoryId);
    },
    [deleteCategory],
  );

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
        <Sidebar
          categories={categories}
          onCreateCategory={handleCreateCategory}
          onUpdateCategory={handleUpdateCategory}
          onDeleteCategory={handleDeleteCategory}
        />

        <main id="main-content" className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* Global overlays — lazy loaded, rendered only when needed */}
      <Suspense fallback={null}>
        <LazyEventDrawer />
        <LazySearchModal />
        <LazyKeyboardShortcutsHelp open={shortcutsHelpOpen} onOpenChange={setShortcutsHelpOpen} />
      </Suspense>
    </div>
  );
}
