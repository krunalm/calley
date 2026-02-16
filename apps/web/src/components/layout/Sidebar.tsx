import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Calendar } from 'lucide-react';

import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useCalendarStore } from '@/stores/calendar-store';

import { CalendarList } from './CalendarList';
import { MiniCalendar } from './MiniCalendar';

import type { CalendarCategory } from '@calley/shared';

interface SidebarProps {
  categories: CalendarCategory[];
  onCreateCategory: (data: { name: string; color: string }) => void;
  onUpdateCategory: (categoryId: string, data: { name?: string; color?: string }) => void;
  onDeleteCategory: (categoryId: string) => void;
}

export function Sidebar({
  categories,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
}: SidebarProps) {
  const { isSidebarOpen, toggleSidebar, hiddenCategoryIds, toggleCategoryVisibility } =
    useCalendarStore();
  const prefersReducedMotion = useReducedMotion();

  return (
    <>
      {/* Mobile overlay backdrop */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            className="fixed inset-0 z-[var(--z-modal-backdrop)] bg-black/20 lg:hidden"
            onClick={toggleSidebar}
            aria-hidden="true"
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>

      <motion.aside
        className={cn(
          'z-[var(--z-modal)] flex shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] overflow-hidden',
          // Mobile: fixed overlay
          'fixed inset-y-0 left-0 top-[60px] lg:relative lg:top-0',
          !isSidebarOpen && '-translate-x-full lg:translate-x-0',
        )}
        animate={{
          width: isSidebarOpen
            ? 240
            : typeof window !== 'undefined' && window.innerWidth >= 1024
              ? 60
              : 0,
        }}
        transition={
          prefersReducedMotion ? { duration: 0 } : { duration: 0.2, ease: [0.16, 1, 0.3, 1] }
        }
        aria-label="Sidebar"
      >
        <div
          className={cn('flex-1 overflow-y-auto overflow-x-hidden', !isSidebarOpen && 'lg:hidden')}
        >
          <MiniCalendar />
          <Separator />
          <CalendarList
            categories={categories}
            hiddenCategoryIds={hiddenCategoryIds}
            onToggleVisibility={toggleCategoryVisibility}
            onCreateCategory={onCreateCategory}
            onUpdateCategory={onUpdateCategory}
            onDeleteCategory={onDeleteCategory}
          />
        </div>

        {/* Collapsed icon rail (desktop only) */}
        {!isSidebarOpen && (
          <div className="hidden flex-col items-center gap-3 pt-4 lg:flex">
            <Calendar className="h-5 w-5 text-[var(--muted-foreground)]" />
          </div>
        )}
      </motion.aside>
    </>
  );
}
