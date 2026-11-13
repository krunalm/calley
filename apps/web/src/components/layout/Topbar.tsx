import { Menu, PanelRight, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useCalendarStore } from '@/stores/calendar-store';
import { useUIStore } from '@/stores/ui-store';

import { CreateButton } from './CreateButton';
import { DateNavigator } from './DateNavigator';
import { UserMenu } from './UserMenu';
import { ViewSwitcher } from './ViewSwitcher';

export function Topbar() {
  const { toggleSidebar, toggleTaskPanel, isTaskPanelOpen } = useCalendarStore();
  const { toggleSearch } = useUIStore();

  return (
    <header className="flex min-h-[60px] shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-1 sm:h-[60px] sm:flex-nowrap sm:py-0 sm:px-4">
      {/* Left: Hamburger + Logo */}
      <Button
        variant="ghost"
        size="icon"
        className="hit-target h-8 w-8 lg:hidden"
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="hit-target hidden h-8 w-8 lg:flex"
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <span className="hidden select-none font-display text-xl text-[var(--primary)] sm:inline">
        Calley
      </span>

      {/* Center: Date Navigation + View Switcher */}
      <div className="order-last flex w-full items-center justify-center gap-1 sm:order-none sm:w-auto sm:flex-1 sm:gap-4">
        <DateNavigator />
        <ViewSwitcher />
      </div>

      {/* Right: Actions */}
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="hit-target h-8 w-8"
          onClick={toggleSearch}
          aria-label="Search (Cmd+K)"
        >
          <Search className="h-4 w-4" />
        </Button>

        <CreateButton />

        <Button
          variant="ghost"
          size="icon"
          className="hit-target flex h-8 w-8"
          onClick={toggleTaskPanel}
          aria-label="Toggle task panel"
          data-active={isTaskPanelOpen || undefined}
        >
          <PanelRight className="h-4 w-4" />
        </Button>

        <UserMenu />
      </div>
    </header>
  );
}
