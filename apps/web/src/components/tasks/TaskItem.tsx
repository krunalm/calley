import { format, isPast, isToday, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { Repeat } from 'lucide-react';
import { memo, useCallback } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { useCategories } from '@/hooks/use-categories';
import { useToggleTask } from '@/hooks/use-task-mutations';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { useUIStore } from '@/stores/ui-store';

import type { Task } from '@calley/shared';

const PRIORITY_COLORS: Record<string, string> = {
  high: 'var(--color-danger, #c0392b)',
  medium: 'var(--color-warning, #d4a017)',
  low: 'var(--color-success, #3a6b5c)',
  none: 'transparent',
};

interface TaskItemProps {
  task: Task;
}

export const TaskItem = memo(function TaskItem({ task }: TaskItemProps) {
  const toggleTask = useToggleTask();
  const openTaskDrawer = useUIStore((s) => s.openTaskDrawer);
  const userTimezone = useUserTimezone();
  const { data: categories = [] } = useCategories();

  const isDone = task.status === 'done';
  const isRecurring = !!task.rrule || !!task.recurringTaskId;

  const category = categories.find((c) => c.id === task.categoryId);
  const categoryColor = category?.color ?? '#94a3b8';

  const handleToggle = useCallback(() => {
    toggleTask.mutate(task.id);
  }, [toggleTask, task.id]);

  const handleClick = useCallback(() => {
    openTaskDrawer({ taskId: task.id });
  }, [openTaskDrawer, task.id]);

  // Format due date display
  let dueDateLabel = '';
  let isOverdue = false;
  if (task.dueAt) {
    const zonedDue = toZonedTime(parseISO(task.dueAt), userTimezone);
    if (isToday(zonedDue)) {
      dueDateLabel = 'Today';
    } else {
      dueDateLabel = format(zonedDue, 'MMM d');
    }
    if (!isDone && isPast(zonedDue) && !isToday(zonedDue)) {
      isOverdue = true;
    }
  }

  return (
    <div
      className="group flex items-start gap-2.5 rounded-[var(--radius)] px-2 py-1.5 transition-colors hover:bg-[var(--accent-ui)]"
      role="listitem"
    >
      {/* Category color stripe */}
      <div
        className="mt-1 h-4 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: categoryColor }}
        aria-hidden="true"
      />

      {/* Checkbox */}
      <Checkbox
        checked={isDone}
        onCheckedChange={handleToggle}
        aria-label={`Mark "${task.title}" as ${isDone ? 'incomplete' : 'complete'}`}
        className="mt-0.5 shrink-0"
      />

      {/* Content */}
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={handleClick}
        aria-label={`Edit task: ${task.title}`}
      >
        <div className="flex items-center gap-1.5">
          {/* Priority indicator */}
          {task.priority !== 'none' && (
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
              title={`${task.priority} priority`}
              aria-label={`${task.priority} priority`}
            />
          )}

          {/* Title */}
          <span
            className={`truncate text-sm ${
              isDone
                ? 'text-[var(--muted-foreground)] line-through'
                : 'text-[var(--foreground)]'
            }`}
          >
            {task.title}
          </span>

          {/* Recurring indicator */}
          {isRecurring && (
            <Repeat
              className="h-3 w-3 shrink-0 text-[var(--muted-foreground)]"
              aria-label="Recurring task"
            />
          )}
        </div>

        {/* Due date badge */}
        {dueDateLabel && (
          <span
            className={`mt-0.5 inline-block text-xs ${
              isOverdue
                ? 'font-medium text-[var(--color-danger,#c0392b)]'
                : 'text-[var(--muted-foreground)]'
            }`}
          >
            {dueDateLabel}
          </span>
        )}
      </button>
    </div>
  );
});
