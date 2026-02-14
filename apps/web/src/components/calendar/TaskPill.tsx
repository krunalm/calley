import { memo } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

import type { Task } from '@calley/shared';

interface TaskPillProps {
  task: Task;
  categoryColor?: string;
  onToggle?: (task: Task) => void;
  onClick?: (task: Task) => void;
}

export const TaskPill = memo(function TaskPill({
  task,
  categoryColor,
  onToggle,
  onClick,
}: TaskPillProps) {
  const isDone = task.status === 'done';
  const color = categoryColor ?? 'var(--primary)';

  return (
    <div
      className={cn(
        'flex w-full items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[11px] leading-tight',
        isDone && 'opacity-50',
      )}
      style={{ backgroundColor: `${color}10` }}
    >
      <Checkbox
        checked={isDone}
        onCheckedChange={() => onToggle?.(task)}
        className="h-3 w-3 shrink-0"
        aria-label={`Mark "${task.title}" as ${isDone ? 'incomplete' : 'complete'}`}
      />
      <button
        className={cn('flex-1 truncate text-left', isDone && 'line-through')}
        onClick={() => onClick?.(task)}
      >
        {task.title}
      </button>
    </div>
  );
});
