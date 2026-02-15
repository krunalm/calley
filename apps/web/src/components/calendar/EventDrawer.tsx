import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { addHours, format, parseISO, set as setDateFields } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { useCallback, useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useCreateEvent, useDeleteEvent, useUpdateEvent } from '@/hooks/use-event-mutations';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useUIStore } from '@/stores/ui-store';

import { RecurrenceScopeDialog } from './RecurrenceScopeDialog';

import type { EditScope, Event } from '@calley/shared';

// ─── Form Schema ────────────────────────────────────────────────────
// No transforms here — react-hook-form requires input === output types.
// Transforms are applied in buildApiPayload() before submission.

const eventFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Title is required')
      .max(200, 'Title must be at most 200 characters'),
    description: z.string().max(5000, 'Description must be at most 5000 characters').optional(),
    location: z.string().max(500, 'Location must be at most 500 characters').optional(),
    startDate: z.string().min(1, 'Start date is required'),
    startTime: z.string(),
    endDate: z.string().min(1, 'End date is required'),
    endTime: z.string(),
    isAllDay: z.boolean(),
    categoryId: z.string().min(1, 'Category is required'),
    color: z.string().optional(),
    visibility: z.enum(['public', 'private']),
    rrule: z.string().optional(),
    reminderMinutes: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.isAllDay) return true;
      const start = new Date(`${data.startDate}T${data.startTime}`);
      const end = new Date(`${data.endDate}T${data.endTime}`);
      return start < end;
    },
    { message: 'End time must be after start time', path: ['endTime'] },
  );

type EventFormValues = z.infer<typeof eventFormSchema>;

// ─── Recurrence Presets ─────────────────────────────────────────────

const RECURRENCE_PRESETS = [
  { value: '', label: 'Does not repeat' },
  { value: 'FREQ=DAILY', label: 'Daily' },
  { value: 'FREQ=WEEKLY', label: 'Weekly' },
  { value: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', label: 'Weekdays' },
  { value: 'FREQ=MONTHLY', label: 'Monthly' },
  { value: 'FREQ=YEARLY', label: 'Yearly' },
];

// ─── Reminder Presets ───────────────────────────────────────────────

const REMINDER_PRESETS = [
  { value: 'none', label: 'No reminder' },
  { value: '0', label: 'At time of event' },
  { value: '5', label: '5 minutes before' },
  { value: '10', label: '10 minutes before' },
  { value: '15', label: '15 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '1440', label: '1 day before' },
  { value: '10080', label: '1 week before' },
];

// ─── Color Presets ──────────────────────────────────────────────────

const COLOR_PRESETS = [
  '#EF4444',
  '#F97316',
  '#F59E0B',
  '#10B981',
  '#3B82F6',
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
];

// ─── Component ──────────────────────────────────────────────────────

export function EventDrawer() {
  const {
    eventDrawer: { open, eventId, defaultDate, defaultTime },
    closeEventDrawer,
  } = useUIStore();

  const userTimezone = useUserTimezone();
  const { data: categories = [] } = useCategories();
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();

  // Fetch existing event data for edit mode
  const isEditMode = !!eventId;
  const { data: existingEvent } = useQuery({
    queryKey: queryKeys.events.detail(eventId ?? ''),
    queryFn: () => apiClient.get<Event>(`/events/${eventId}`),
    enabled: isEditMode && open,
  });

  const isRecurring = isEditMode && !!(existingEvent?.rrule || existingEvent?.recurringEventId);

  // Scope dialog state for recurring events
  const [scopeDialog, setScopeDialog] = useState<{
    open: boolean;
    action: 'edit' | 'delete';
    pendingData?: EventFormValues;
  }>({ open: false, action: 'edit' });

  // Compute default values
  const getDefaults = useCallback((): EventFormValues => {
    if (isEditMode && existingEvent) {
      const zonedStart = toZonedTime(parseISO(existingEvent.startAt), userTimezone);
      const zonedEnd = toZonedTime(parseISO(existingEvent.endAt), userTimezone);
      return {
        title: existingEvent.title,
        description: existingEvent.description ?? '',
        location: existingEvent.location ?? '',
        startDate: format(zonedStart, 'yyyy-MM-dd'),
        startTime: format(zonedStart, 'HH:mm'),
        endDate: format(zonedEnd, 'yyyy-MM-dd'),
        endTime: format(zonedEnd, 'HH:mm'),
        isAllDay: existingEvent.isAllDay,
        categoryId: existingEvent.categoryId,
        color: existingEvent.color ?? '',
        visibility: existingEvent.visibility,
        rrule: existingEvent.rrule ?? '',
        reminderMinutes: 'none',
      };
    }

    // Create mode defaults
    const now = defaultDate ?? new Date();
    const startDate = format(now, 'yyyy-MM-dd');
    const startTime = defaultTime ? format(defaultTime, 'HH:mm') : format(now, 'HH:00');
    const endDateTime = defaultTime ? addHours(defaultTime, 1) : addHours(now, 1);
    const endDate = format(endDateTime, 'yyyy-MM-dd');
    const endTime = format(endDateTime, 'HH:00');

    const defaultCategory = categories.find((c) => c.isDefault);

    return {
      title: '',
      description: '',
      location: '',
      startDate,
      startTime,
      endDate,
      endTime,
      isAllDay: false,
      categoryId: defaultCategory?.id ?? categories[0]?.id ?? '',
      color: '',
      visibility: 'private',
      rrule: '',
      reminderMinutes: 'none',
    };
  }, [isEditMode, existingEvent, defaultDate, defaultTime, categories, userTimezone]);

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: getDefaults(),
  });

  // Reset form when switching between create/edit or event data loads
  useEffect(() => {
    if (open) {
      reset(getDefaults());
    }
  }, [open, existingEvent, reset, getDefaults]);

  const isAllDay = watch('isAllDay');
  const selectedColor = watch('color');

  // ─── Submit Handler ─────────────────────────────────────────────

  const buildApiPayload = useCallback((data: EventFormValues) => {
    const startLocal = data.isAllDay
      ? setDateFields(parseISO(data.startDate), { hours: 0, minutes: 0, seconds: 0 })
      : new Date(`${data.startDate}T${data.startTime}`);
    const endLocal = data.isAllDay
      ? setDateFields(parseISO(data.endDate), { hours: 23, minutes: 59, seconds: 59 })
      : new Date(`${data.endDate}T${data.endTime}`);

    const reminderValue = data.reminderMinutes;
    const reminderMinutes =
      reminderValue && reminderValue !== 'none' ? Number(reminderValue) : null;

    return {
      title: data.title,
      description: data.description || null,
      location: data.location || null,
      startAt: startLocal.toISOString(),
      endAt: endLocal.toISOString(),
      isAllDay: data.isAllDay,
      categoryId: data.categoryId,
      color: data.color || null,
      visibility: data.visibility,
      rrule: data.rrule || null,
      ...(reminderMinutes != null
        ? { reminder: { minutesBefore: reminderMinutes, method: 'push' as const } }
        : {}),
    };
  }, []);

  const submitWithScope = useCallback(
    (data: EventFormValues, scope?: EditScope) => {
      const payload = buildApiPayload(data);

      if (isEditMode && eventId) {
        updateEvent.mutate(
          {
            eventId,
            data: payload,
            scope,
            instanceDate: existingEvent?.instanceDate ?? undefined,
          },
          { onSuccess: () => closeEventDrawer() },
        );
      } else {
        createEvent.mutate(payload, { onSuccess: () => closeEventDrawer() });
      }
    },
    [
      isEditMode,
      eventId,
      existingEvent,
      buildApiPayload,
      updateEvent,
      createEvent,
      closeEventDrawer,
    ],
  );

  const onSubmit = useCallback(
    (data: EventFormValues) => {
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
      } else if (scopeDialog.action === 'delete' && eventId) {
        deleteEvent.mutate(
          {
            eventId,
            scope,
            instanceDate: existingEvent?.instanceDate ?? undefined,
          },
          { onSuccess: () => closeEventDrawer() },
        );
      }
    },
    [scopeDialog, submitWithScope, eventId, existingEvent, deleteEvent, closeEventDrawer],
  );

  const handleDelete = useCallback(() => {
    if (!eventId) return;
    if (isRecurring) {
      setScopeDialog({ open: true, action: 'delete' });
      return;
    }
    deleteEvent.mutate({ eventId }, { onSuccess: () => closeEventDrawer() });
  }, [eventId, isRecurring, deleteEvent, closeEventDrawer]);

  return (
    <>
      <Sheet open={open} onOpenChange={(isOpen) => !isOpen && closeEventDrawer()}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{isEditMode ? 'Edit Event' : 'New Event'}</SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5" noValidate>
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="event-title">Title</Label>
              <Input id="event-title" placeholder="Event title" autoFocus {...register('title')} />
              {errors.title && (
                <p className="text-xs text-[var(--destructive)]" role="alert">
                  {errors.title.message}
                </p>
              )}
            </div>

            {/* All-day toggle */}
            <div className="flex items-center gap-2">
              <Controller
                name="isAllDay"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    id="event-all-day"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <Label htmlFor="event-all-day" className="cursor-pointer">
                All-day event
              </Label>
            </div>

            {/* Start date/time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="event-start-date">Start date</Label>
                <Input id="event-start-date" type="date" {...register('startDate')} />
                {errors.startDate && (
                  <p className="text-xs text-[var(--destructive)]" role="alert">
                    {errors.startDate.message}
                  </p>
                )}
              </div>
              {!isAllDay && (
                <div className="space-y-1.5">
                  <Label htmlFor="event-start-time">Start time</Label>
                  <Input id="event-start-time" type="time" {...register('startTime')} />
                </div>
              )}
            </div>

            {/* End date/time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="event-end-date">End date</Label>
                <Input id="event-end-date" type="date" {...register('endDate')} />
                {errors.endDate && (
                  <p className="text-xs text-[var(--destructive)]" role="alert">
                    {errors.endDate.message}
                  </p>
                )}
              </div>
              {!isAllDay && (
                <div className="space-y-1.5">
                  <Label htmlFor="event-end-time">End time</Label>
                  <Input id="event-end-time" type="time" {...register('endTime')} />
                  {errors.endTime && (
                    <p className="text-xs text-[var(--destructive)]" role="alert">
                      {errors.endTime.message}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="event-description">Description</Label>
              <textarea
                id="event-description"
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

            {/* Location */}
            <div className="space-y-1.5">
              <Label htmlFor="event-location">Location</Label>
              <Input id="event-location" placeholder="Add location" {...register('location')} />
              {errors.location && (
                <p className="text-xs text-[var(--destructive)]" role="alert">
                  {errors.location.message}
                </p>
              )}
            </div>

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

            {/* Color override */}
            <div className="space-y-1.5">
              <Label>Color override</Label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`h-7 w-7 rounded-full border-2 ${
                    !selectedColor ? 'border-[var(--primary)]' : 'border-transparent'
                  } bg-[var(--muted)] text-[10px] font-medium`}
                  onClick={() => setValue('color', '')}
                  aria-label="No color override"
                  title="Category default"
                >
                  &mdash;
                </button>
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`h-7 w-7 rounded-full border-2 ${
                      selectedColor === c ? 'border-[var(--foreground)]' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setValue('color', c)}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </div>

            {/* Visibility */}
            <div className="space-y-1.5">
              <Label>Visibility</Label>
              <Controller
                name="visibility"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">Private</SelectItem>
                      <SelectItem value="public">Public</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Recurrence */}
            <div className="space-y-1.5">
              <Label>Repeat</Label>
              <Controller
                name="rrule"
                control={control}
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Does not repeat" />
                    </SelectTrigger>
                    <SelectContent>
                      {RECURRENCE_PRESETS.map((preset) => (
                        <SelectItem key={preset.value} value={preset.value || '_none'}>
                          {preset.label}
                        </SelectItem>
                      ))}
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
                  disabled={deleteEvent.isPending}
                >
                  Delete
                </Button>
              )}
              <div className="flex-1" />
              <Button type="button" variant="outline" onClick={closeEventDrawer}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || createEvent.isPending || updateEvent.isPending}
              >
                {isEditMode ? 'Save' : 'Create'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Scope dialog for recurring events */}
      <RecurrenceScopeDialog
        open={scopeDialog.open}
        onClose={() => setScopeDialog((s) => ({ ...s, open: false }))}
        onConfirm={handleScopeConfirm}
        action={scopeDialog.action}
      />
    </>
  );
}
