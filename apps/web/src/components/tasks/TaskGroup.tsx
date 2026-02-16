import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { memo, useMemo, useState } from 'react';

import { taskCheckOffVariants } from '@/lib/motion';

import { SortableTaskItem } from './SortableTaskItem';
import { TaskItem } from './TaskItem';

import type { Task } from '@calley/shared';

interface TaskGroupProps {
  label: string;
  tasks: Task[];
  defaultExpanded?: boolean;
  variant?: 'default' | 'overdue' | 'completed';
  /** Enable sortable drag-to-reorder within this group */
  sortable?: boolean;
  /** Multi-select mode props */
  isSelecting?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (taskId: string) => void;
}

export const TaskGroup = memo(function TaskGroup({
  label,
  tasks,
  defaultExpanded = true,
  variant = 'default',
  sortable = false,
  isSelecting,
  selectedIds,
  onToggleSelect,
}: TaskGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const prefersReducedMotion = useReducedMotion();

  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);

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
          {sortable && !isSelecting ? (
            <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
              <AnimatePresence initial={false}>
                {tasks.map((task) => (
                  <motion.div
                    key={task.id}
                    variants={prefersReducedMotion ? undefined : taskCheckOffVariants}
                    initial={prefersReducedMotion ? false : 'initial'}
                    animate="animate"
                    exit={prefersReducedMotion ? undefined : 'exit'}
                    layout={!prefersReducedMotion}
                  >
                    <SortableTaskItem
                      task={task}
                      isSelecting={isSelecting}
                      isSelected={selectedIds?.has(task.id)}
                      onToggleSelect={onToggleSelect}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </SortableContext>
          ) : (
            <AnimatePresence initial={false}>
              {tasks.map((task) => (
                <motion.div
                  key={task.id}
                  variants={prefersReducedMotion ? undefined : taskCheckOffVariants}
                  initial={prefersReducedMotion ? false : 'initial'}
                  animate="animate"
                  exit={prefersReducedMotion ? undefined : 'exit'}
                  layout={!prefersReducedMotion}
                >
                  <TaskItem
                    task={task}
                    isSelecting={isSelecting}
                    isSelected={selectedIds?.has(task.id)}
                    onToggleSelect={onToggleSelect}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      )}
    </div>
  );
});
