import { Plus, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useGroupedTasks } from '@/hooks/use-tasks';
import { useCalendarStore } from '@/stores/calendar-store';
import { useUIStore } from '@/stores/ui-store';

import { TaskFilter } from './TaskFilter';
import { TaskGroup } from './TaskGroup';

import type { TaskFilter as TaskFilterType } from '@/types/filters';

export function TaskPanel() {
  const isOpen = useCalendarStore((s) => s.isTaskPanelOpen);
  const toggleTaskPanel = useCalendarStore((s) => s.toggleTaskPanel);
  const openTaskDrawer = useUIStore((s) => s.openTaskDrawer);

  const [showCompleted, setShowCompleted] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState('all');

  // Build filters
  const filters = useMemo<TaskFilterType>(() => {
    const f: TaskFilterType = { sort: 'sort_order' };
    if (priorityFilter !== 'all') {
      f.priority = [priorityFilter];
    }
    return f;
  }, [priorityFilter]);

  const { grouped, isLoading } = useGroupedTasks(filters);

  const handleNewTask = useCallback(() => {
    openTaskDrawer();
  }, [openTaskDrawer]);

  if (!isOpen) return null;

  return (
    <aside
      className="flex h-full w-[300px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--background)] max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-[var(--z-modal)] max-lg:w-full max-lg:max-w-[400px] max-lg:shadow-lg sm:max-lg:w-[360px]"
      role="complementary"
      aria-label="Task panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2.5">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">Tasks</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleNewTask}
            aria-label="Create new task"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={toggleTaskPanel}
            aria-label="Close task panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="pt-2">
        <TaskFilter
          showCompleted={showCompleted}
          onShowCompletedChange={setShowCompleted}
          priorityFilter={priorityFilter}
          onPriorityFilterChange={setPriorityFilter}
        />
      </div>

      {/* Task Groups */}
      <div className="flex-1 overflow-y-auto px-1">
        {isLoading ? (
          <div className="space-y-3 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-8 animate-pulse rounded-[var(--radius)] bg-[var(--muted)]"
              />
            ))}
          </div>
        ) : (
          <>
            <TaskGroup label="Overdue" tasks={grouped.overdue} variant="overdue" />
            <TaskGroup label="Today" tasks={grouped.today} />
            <TaskGroup label="Upcoming" tasks={grouped.upcoming} />
            <TaskGroup label="No date" tasks={grouped.noDate} />
            {showCompleted && (
              <TaskGroup
                label="Completed"
                tasks={grouped.completed}
                defaultExpanded={false}
                variant="completed"
              />
            )}

            {/* Empty state */}
            {!grouped.overdue.length &&
              !grouped.today.length &&
              !grouped.upcoming.length &&
              !grouped.noDate.length && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-[var(--muted-foreground)]">No tasks yet</p>
                  <Button variant="link" className="mt-1 text-sm" onClick={handleNewTask}>
                    Add a task
                  </Button>
                </div>
              )}
          </>
        )}
      </div>
    </aside>
  );
}
