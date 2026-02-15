import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { memo } from 'react';

import { TaskItem } from './TaskItem';

import type { Task } from '@calley/shared';

interface SortableTaskItemProps {
  task: Task;
  isSelecting?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (taskId: string) => void;
}

export const SortableTaskItem = memo(function SortableTaskItem({
  task,
  isSelecting,
  isSelected,
  onToggleSelect,
}: SortableTaskItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task, type: 'task-reorder' },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative flex items-center">
      {/* Drag handle (visible on hover, not in select mode) */}
      {!isSelecting && (
        <button
          type="button"
          className="absolute -left-0.5 flex h-6 w-5 shrink-0 cursor-grab items-center justify-center opacity-0 transition-opacity group-hover/sortable:opacity-60 hover:!opacity-100 active:cursor-grabbing"
          aria-label={`Drag to reorder: ${task.title}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
        </button>
      )}

      <div className="group/sortable flex-1">
        <TaskItem
          task={task}
          isSelecting={isSelecting}
          isSelected={isSelected}
          onToggleSelect={onToggleSelect}
        />
      </div>
    </div>
  );
});
