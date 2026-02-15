import { memo } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TaskFilterProps {
  showCompleted: boolean;
  onShowCompletedChange: (show: boolean) => void;
  priorityFilter: string;
  onPriorityFilterChange: (priority: string) => void;
}

export const TaskFilter = memo(function TaskFilter({
  showCompleted,
  onShowCompletedChange,
  priorityFilter,
  onPriorityFilterChange,
}: TaskFilterProps) {
  return (
    <div className="flex items-center gap-2 px-3 pb-2">
      {/* Priority filter */}
      <Select value={priorityFilter} onValueChange={onPriorityFilterChange}>
        <SelectTrigger className="h-7 w-auto min-w-[100px] text-xs">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All priorities</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="low">Low</SelectItem>
          <SelectItem value="none">No priority</SelectItem>
        </SelectContent>
      </Select>

      {/* Show completed toggle */}
      <button
        type="button"
        className={`rounded-[var(--radius)] px-2 py-1 text-xs transition-colors ${
          showCompleted
            ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
            : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--accent-ui)]'
        }`}
        onClick={() => onShowCompletedChange(!showCompleted)}
        aria-pressed={showCompleted}
      >
        {showCompleted ? 'Hide done' : 'Show done'}
      </button>
    </div>
  );
});
