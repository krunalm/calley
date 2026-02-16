import { createRootRoute, Outlet } from '@tanstack/react-router';

import { Toaster } from '@/components/ui/Toast';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <>
      <Outlet />
      <Toaster position="top-right" duration={4000} />
    </>
  );
}
