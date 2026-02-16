import {
  closestCenter,
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { CheckSquare, ListChecks, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { TaskPanelSkeleton } from '@/components/skeletons/CalendarSkeletons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useBulkCompleteTasks,
  useBulkDeleteTasks,
  useReorderTasks,
} from '@/hooks/use-task-mutations';
import { useGroupedTasks } from '@/hooks/use-tasks';
import { useCalendarStore } from '@/stores/calendar-store';
import { useTaskSelectionStore } from '@/stores/task-selection-store';
import { useUIStore } from '@/stores/ui-store';

import { TaskFilter } from './TaskFilter';
import { TaskGroup } from './TaskGroup';

import type { TaskFilter as TaskFilterType } from '@/types/filters';
import type { Task } from '@calley/shared';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';

export function TaskPanel() {
  const isOpen = useCalendarStore((s) => s.isTaskPanelOpen);
  const toggleTaskPanel = useCalendarStore((s) => s.toggleTaskPanel);
  const openTaskDrawer = useUIStore((s) => s.openTaskDrawer);

  const [showCompleted, setShowCompleted] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState('all');

  // Selection state
  const isSelecting = useTaskSelectionStore((s) => s.isSelecting);
  const selectedIds = useTaskSelectionStore((s) => s.selectedIds);
  const toggleSelecting = useTaskSelectionStore((s) => s.toggleSelecting);
  const exitSelecting = useTaskSelectionStore((s) => s.exitSelecting);
  const toggleTaskSelect = useTaskSelectionStore((s) => s.toggleTask);
  const selectAll = useTaskSelectionStore((s) => s.selectAll);
  const clearSelection = useTaskSelectionStore((s) => s.clearSelection);

  // Bulk confirm delete dialog
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Mutations
  const reorderTasks = useReorderTasks();
  const bulkComplete = useBulkCompleteTasks();
  const bulkDelete = useBulkDeleteTasks();

  // DnD state
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // Build filters
  const filters = useMemo<TaskFilterType>(() => {
    const f: TaskFilterType = { sort: 'sort_order' };
    if (priorityFilter !== 'all') {
      f.priority = [priorityFilter];
    }
    return f;
  }, [priorityFilter]);

  const { grouped, isLoading } = useGroupedTasks(filters);

  // All non-completed task IDs for "select all"
  const allTaskIds = useMemo(
    () => [
      ...grouped.overdue.map((t) => t.id),
      ...grouped.today.map((t) => t.id),
      ...grouped.upcoming.map((t) => t.id),
      ...grouped.noDate.map((t) => t.id),
    ],
    [grouped],
  );

  // Configure DnD sensors
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 5 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 5 },
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  const handleNewTask = useCallback(() => {
    openTaskDrawer();
  }, [openTaskDrawer]);

  // DnD handlers for sortable reorder within groups
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as { task: Task; type: string } | undefined;
    if (data?.task) {
      setActiveTask(data.task);
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveTask(null);

      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeData = active.data.current as { task: Task; type: string } | undefined;
      if (activeData?.type !== 'task-reorder') return;

      // Find which group both items are in and compute new order
      const allGroups = [grouped.today, grouped.overdue, grouped.upcoming, grouped.noDate];

      for (const groupTasks of allGroups) {
        const oldIndex = groupTasks.findIndex((t) => t.id === active.id);
        const newIndex = groupTasks.findIndex((t) => t.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
          const reordered = arrayMove(groupTasks, oldIndex, newIndex);
          reorderTasks.mutate(reordered.map((t) => t.id));
          break;
        }
      }
    },
    [grouped, reorderTasks],
  );

  // Bulk action handlers
  const handleBulkComplete = useCallback(() => {
    if (selectedIds.size === 0) return;
    bulkComplete.mutate(Array.from(selectedIds), {
      onSuccess: () => exitSelecting(),
    });
  }, [selectedIds, bulkComplete, exitSelecting]);

  const handleBulkDeleteConfirm = useCallback(() => {
    if (selectedIds.size === 0) return;
    bulkDelete.mutate(Array.from(selectedIds), {
      onSuccess: () => {
        exitSelecting();
        setShowDeleteConfirm(false);
      },
    });
  }, [selectedIds, bulkDelete, exitSelecting]);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === allTaskIds.length) {
      clearSelection();
    } else {
      selectAll(allTaskIds);
    }
  }, [selectedIds.size, allTaskIds, clearSelection, selectAll]);

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
          {/* Multi-select toggle */}
          <Button
            variant={isSelecting ? 'default' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            onClick={toggleSelecting}
            aria-label={isSelecting ? 'Exit select mode' : 'Enter select mode'}
            aria-pressed={isSelecting}
          >
            <ListChecks className="h-4 w-4" />
          </Button>
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

      {/* Selection toolbar (shown when selecting) */}
      {isSelecting && (
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--primary)_5%,transparent)] px-3 py-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-xs text-[var(--primary)] hover:underline"
              onClick={handleSelectAll}
            >
              {selectedIds.size === allTaskIds.length ? 'Deselect all' : 'Select all'}
            </button>
            <span className="text-xs text-[var(--muted-foreground)]">
              {selectedIds.size} selected
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-[var(--color-success,#3a6b5c)]"
              onClick={handleBulkComplete}
              disabled={selectedIds.size === 0}
              aria-label="Complete selected tasks"
            >
              <CheckSquare className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-[var(--color-danger,#c0392b)]"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={selectedIds.size === 0}
              aria-label="Delete selected tasks"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

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
          <TaskPanelSkeleton />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <TaskGroup
              label="Overdue"
              tasks={grouped.overdue}
              variant="overdue"
              isSelecting={isSelecting}
              selectedIds={selectedIds}
              onToggleSelect={toggleTaskSelect}
            />
            <TaskGroup
              label="Today"
              tasks={grouped.today}
              sortable
              isSelecting={isSelecting}
              selectedIds={selectedIds}
              onToggleSelect={toggleTaskSelect}
            />
            <TaskGroup
              label="Upcoming"
              tasks={grouped.upcoming}
              isSelecting={isSelecting}
              selectedIds={selectedIds}
              onToggleSelect={toggleTaskSelect}
            />
            <TaskGroup
              label="No date"
              tasks={grouped.noDate}
              sortable
              isSelecting={isSelecting}
              selectedIds={selectedIds}
              onToggleSelect={toggleTaskSelect}
            />
            {showCompleted && (
              <TaskGroup
                label="Completed"
                tasks={grouped.completed}
                defaultExpanded={false}
                variant="completed"
                isSelecting={isSelecting}
                selectedIds={selectedIds}
                onToggleSelect={toggleTaskSelect}
              />
            )}

            {/* DnD overlay for reorder */}
            <DragOverlay dropAnimation={null}>
              {activeTask && (
                <div
                  className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs font-medium shadow-[var(--shadow-md)]"
                  style={{ opacity: 0.85, maxWidth: 250 }}
                >
                  {activeTask.title}
                </div>
              )}
            </DragOverlay>

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
          </DndContext>
        )}
      </div>

      {/* Bulk delete confirmation dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Delete {selectedIds.size} task{selectedIds.size !== 1 ? 's' : ''}?
            </DialogTitle>
            <DialogDescription>
              This will delete the selected tasks. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkDeleteConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
