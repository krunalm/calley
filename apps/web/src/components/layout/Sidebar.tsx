import { Calendar } from 'lucide-react';

import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useCalendarStore } from '@/stores/calendar-store';

import { CalendarList } from './CalendarList';
import { MiniCalendar } from './MiniCalendar';

import type { CalendarCategory } from '@calley/shared';

interface SidebarProps {
  categories: CalendarCategory[];
  onToggleCategoryVisibility?: (categoryId: string, visible: boolean) => void;
}

export function Sidebar({ categories, onToggleCategoryVisibility }: SidebarProps) {
  const { isSidebarOpen, toggleSidebar } = useCalendarStore();

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-[var(--z-modal-backdrop)] bg-black/20 lg:hidden"
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'z-[var(--z-modal)] flex shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-all duration-200 ease-in-out',
          // Mobile: fixed overlay
          'fixed inset-y-0 left-0 top-[60px] lg:relative lg:top-0',
          isSidebarOpen ? 'w-[240px]' : 'w-0 -translate-x-full lg:w-[60px] lg:translate-x-0',
        )}
        aria-label="Sidebar"
      >
        <div
          className={cn('flex-1 overflow-y-auto overflow-x-hidden', !isSidebarOpen && 'lg:hidden')}
        >
          <MiniCalendar />
          <Separator />
          <CalendarList categories={categories} onToggleVisibility={onToggleCategoryVisibility} />
        </div>

        {/* Collapsed icon rail (desktop only) */}
        {!isSidebarOpen && (
          <div className="hidden flex-col items-center gap-3 pt-4 lg:flex">
            <Calendar className="h-5 w-5 text-[var(--muted-foreground)]" />
          </div>
        )}
      </aside>
    </>
  );
}
