import { memo } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

import type { Task } from '@calley/shared';

interface TaskMarkerProps {
  task: Task;
  topPx: number;
  categoryColor?: string;
  onClick?: (task: Task) => void;
  onToggle?: (task: Task) => void;
}

export const TaskMarker = memo(function TaskMarker({
  task,
  topPx,
  categoryColor,
  onClick,
  onToggle,
}: TaskMarkerProps) {
  const isDone = task.status === 'done';
  const color = categoryColor ?? 'var(--primary)';

  return (
    <div
      className={cn(
        'absolute left-0 right-0 z-10 flex items-center gap-1 px-1',
        isDone && 'opacity-50',
      )}
      style={{ top: topPx }}
    >
      <Checkbox
        checked={isDone}
        onCheckedChange={() => onToggle?.(task)}
        className="h-3 w-3 shrink-0"
        aria-label={`Mark "${task.title}" as ${isDone ? 'incomplete' : 'complete'}`}
      />
      <button
        type="button"
        className={cn(
          'flex items-center gap-1 truncate rounded-[var(--radius-sm)] px-1 py-0.5 text-[10px] font-medium',
          isDone && 'line-through',
        )}
        style={{
          backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
          borderLeft: `2px solid ${color}`,
        }}
        onClick={() => onClick?.(task)}
        aria-label={`Task: ${task.title}`}
      >
        <span className="truncate">{task.title}</span>
      </button>
    </div>
  );
});
