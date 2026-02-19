import { parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { Calendar, Clock, Copy, Download, MapPin, Pencil, Repeat, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';

import { RecurrenceScopeDialog } from '@/components/calendar/RecurrenceScopeDialog';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { useCategories } from '@/hooks/use-categories';
import { useDeleteEvent } from '@/hooks/use-event-mutations';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { apiClient } from '@/lib/api-client';
import { useUIStore } from '@/stores/ui-store';

import type { EditScope, Event } from '@calley/shared';

interface EventDetailPopoverProps {
  event: Event;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function EventDetailPopover({
  event,
  open,
  onOpenChange,
  children,
}: EventDetailPopoverProps) {
  const userTimezone = useUserTimezone();
  const { openEventDrawer } = useUIStore();
  const deleteEvent = useDeleteEvent();
  const { data: categories = [] } = useCategories();

  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);

  const category = categories.find((c) => c.id === event.categoryId);
  const color = event.color ?? category?.color ?? 'var(--primary)';
  const isRecurring = !!event.rrule || !!event.recurringEventId || event.isRecurringInstance;

  // Format date/time
  const startDate = parseISO(event.startAt);
  const endDate = parseISO(event.endAt);
  const dateLabel = event.isAllDay
    ? formatInTimeZone(startDate, userTimezone, 'EEEE, MMMM d, yyyy')
    : formatInTimeZone(startDate, userTimezone, 'EEEE, MMMM d, yyyy');
  const timeLabel = event.isAllDay
    ? 'All day'
    : `${formatInTimeZone(startDate, userTimezone, 'h:mm a')} – ${formatInTimeZone(endDate, userTimezone, 'h:mm a')}`;

  const handleEdit = useCallback(() => {
    onOpenChange(false);
    openEventDrawer({
      eventId: event.recurringEventId ?? event.id,
      instanceDate: event.isRecurringInstance ? (event.instanceDate ?? event.startAt) : undefined,
    });
  }, [event, onOpenChange, openEventDrawer]);

  const handleDuplicate = useCallback(async () => {
    onOpenChange(false);
    try {
      await apiClient.post(`/events/${event.id}/duplicate`, undefined);
    } catch {
      // Error handled by api client
    }
  }, [event.id, onOpenChange]);

  const handleExportIcs = useCallback(async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
      const res = await fetch(`${API_URL}/events/${event.id}/ics`, {
        credentials: 'include',
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${event.title.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'event'}.ics`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Silently fail — download errors are not critical
    }
  }, [event.id, event.title]);

  const handleDeleteClick = useCallback(() => {
    if (isRecurring) {
      setScopeDialogOpen(true);
    } else {
      onOpenChange(false);
      deleteEvent.mutate({ eventId: event.id });
    }
  }, [event.id, isRecurring, onOpenChange, deleteEvent]);

  const handleDeleteConfirm = useCallback(
    (scope: EditScope) => {
      setScopeDialogOpen(false);
      onOpenChange(false);
      deleteEvent.mutate({
        eventId: event.recurringEventId ?? event.id,
        scope,
        instanceDate: event.instanceDate ?? event.startAt,
      });
    },
    [event, onOpenChange, deleteEvent],
  );

  // Strip HTML tags for description preview
  const descriptionPreview = event.description
    ? event.description.replace(/<[^>]*>/g, '').slice(0, 200)
    : null;

  return (
    <>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent
          className="w-80 p-0"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Color bar */}
          <div className="h-2 rounded-t-[var(--radius)]" style={{ backgroundColor: color }} />

          <div className="p-4">
            {/* Title */}
            <h3 className="text-sm font-semibold leading-tight">{event.title}</h3>

            {/* Date & time */}
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span>{dateLabel}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>{timeLabel}</span>
              </div>

              {/* Location */}
              {event.location && (
                <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{event.location}</span>
                </div>
              )}

              {/* Recurrence indicator */}
              {isRecurring && (
                <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                  <Repeat className="h-3.5 w-3.5 shrink-0" />
                  <span>Recurring event</span>
                </div>
              )}

              {/* Category */}
              {category && (
                <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  <span>{category.name}</span>
                </div>
              )}
            </div>

            {/* Description preview */}
            {descriptionPreview && (
              <p className="mt-3 line-clamp-3 text-xs text-[var(--muted-foreground)]">
                {descriptionPreview}
              </p>
            )}

            {/* Actions */}
            <div className="mt-4 flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={handleEdit} aria-label="Edit event">
                <Pencil className="mr-1 h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDuplicate}
                aria-label="Duplicate event"
              >
                <Copy className="mr-1 h-3.5 w-3.5" />
                Duplicate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportIcs}
                aria-label="Export as ICS"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeleteClick}
                className="ml-auto text-[var(--destructive)] hover:bg-[var(--destructive)]/10 hover:text-[var(--destructive)]"
                aria-label="Delete event"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <RecurrenceScopeDialog
        open={scopeDialogOpen}
        onClose={() => setScopeDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        action="delete"
      />
    </>
  );
}
