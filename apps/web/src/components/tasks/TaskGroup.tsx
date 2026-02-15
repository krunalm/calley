import { ChevronDown, ChevronRight } from 'lucide-react';
import { memo, useState } from 'react';

import { TaskItem } from './TaskItem';

import type { Task } from '@calley/shared';

interface TaskGroupProps {
  label: string;
  tasks: Task[];
  defaultExpanded?: boolean;
  variant?: 'default' | 'overdue' | 'completed';
}

export const TaskGroup = memo(function TaskGroup({
  label,
  tasks,
  defaultExpanded = true,
  variant = 'default',
}: TaskGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (tasks.length === 0) return null;

  const labelColorClass =
    variant === 'overdue'
      ? 'text-[var(--color-danger,#c0392b)]'
      : variant === 'completed'
        ? 'text-[var(--muted-foreground)]'
        : 'text-[var(--foreground)]';

  return (
    <div className="py-1" role="group" aria-label={`${label} tasks`}>
      {/* Group Header */}
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
        )}
        <span className={`text-xs font-semibold uppercase tracking-wide ${labelColorClass}`}>
          {label}
        </span>
        <span className="text-xs text-[var(--muted-foreground)]">{tasks.length}</span>
      </button>

      {/* Task List */}
      {expanded && (
        <div role="list" className="mt-0.5">
          {tasks.map((task) => (
            <TaskItem key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
});
