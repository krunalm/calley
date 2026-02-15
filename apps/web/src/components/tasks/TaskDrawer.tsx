import { zodResolver } from '@hookform/resolvers/zod';
import { format, parseISO } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

const LazyRecurrenceBuilderModal = lazy(() =>
  import('@/components/events/RecurrenceBuilder').then((m) => ({
    default: m.RecurrenceBuilderModal,
  })),
);
import { RecurrenceScopeDialog } from '@/components/calendar/RecurrenceScopeDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useCategories } from '@/hooks/use-categories';
import { useCreateTask, useDeleteTask, useUpdateTask } from '@/hooks/use-task-mutations';
import { useTask } from '@/hooks/use-tasks';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { useUIStore } from '@/stores/ui-store';

import type { EditScope } from '@calley/shared';

// ─── Form Schema ────────────────────────────────────────────────────

const taskFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(200, 'Title must be at most 200 characters'),
  description: z
    .string()
    .max(2000, 'Description must be at most 2000 characters')
    .optional(),
  dueDate: z.string().optional(),
  dueTime: z.string().optional(),
  priority: z.enum(['none', 'low', 'medium', 'high']),
  status: z.enum(['todo', 'in_progress', 'done']),
  categoryId: z.string().min(1, 'Category is required'),
  rrule: z.string().optional(),
  reminderMinutes: z.string().optional(),
});

type TaskFormValues = z.infer<typeof taskFormSchema>;

// ─── Recurrence Presets ─────────────────────────────────────────────

const RECURRENCE_PRESETS = [
  { value: '', label: 'Does not repeat' },
  { value: 'FREQ=DAILY', label: 'Daily' },
  { value: 'FREQ=WEEKLY', label: 'Weekly' },
  { value: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', label: 'Weekdays' },
  { value: 'FREQ=MONTHLY', label: 'Monthly' },
  { value: 'FREQ=YEARLY', label: 'Yearly' },
  { value: '_custom', label: 'Custom...' },
];

// ─── Reminder Presets ───────────────────────────────────────────────

const REMINDER_PRESETS = [
  { value: 'none', label: 'No reminder' },
  { value: '0', label: 'At due time' },
  { value: '5', label: '5 minutes before' },
  { value: '15', label: '15 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '1440', label: '1 day before' },
];

// ─── Priority Options ──────────────────────────────────────────────

const PRIORITY_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

// ─── Status Options ────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

// ─── Component ──────────────────────────────────────────────────────

export function TaskDrawer() {
  const {
    taskDrawer: { open, taskId, defaultDate },
    closeTaskDrawer,
  } = useUIStore();

  const userTimezone = useUserTimezone();
  const { data: categories = [] } = useCategories();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  // Fetch existing task data for edit mode
  const isEditMode = !!taskId;
  const { data: existingTask } = useTask(isEditMode && open ? taskId : null);

  const isRecurring = isEditMode && !!(existingTask?.rrule || existingTask?.recurringTaskId);

  // Scope dialog state for recurring tasks
  const [scopeDialog, setScopeDialog] = useState<{
    open: boolean;
    action: 'edit' | 'delete';
    pendingData?: TaskFormValues;
  }>({ open: false, action: 'edit' });

  // Recurrence builder modal state
  const [recurrenceBuilderOpen, setRecurrenceBuilderOpen] = useState(false);

  // Compute default values
  const getDefaults = useCallback((): TaskFormValues => {
    if (isEditMode && existingTask) {
      let dueDate = '';
      let dueTime = '';
      if (existingTask.dueAt) {
        const zonedDue = toZonedTime(parseISO(existingTask.dueAt), userTimezone);
        dueDate = format(zonedDue, 'yyyy-MM-dd');
        dueTime = format(zonedDue, 'HH:mm');
      }

      return {
        title: existingTask.title,
        description: existingTask.description ?? '',
        dueDate,
        dueTime,
        priority: existingTask.priority as TaskFormValues['priority'],
        status: existingTask.status as TaskFormValues['status'],
        categoryId: existingTask.categoryId,
        rrule: existingTask.rrule ?? '',
        reminderMinutes: 'none',
      };
    }

    // Create mode defaults
    const defaultCategory = categories.find((c) => c.isDefault);
    let dueDate = '';
    if (defaultDate) {
      dueDate = format(defaultDate, 'yyyy-MM-dd');
    }

    return {
      title: '',
      description: '',
      dueDate,
      dueTime: '',
      priority: 'none',
      status: 'todo',
      categoryId: defaultCategory?.id ?? categories[0]?.id ?? '',
      rrule: '',
      reminderMinutes: 'none',
    };
  }, [isEditMode, existingTask, defaultDate, categories, userTimezone]);

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: getDefaults(),
  });

  // Reset form when switching between create/edit or task data loads
  useEffect(() => {
    if (open) {
      reset(getDefaults());
    }
  }, [open, existingTask, reset, getDefaults]);

  const watchedDueDate = watch('dueDate');
  const watchedRrule = watch('rrule');

  // Determine if current rrule is a custom (non-preset) value
  const isCustomRrule = useMemo(() => {
    if (!watchedRrule) return false;
    return !RECURRENCE_PRESETS.some((p) => p.value === watchedRrule);
  }, [watchedRrule]);

  // ─── Submit Handler ─────────────────────────────────────────────

  const buildApiPayload = useCallback(
    (data: TaskFormValues) => {
      // Build dueAt from date + time in user's timezone
      let dueAt: string | null = null;
      if (data.dueDate) {
        const timeStr = data.dueTime || '23:59';
        const dueZoned = parseISO(`${data.dueDate}T${timeStr}`);
        const dueUtc = fromZonedTime(dueZoned, userTimezone);
        dueAt = dueUtc.toISOString();
      }

      const reminderValue = data.reminderMinutes;
      const reminderMinutes =
        reminderValue && reminderValue !== 'none' ? Number(reminderValue) : null;

      const rrule = data.rrule && data.rrule !== '_none' ? data.rrule : null;

      return {
        title: data.title,
        description: data.description || null,
        dueAt,
        priority: data.priority,
        categoryId: data.categoryId,
        rrule,
        ...(reminderMinutes != null
          ? { reminder: { minutesBefore: reminderMinutes, method: 'push' as const } }
          : {}),
      };
    },
    [userTimezone],
  );

  const submitWithScope = useCallback(
    (data: TaskFormValues, scope?: EditScope) => {
      const payload = buildApiPayload(data);

      if (isEditMode && taskId) {
        // For updates, also include status
        const updatePayload = {
          ...payload,
          status: data.status,
        };
        updateTask.mutate(
          {
            taskId,
            data: updatePayload,
            scope,
            instanceDate: existingTask?.instanceDate ?? undefined,
          },
          { onSuccess: () => closeTaskDrawer() },
        );
      } else {
        createTask.mutate(payload, { onSuccess: () => closeTaskDrawer() });
      }
    },
    [
      isEditMode,
      taskId,
      existingTask,
      buildApiPayload,
      updateTask,
      createTask,
      closeTaskDrawer,
    ],
  );

  const onSubmit = useCallback(
    (data: TaskFormValues) => {
      if (isEditMode && isRecurring) {
        setScopeDialog({ open: true, action: 'edit', pendingData: data });
        return;
      }
      submitWithScope(data);
    },
    [isEditMode, isRecurring, submitWithScope],
  );

  const handleScopeConfirm = useCallback(
    (scope: EditScope) => {
      if (scopeDialog.action === 'edit' && scopeDialog.pendingData) {
        submitWithScope(scopeDialog.pendingData, scope);
      } else if (scopeDialog.action === 'delete' && taskId) {
        deleteTask.mutate(
          {
            taskId,
            scope,
            instanceDate: existingTask?.instanceDate ?? undefined,
          },
          { onSuccess: () => closeTaskDrawer() },
        );
      }
    },
    [scopeDialog, submitWithScope, taskId, existingTask, deleteTask, closeTaskDrawer],
  );

  const handleDelete = useCallback(() => {
    if (!taskId) return;
    if (isRecurring) {
      setScopeDialog({ open: true, action: 'delete' });
      return;
    }
    deleteTask.mutate({ taskId }, { onSuccess: () => closeTaskDrawer() });
  }, [taskId, isRecurring, deleteTask, closeTaskDrawer]);

  return (
    <>
      <Sheet open={open} onOpenChange={(isOpen) => !isOpen && closeTaskDrawer()}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{isEditMode ? 'Edit Task' : 'New Task'}</SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5" noValidate>
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="task-title">Title</Label>
              <Input id="task-title" placeholder="Task title" autoFocus {...register('title')} />
              {errors.title && (
                <p className="text-xs text-[var(--destructive)]" role="alert">
                  {errors.title.message}
                </p>
              )}
            </div>

            {/* Due date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="task-due-date">Due date</Label>
                <Input id="task-due-date" type="date" {...register('dueDate')} />
              </div>
              {watchedDueDate && (
                <div className="space-y-1.5">
                  <Label htmlFor="task-due-time">Due time</Label>
                  <Input id="task-due-time" type="time" {...register('dueTime')} />
                </div>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="task-description">Description</Label>
              <textarea
                id="task-description"
                className="flex min-h-[80px] w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm ring-offset-[var(--background)] placeholder:text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Add a description..."
                {...register('description')}
              />
              {errors.description && (
                <p className="text-xs text-[var(--destructive)]" role="alert">
                  {errors.description.message}
                </p>
              )}
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Controller
                name="priority"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Status (only in edit mode) */}
            {isEditMode && (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            )}

            {/* Category */}
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Controller
                name="categoryId"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block h-3 w-3 shrink-0 rounded-full"
                              style={{ backgroundColor: cat.color }}
                            />
                            {cat.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.categoryId && (
                <p className="text-xs text-[var(--destructive)]" role="alert">
                  {errors.categoryId.message}
                </p>
              )}
            </div>

            {/* Recurrence */}
            <div className="space-y-1.5">
              <Label>Repeat</Label>
              <Controller
                name="rrule"
                control={control}
                render={({ field }) => (
                  <Select
                    value={isCustomRrule ? '_custom_set' : field.value || '_none'}
                    onValueChange={(v) => {
                      if (v === '_custom') {
                        setRecurrenceBuilderOpen(true);
                        return;
                      }
                      if (v === '_custom_set') {
                        setRecurrenceBuilderOpen(true);
                        return;
                      }
                      field.onChange(v === '_none' ? '' : v);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Does not repeat" />
                    </SelectTrigger>
                    <SelectContent>
                      {RECURRENCE_PRESETS.map((preset) => (
                        <SelectItem key={preset.value || '_none'} value={preset.value || '_none'}>
                          {preset.label}
                        </SelectItem>
                      ))}
                      {isCustomRrule && <SelectItem value="_custom_set">Custom rule</SelectItem>}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Reminder */}
            <div className="space-y-1.5">
              <Label>Reminder</Label>
              <Controller
                name="reminderMinutes"
                control={control}
                render={({ field }) => (
                  <Select value={field.value ?? 'none'} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="No reminder" />
                    </SelectTrigger>
                    <SelectContent>
                      {REMINDER_PRESETS.map((preset) => (
                        <SelectItem key={preset.value} value={preset.value}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Footer */}
            <SheetFooter className="flex-row gap-2 pt-4">
              {isEditMode && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleteTask.isPending}
                >
                  Delete
                </Button>
              )}
              <div className="flex-1" />
              <Button type="button" variant="outline" onClick={closeTaskDrawer}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || createTask.isPending || updateTask.isPending}
              >
                {isEditMode ? 'Save' : 'Create'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Scope dialog for recurring tasks */}
      <RecurrenceScopeDialog
        open={scopeDialog.open}
        onClose={() => setScopeDialog((s) => ({ ...s, open: false }))}
        onConfirm={handleScopeConfirm}
        action={scopeDialog.action}
      />

      {/* Recurrence builder modal (lazy-loaded) */}
      {recurrenceBuilderOpen && (
        <Suspense fallback={null}>
          <LazyRecurrenceBuilderModal
            open={recurrenceBuilderOpen}
            onOpenChange={setRecurrenceBuilderOpen}
            initialRrule={watchedRrule || null}
            startDate={watchedDueDate || format(new Date(), 'yyyy-MM-dd')}
            onSave={(rrule) => setValue('rrule', rrule)}
          />
        </Suspense>
      )}
    </>
  );
}
