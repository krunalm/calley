import { addHours, endOfDay, format } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import { CalendarDays, CheckSquare } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { useCategories } from '@/hooks/use-categories';
import { useCreateEvent } from '@/hooks/use-event-mutations';
import { useCreateTask } from '@/hooks/use-task-mutations';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';

interface QuickCreatePopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The date for the new item */
  defaultDate: Date;
  /** Optional time (for week/day view slot clicks) */
  defaultTime?: Date;
  children: React.ReactNode;
}

type ItemType = 'event' | 'task';

export function QuickCreatePopover({
  open,
  onOpenChange,
  defaultDate,
  defaultTime,
  children,
}: QuickCreatePopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      {open && (
        <QuickCreatePopoverContent
          onOpenChange={onOpenChange}
          defaultDate={defaultDate}
          defaultTime={defaultTime}
        />
      )}
    </Popover>
  );
}

/**
 * Inner content that mounts fresh each time the popover opens,
 * ensuring state always resets to defaults.
 */
function QuickCreatePopoverContent({
  onOpenChange,
  defaultDate,
  defaultTime,
}: Omit<QuickCreatePopoverProps, 'open' | 'children'>) {
  const userTimezone = useUserTimezone();
  const { openEventDrawer, openTaskDrawer } = useUIStore();
  const createEvent = useCreateEvent();
  const createTask = useCreateTask();
  const { data: categories = [] } = useCategories();

  const [title, setTitle] = useState('');
  const [itemType, setItemType] = useState<ItemType>('event');
  const titleRef = useRef<HTMLInputElement>(null);

  // Get default category
  const defaultCategory = categories.find((c) => c.isDefault) ?? categories[0];

  // Compute start and end times
  const startTime = defaultTime ?? defaultDate;
  const endTime = defaultTime ? addHours(defaultTime, 1) : addHours(defaultDate, 1);

  const timeLabel = defaultTime
    ? `${format(startTime, 'h:mm a')} – ${format(endTime, 'h:mm a')}`
    : 'All day';

  const handleSubmit = useCallback(() => {
    const trimmed = title.trim();
    if (!trimmed || !defaultCategory) return;

    if (itemType === 'event') {
      const isAllDay = !defaultTime;
      // An all-day quick-create spans the whole selected day, matching the
      // EventDrawer's storage convention — it used to end one hour after
      // midnight, a one-hour "all-day" event.
      const eventStartZoned = isAllDay ? defaultDate : defaultTime!;
      const eventEndZoned = isAllDay ? endOfDay(defaultDate) : addHours(defaultTime!, 1);
      const startAt = fromZonedTime(eventStartZoned, userTimezone).toISOString();
      const endAt = fromZonedTime(eventEndZoned, userTimezone).toISOString();

      createEvent.mutate({
        title: trimmed,
        startAt,
        endAt,
        isAllDay,
        categoryId: defaultCategory.id,
        visibility: 'private',
      });
    } else {
      // The Task branch used to fall straight through and close the popover —
      // the title the user typed was silently discarded. A quick-created task
      // is due on the selected day: at the tapped time when the popover came
      // from a time slot, otherwise end of that day.
      const dueZoned = defaultTime ?? endOfDay(defaultDate);
      const dueAt = fromZonedTime(dueZoned, userTimezone).toISOString();

      createTask.mutate({
        title: trimmed,
        dueAt,
        priority: 'none',
        categoryId: defaultCategory.id,
      });
    }

    onOpenChange(false);
  }, [
    title,
    itemType,
    defaultTime,
    defaultDate,
    userTimezone,
    defaultCategory,
    createEvent,
    createTask,
    onOpenChange,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleMoreOptions = useCallback(() => {
    onOpenChange(false);
    if (itemType === 'event') {
      openEventDrawer({ defaultDate, defaultTime });
    } else {
      openTaskDrawer({ defaultDate });
    }
  }, [itemType, defaultDate, defaultTime, onOpenChange, openEventDrawer, openTaskDrawer]);

  return (
    <PopoverContent
      className="w-72 p-3"
      align="start"
      sideOffset={4}
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        titleRef.current?.focus();
      }}
    >
      {/* Title input */}
      <Input
        ref={titleRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={itemType === 'event' ? 'Event title' : 'Task title'}
        className="mb-2 text-sm"
        maxLength={200}
      />

      {/* Type toggle */}
      <div className="mb-2 flex gap-1">
        <button
          type="button"
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-xs font-medium transition-colors',
            itemType === 'event'
              ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
              : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--accent-ui)]',
          )}
          onClick={() => setItemType('event')}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          Event
        </button>
        <button
          type="button"
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-xs font-medium transition-colors',
            itemType === 'task'
              ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
              : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--accent-ui)]',
          )}
          onClick={() => setItemType('task')}
        >
          <CheckSquare className="h-3.5 w-3.5" />
          Task
        </button>
      </div>

      {/* Time display */}
      <div className="mb-3 text-xs text-[var(--muted-foreground)]">
        <span className="font-medium">{format(defaultDate, 'EEE, MMM d')}</span>
        {' · '}
        <span>{timeLabel}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="text-xs text-[var(--primary)] hover:underline"
          onClick={handleMoreOptions}
        >
          More options
        </button>
        <Button size="sm" onClick={handleSubmit} disabled={!title.trim()}>
          Save
        </Button>
      </div>
    </PopoverContent>
  );
}
