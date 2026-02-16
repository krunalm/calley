import { Link, useMatchRoute } from '@tanstack/react-router';
import { Bell, Calendar, Monitor, UserIcon } from 'lucide-react';
import { memo } from 'react';

import { cn } from '@/lib/utils';

const navItems = [
  { to: '/settings/profile', label: 'Profile', icon: UserIcon },
  { to: '/settings/calendars', label: 'Calendars', icon: Calendar },
  { to: '/settings/notifications', label: 'Notifications', icon: Bell },
  { to: '/settings/sessions', label: 'Sessions', icon: Monitor },
] as const;

interface SettingsLayoutProps {
  children: React.ReactNode;
}

export const SettingsLayout = memo(function SettingsLayout({ children }: SettingsLayoutProps) {
  const matchRoute = useMatchRoute();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="mb-6 font-[var(--font-display)] text-2xl font-bold text-[var(--foreground)]">
        Settings
      </h1>

      <div className="flex flex-col gap-6 sm:flex-row">
        {/* Sidebar Navigation */}
        <nav className="w-full shrink-0 sm:w-48" aria-label="Settings navigation">
          <ul className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-x-visible">
            {navItems.map(({ to, label, icon: Icon }) => {
              const isActive = matchRoute({ to, fuzzy: true });
              return (
                <li key={to}>
                  <Link
                    to={to}
                    className={cn(
                      'flex items-center gap-2 whitespace-nowrap rounded-[var(--radius)] px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-[var(--accent-ui)] text-[var(--foreground)]'
                        : 'text-[var(--muted-foreground)] hover:bg-[var(--accent-ui)] hover:text-[var(--foreground)]',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Content */}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
});
