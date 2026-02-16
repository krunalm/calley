import { createRootRoute, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FullPageLoader } from '@/components/FullPageLoader';
import { AriaLiveRegion } from '@/components/ui/aria-live-region';
import { Toaster } from '@/components/ui/Toast';

export const Route = createRootRoute({
  component: RootComponent,
  pendingComponent: FullPageLoader,
});

function RootComponent() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<FullPageLoader />}>
        <Outlet />
      </Suspense>
      <Toaster position="top-right" duration={4000} />
      <AriaLiveRegion />
    </ErrorBoundary>
  );
}
