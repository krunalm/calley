import { and, eq, gte, inArray, isNotNull, isNull, lte } from 'drizzle-orm';

import { db } from '../db';
import { calendarCategories, eventExceptions, events, reminders } from '../db/schema';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { reminderQueue } from '../lib/queue';
import { sanitizeHtml } from '../lib/sanitize';
import { recurrenceService } from './recurrence.service';

import type { CreateEventInput, EditScope, UpdateEventInput } from '@calley/shared';

// ─── Types ──────────────────────────────────────────────────────────

interface EventRow {
  id: string;
  userId: string;
  categoryId: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date;
  isAllDay: boolean;
  color: string | null;
  visibility: string;
  rrule: string | null;
  exDates: Date[] | null;
  recurringEventId: string | null;
  originalDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface EventResponse {
  id: string;
  userId: string;
  categoryId: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  color: string | null;
  visibility: string;
  rrule: string | null;
  exDates: string[];
  recurringEventId: string | null;
  originalDate: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface EventExceptionRow {
  id: string;
  recurringEventId: string;
  userId: string;
  originalDate: Date;
  overrides: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface EventExceptionResponse {
  id: string;
  recurringEventId: string;
  userId: string;
  originalDate: string;
  overrides: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function toEventResponse(row: EventRow): EventResponse {
  return {
    id: row.id,
    userId: row.userId,
    categoryId: row.categoryId,
    title: row.title,
    description: row.description,
    location: row.location,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    isAllDay: row.isAllDay,
    color: row.color,
    visibility: row.visibility,
    rrule: row.rrule,
    exDates: (row.exDates ?? []).map((d) => d.toISOString()),
    recurringEventId: row.recurringEventId,
    originalDate: row.originalDate ? row.originalDate.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

function toExceptionResponse(row: EventExceptionRow): EventExceptionResponse {
  return {
    id: row.id,
    recurringEventId: row.recurringEventId,
    userId: row.userId,
    originalDate: row.originalDate.toISOString(),
    overrides: row.overrides,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Escape a text value for inclusion in an ICS file.
 * Per RFC 5545: backslash, semicolons, commas, and newlines must be escaped.
 */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Strip HTML tags to produce plain text for ICS DESCRIPTION.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * Fold long lines for ICS output (max 75 octets per line, per RFC 5545 §3.1).
 */
function foldIcsLine(line: string): string {
  const maxLen = 75;
  if (line.length <= maxLen) return line;

  const parts: string[] = [];
  parts.push(line.slice(0, maxLen));
  let pos = maxLen;
  while (pos < line.length) {
    // Continuation lines start with a single space
    parts.push(' ' + line.slice(pos, pos + maxLen - 1));
    pos += maxLen - 1;
  }
  return parts.join('\r\n');
}

// ─── Service ────────────────────────────────────────────────────────

export class EventService {
  /**
   * List events within a date range for a user.
   * Includes regular events in range and expands recurring event
   * parents into individual instances using the recurrence service.
   */
  async listEvents(
    userId: string,
    start: string,
    end: string,
    categoryIds?: string[],
  ): Promise<EventResponse[]> {
    const startDate = new Date(start);
    const endDate = new Date(end);

    const conditions = [
      eq(events.userId, userId),
      isNull(events.deletedAt),
      // Event overlaps the query range:
      // event.startAt < rangeEnd AND event.endAt > rangeStart
      lte(events.startAt, endDate),
      gte(events.endAt, startDate),
    ];

    if (categoryIds && categoryIds.length > 0) {
      conditions.push(inArray(events.categoryId, categoryIds));
    }

    // Also find recurring parent events whose series may extend into the range.
    // A recurring event's parent may have a startAt before the range but generates
    // instances within the range. We fetch all non-deleted recurring parents for
    // the user so the recurrence service can expand them.
    const nonRecurringConditions = [...conditions, isNull(events.rrule)];
    const recurringConditions = [
      eq(events.userId, userId),
      isNull(events.deletedAt),
      isNotNull(events.rrule),
      isNull(events.recurringEventId), // Only parent events
    ];

    if (categoryIds && categoryIds.length > 0) {
      recurringConditions.push(inArray(events.categoryId, categoryIds));
    }

    const [regularEvents, recurringParents] = await Promise.all([
      // Regular (non-recurring) events in range
      db.query.events.findMany({
        where: and(...nonRecurringConditions, isNull(events.recurringEventId)),
      }),

      // Recurring parent events (fetched regardless of date range for expansion)
      db.query.events.findMany({
        where: and(...recurringConditions),
      }),
    ]);

    const allEvents = [...regularEvents, ...recurringParents];

    // Deduplicate by id (recurring parents may overlap with range-based queries)
    const seen = new Set<string>();
    const deduped = allEvents.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });

    const serialized = deduped.map((e) => toEventResponse(e as EventRow));

    // Fetch exception overrides for recurring parents
    const recurringParentIds = recurringParents.map((e) => e.id);
    const exceptions = await this.getExceptionOverrides(userId, recurringParentIds);

    // Expand recurring events into instances within the date range
    const expanded = recurrenceService.expandRecurringEvents(serialized, start, end, exceptions);

    return expanded as EventResponse[];
  }

  /**
   * Get exception overrides for recurring events within the given parent IDs.
   * Used by the recurrence expansion logic to apply per-instance overrides.
   */
  async getExceptionOverrides(
    userId: string,
    recurringEventIds: string[],
  ): Promise<EventExceptionResponse[]> {
    if (recurringEventIds.length === 0) return [];

    const exceptions = await db.query.eventExceptions.findMany({
      where: and(
        eq(eventExceptions.userId, userId),
        inArray(eventExceptions.recurringEventId, recurringEventIds),
        isNull(eventExceptions.deletedAt),
      ),
    });

    return exceptions.map((e) => toExceptionResponse(e as EventExceptionRow));
  }

  /**
   * Get a single event by ID with ownership check.
   */
  async getEvent(userId: string, eventId: string): Promise<EventResponse> {
    const event = await db.query.events.findFirst({
      where: and(eq(events.id, eventId), eq(events.userId, userId), isNull(events.deletedAt)),
    });

    if (!event) {
      throw new AppError(404, 'NOT_FOUND', 'Event not found');
    }

    return toEventResponse(event as EventRow);
  }

  /**
   * Create a new event.
   * Sanitizes description HTML. Optionally creates a reminder.
   */
  async createEvent(userId: string, data: CreateEventInput): Promise<EventResponse> {
    // Validate category belongs to user
    await this.validateCategory(userId, data.categoryId);

    // Sanitize description HTML if present
    const description = data.description ? sanitizeHtml(data.description) : null;

    // Validate RRULE if provided
    if (data.rrule) {
      this.validateRrule(data.rrule);
    }

    const event = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(events)
        .values({
          userId,
          categoryId: data.categoryId,
          title: data.title,
          description,
          location: data.location ?? null,
          startAt: new Date(data.startAt),
          endAt: new Date(data.endAt),
          isAllDay: data.isAllDay,
          color: data.color ?? null,
          visibility: data.visibility ?? 'private',
          rrule: data.rrule ?? null,
        })
        .returning();

      // Create reminder if specified
      if (data.reminder) {
        const triggerAt = new Date(
          new Date(data.startAt).getTime() - data.reminder.minutesBefore * 60 * 1000,
        );

        await tx.insert(reminders).values({
          userId,
          itemType: 'event',
          itemId: inserted.id,
          minutesBefore: data.reminder.minutesBefore,
          method: data.reminder.method,
          triggerAt,
        });
      }

      return inserted;
    });

    // Enqueue BullMQ job for the inline reminder (outside transaction)
    if (data.reminder) {
      const inlineReminder = await db.query.reminders.findFirst({
        where: and(
          eq(reminders.userId, userId),
          eq(reminders.itemId, event.id),
          eq(reminders.itemType, 'event'),
        ),
      });
      if (inlineReminder) {
        try {
          await reminderQueue.add(
            'send-reminder',
            {
              reminderId: inlineReminder.id,
              userId,
              itemType: 'event',
              itemId: event.id,
              method: inlineReminder.method,
            },
            {
              jobId: inlineReminder.id,
              delay: Math.max(0, inlineReminder.triggerAt.getTime() - Date.now()),
            },
          );
        } catch (err) {
          logger.warn(
            { err, reminderId: inlineReminder.id },
            'Failed to enqueue inline reminder job',
          );
        }
      }
    }

    logger.info({ userId, eventId: event.id }, 'Event created');

    return toEventResponse(event as EventRow);
  }

  /**
   * Update an event. For recurring events, the `scope` parameter determines
   * how the edit is applied:
   *
   * - No scope (or non-recurring): Direct update of the event.
   * - 'instance': Creates an exception record for the single instance.
   * - 'following': Splits the series — original ends before instanceDate,
   *   new series starts from instanceDate with updates applied.
   * - 'all': Updates the parent event directly (all instances affected).
   */
  async updateEvent(
    userId: string,
    eventId: string,
    data: UpdateEventInput,
    scope?: EditScope,
    instanceDate?: string,
  ): Promise<EventResponse | EventExceptionResponse> {
    const event = await db.query.events.findFirst({
      where: and(eq(events.id, eventId), eq(events.userId, userId), isNull(events.deletedAt)),
    });

    if (!event) {
      throw new AppError(404, 'NOT_FOUND', 'Event not found');
    }

    // Validate category if being changed
    if (data.categoryId) {
      await this.validateCategory(userId, data.categoryId);
    }

    // Sanitize description if provided
    const sanitizedData = { ...data };
    if (sanitizedData.description !== undefined && sanitizedData.description !== null) {
      sanitizedData.description = sanitizeHtml(sanitizedData.description);
    }

    // Validate RRULE if provided
    if (sanitizedData.rrule !== undefined && sanitizedData.rrule !== null) {
      this.validateRrule(sanitizedData.rrule);
    }

    const isRecurring = event.rrule !== null;

    // Non-recurring event or no scope specified: direct update
    if (!isRecurring || !scope) {
      return this.directUpdate(userId, eventId, sanitizedData);
    }

    // Recurring event with scope
    switch (scope) {
      case 'instance':
        return this.updateInstance(userId, event as EventRow, sanitizedData, instanceDate);
      case 'following':
        return this.updateFollowing(userId, event as EventRow, sanitizedData, instanceDate);
      case 'all':
        return this.directUpdate(userId, eventId, sanitizedData);
      default:
        throw new AppError(400, 'VALIDATION_ERROR', `Invalid scope: ${scope}`);
    }
  }

  /**
   * Delete an event. For recurring events, the `scope` parameter determines
   * how the deletion is applied:
   *
   * - No scope (or non-recurring): Soft delete the event.
   * - 'instance': Adds the instance date to exDates on the parent.
   * - 'following': Sets UNTIL on the parent's RRULE to end before instanceDate.
   * - 'all': Soft deletes the parent and all exceptions.
   */
  async deleteEvent(
    userId: string,
    eventId: string,
    scope?: EditScope,
    instanceDate?: string,
  ): Promise<void> {
    const event = await db.query.events.findFirst({
      where: and(eq(events.id, eventId), eq(events.userId, userId), isNull(events.deletedAt)),
    });

    if (!event) {
      throw new AppError(404, 'NOT_FOUND', 'Event not found');
    }

    const isRecurring = event.rrule !== null;

    // Non-recurring or no scope: simple soft delete
    if (!isRecurring || !scope) {
      await this.softDelete(userId, eventId);
      logger.info({ userId, eventId }, 'Event deleted');
      return;
    }

    switch (scope) {
      case 'instance':
        await this.deleteInstance(userId, event as EventRow, instanceDate);
        break;
      case 'following':
        await this.deleteFollowing(userId, event as EventRow, instanceDate);
        break;
      case 'all':
        await this.deleteAll(userId, eventId);
        break;
      default:
        throw new AppError(400, 'VALIDATION_ERROR', `Invalid scope: ${scope}`);
    }

    logger.info({ userId, eventId, scope }, 'Event deleted');
  }

  /**
   * Duplicate an event as a new standalone event.
   * Creates a copy without recurrence settings or parent linkage.
   */
  async duplicateEvent(userId: string, eventId: string): Promise<EventResponse> {
    const event = await db.query.events.findFirst({
      where: and(eq(events.id, eventId), eq(events.userId, userId), isNull(events.deletedAt)),
    });

    if (!event) {
      throw new AppError(404, 'NOT_FOUND', 'Event not found');
    }

    const [duplicate] = await db
      .insert(events)
      .values({
        userId,
        categoryId: event.categoryId,
        title: event.title,
        description: event.description,
        location: event.location,
        startAt: event.startAt,
        endAt: event.endAt,
        isAllDay: event.isAllDay,
        color: event.color,
        visibility: event.visibility,
        // Duplicate is standalone: no recurrence, no parent link
        rrule: null,
        recurringEventId: null,
        originalDate: null,
      })
      .returning();

    logger.info({ userId, eventId: duplicate.id, sourceEventId: eventId }, 'Event duplicated');

    return toEventResponse(duplicate as EventRow);
  }

  /**
   * Export a single event as an ICS (iCalendar) file.
   * Returns the .ics file content as a string.
   */
  async exportIcs(userId: string, eventId: string): Promise<string> {
    const event = await db.query.events.findFirst({
      where: and(eq(events.id, eventId), eq(events.userId, userId), isNull(events.deletedAt)),
    });

    if (!event) {
      throw new AppError(404, 'NOT_FOUND', 'Event not found');
    }

    return this.generateIcs(event as EventRow);
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  /**
   * Validate that a category belongs to the user.
   */
  private async validateCategory(userId: string, categoryId: string): Promise<void> {
    const category = await db.query.calendarCategories.findFirst({
      where: and(eq(calendarCategories.id, categoryId), eq(calendarCategories.userId, userId)),
    });

    if (!category) {
      throw new AppError(404, 'NOT_FOUND', 'Category not found');
    }
  }

  /**
   * RRULE validation using the recurrence service (rrule.js-powered).
   */
  private validateRrule(rrule: string): void {
    recurrenceService.validateRrule(rrule);
  }

  /**
   * Direct update of an event (non-recurring or scope='all').
   */
  private async directUpdate(
    userId: string,
    eventId: string,
    data: UpdateEventInput,
  ): Promise<EventResponse> {
    const [updated] = await db
      .update(events)
      .set({
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.location !== undefined && { location: data.location }),
        ...(data.startAt !== undefined && { startAt: new Date(data.startAt) }),
        ...(data.endAt !== undefined && { endAt: new Date(data.endAt) }),
        ...(data.isAllDay !== undefined && { isAllDay: data.isAllDay }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.visibility !== undefined && { visibility: data.visibility }),
        ...(data.rrule !== undefined && { rrule: data.rrule }),
        updatedAt: new Date(),
      })
      .where(and(eq(events.id, eventId), eq(events.userId, userId), isNull(events.deletedAt)))
      .returning();

    if (!updated) {
      throw new AppError(404, 'NOT_FOUND', 'Event not found');
    }

    logger.info({ userId, eventId }, 'Event updated');

    return toEventResponse(updated as EventRow);
  }

  /**
   * Edit a single instance of a recurring event.
   * Stores only the delta (changed fields) in the event_exceptions table
   * rather than materializing a full event row. The expansion logic applies
   * these overrides when generating instances for the UI.
   */
  private async updateInstance(
    userId: string,
    parentEvent: EventRow,
    data: UpdateEventInput,
    instanceDate?: string,
  ): Promise<EventExceptionResponse> {
    if (!instanceDate) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'instanceDate is required when editing a single instance',
      );
    }

    const origDate = new Date(instanceDate);

    // Build overrides object containing only the fields that were changed
    const overrides: Record<string, unknown> = {};
    if (data.title !== undefined) overrides.title = data.title;
    if (data.description !== undefined) overrides.description = data.description;
    if (data.location !== undefined) overrides.location = data.location;
    if (data.startAt !== undefined) overrides.startAt = data.startAt;
    if (data.endAt !== undefined) overrides.endAt = data.endAt;
    if (data.isAllDay !== undefined) overrides.isAllDay = data.isAllDay;
    if (data.categoryId !== undefined) overrides.categoryId = data.categoryId;
    if (data.color !== undefined) overrides.color = data.color;
    if (data.visibility !== undefined) overrides.visibility = data.visibility;

    // Run in a transaction: create exception override (no exDate added;
    // the expansion logic checks event_exceptions to apply overrides)
    const result = await db.transaction(async (tx) => {
      // Upsert: soft-delete any existing exception for this instance date, then insert new
      await tx
        .update(eventExceptions)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(eventExceptions.recurringEventId, parentEvent.id),
            eq(eventExceptions.userId, userId),
            eq(eventExceptions.originalDate, origDate),
            isNull(eventExceptions.deletedAt),
          ),
        );

      const [exception] = await tx
        .insert(eventExceptions)
        .values({
          recurringEventId: parentEvent.id,
          userId,
          originalDate: origDate,
          overrides,
        })
        .returning();

      return exception;
    });

    logger.info(
      { userId, parentEventId: parentEvent.id, exceptionId: result.id, instanceDate },
      'Recurring event instance updated (exception override)',
    );

    return toExceptionResponse(result as EventExceptionRow);
  }

  /**
   * Edit this and all following instances of a recurring event.
   * Splits the series: original series ends before instanceDate,
   * new series starts from instanceDate with updates applied.
   */
  private async updateFollowing(
    userId: string,
    parentEvent: EventRow,
    data: UpdateEventInput,
    instanceDate?: string,
  ): Promise<EventResponse> {
    if (!instanceDate) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'instanceDate is required when editing following instances',
      );
    }

    const splitDate = new Date(instanceDate);

    // Build the UNTIL clause for the original series
    // UNTIL should be just before the split date
    const untilDate = new Date(splitDate.getTime() - 1);
    const untilStr = untilDate
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');

    // Modify the parent's RRULE to add UNTIL
    let updatedRrule = parentEvent.rrule!;
    // Remove any existing UNTIL or COUNT
    updatedRrule = updatedRrule.replace(/;?(UNTIL|COUNT)=[^;]*/g, '');
    updatedRrule += `;UNTIL=${untilStr}`;

    // Create a new series starting from splitDate with updates
    const result = await db.transaction(async (tx) => {
      // Update original series to end at UNTIL
      await tx
        .update(events)
        .set({ rrule: updatedRrule, updatedAt: new Date() })
        .where(
          and(
            eq(events.id, parentEvent.id),
            eq(events.userId, parentEvent.userId),
            isNull(events.deletedAt),
          ),
        );

      // Create new series with updated fields
      const [newSeries] = await tx
        .insert(events)
        .values({
          userId,
          categoryId: data.categoryId ?? parentEvent.categoryId,
          title: data.title ?? parentEvent.title,
          description: data.description !== undefined ? data.description : parentEvent.description,
          location: data.location !== undefined ? data.location : parentEvent.location,
          startAt: data.startAt ? new Date(data.startAt) : splitDate,
          endAt: data.endAt
            ? new Date(data.endAt)
            : new Date(
                splitDate.getTime() + (parentEvent.endAt.getTime() - parentEvent.startAt.getTime()),
              ),
          isAllDay: data.isAllDay !== undefined ? data.isAllDay : parentEvent.isAllDay,
          color: data.color !== undefined ? data.color : parentEvent.color,
          visibility: data.visibility ?? parentEvent.visibility,
          rrule: data.rrule !== undefined ? data.rrule : parentEvent.rrule,
        })
        .returning();

      return newSeries;
    });

    logger.info(
      { userId, parentEventId: parentEvent.id, newSeriesId: result.id, instanceDate },
      'Recurring event series split',
    );

    return toEventResponse(result as EventRow);
  }

  /**
   * Soft delete a single event (or non-recurring event).
   */
  private async softDelete(userId: string, eventId: string): Promise<void> {
    await db
      .update(events)
      .set({ deletedAt: new Date() })
      .where(and(eq(events.id, eventId), eq(events.userId, userId), isNull(events.deletedAt)));
  }

  /**
   * Delete a single instance of a recurring event.
   * Adds the instance date to the parent's exDates and soft-deletes
   * any exception override for that instance from event_exceptions.
   */
  private async deleteInstance(
    userId: string,
    event: EventRow,
    instanceDate?: string,
  ): Promise<void> {
    if (!instanceDate) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'instanceDate is required when deleting a single instance',
      );
    }

    const origDate = new Date(instanceDate);
    const parentId = event.recurringEventId ?? event.id;

    await db.transaction(async (tx) => {
      // Soft-delete any exception override for this instance
      await tx
        .update(eventExceptions)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(eventExceptions.recurringEventId, parentId),
            eq(eventExceptions.userId, userId),
            eq(eventExceptions.originalDate, origDate),
            isNull(eventExceptions.deletedAt),
          ),
        );

      // Add to parent's exDates so the instance is excluded from expansion
      const parent = await tx.query.events.findFirst({
        where: and(eq(events.id, parentId), eq(events.userId, userId), isNull(events.deletedAt)),
      });

      if (parent) {
        const currentExDates = (parent.exDates as Date[] | null) ?? [];
        const newExDates = [...currentExDates, origDate];

        await tx
          .update(events)
          .set({ exDates: newExDates, updatedAt: new Date() })
          .where(and(eq(events.id, parentId), eq(events.userId, userId), isNull(events.deletedAt)));
      }
    });
  }

  /**
   * Delete this and all following instances of a recurring event.
   * Sets UNTIL on the parent's RRULE to end before instanceDate.
   * Also soft deletes exception records for dates >= instanceDate.
   */
  private async deleteFollowing(
    userId: string,
    event: EventRow,
    instanceDate?: string,
  ): Promise<void> {
    if (!instanceDate) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'instanceDate is required when deleting following instances',
      );
    }

    const splitDate = new Date(instanceDate);
    const parentId = event.recurringEventId ?? event.id;

    await db.transaction(async (tx) => {
      const parent = await tx.query.events.findFirst({
        where: and(eq(events.id, parentId), eq(events.userId, userId), isNull(events.deletedAt)),
      });

      if (!parent || !parent.rrule) return;

      // Modify RRULE to add UNTIL before splitDate
      const untilDate = new Date(splitDate.getTime() - 1);
      const untilStr = untilDate
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');
      let updatedRrule = parent.rrule;
      updatedRrule = updatedRrule.replace(/;?(UNTIL|COUNT)=[^;]*/g, '');
      updatedRrule += `;UNTIL=${untilStr}`;

      await tx
        .update(events)
        .set({ rrule: updatedRrule, updatedAt: new Date() })
        .where(and(eq(events.id, parentId), eq(events.userId, userId), isNull(events.deletedAt)));

      // Soft delete exception overrides for dates >= instanceDate
      await tx
        .update(eventExceptions)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(eventExceptions.recurringEventId, parentId),
            eq(eventExceptions.userId, userId),
            isNull(eventExceptions.deletedAt),
            gte(eventExceptions.originalDate, splitDate),
          ),
        );
    });
  }

  /**
   * Delete all instances of a recurring event.
   * Soft deletes the parent and all exception overrides.
   */
  private async deleteAll(userId: string, eventId: string): Promise<void> {
    const now = new Date();

    await db.transaction(async (tx) => {
      // Soft delete all exception overrides from event_exceptions
      await tx
        .update(eventExceptions)
        .set({ deletedAt: now })
        .where(
          and(
            eq(eventExceptions.recurringEventId, eventId),
            eq(eventExceptions.userId, userId),
            isNull(eventExceptions.deletedAt),
          ),
        );

      // Soft delete the parent event
      await tx
        .update(events)
        .set({ deletedAt: now })
        .where(and(eq(events.id, eventId), eq(events.userId, userId), isNull(events.deletedAt)));
    });
  }

  /**
   * Generate an ICS (iCalendar) file for a single event.
   * Follows RFC 5545 format.
   */
  private generateIcs(event: EventRow): string {
    const lines: string[] = [];

    lines.push('BEGIN:VCALENDAR');
    lines.push('VERSION:2.0');
    lines.push('PRODID:-//Calley//Calley Calendar//EN');
    lines.push('CALSCALE:GREGORIAN');
    lines.push('METHOD:PUBLISH');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.id}@calley.app`);

    // Format dates for ICS
    if (event.isAllDay) {
      const startStr = event.startAt.toISOString().slice(0, 10).replace(/-/g, '');
      const endStr = event.endAt.toISOString().slice(0, 10).replace(/-/g, '');
      lines.push(`DTSTART;VALUE=DATE:${startStr}`);
      lines.push(`DTEND;VALUE=DATE:${endStr}`);
    } else {
      const startStr = event.startAt
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');
      const endStr = event.endAt
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');
      lines.push(`DTSTART:${startStr}`);
      lines.push(`DTEND:${endStr}`);
    }

    const createdStr = event.createdAt
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
    const updatedStr = event.updatedAt
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
    lines.push(`DTSTAMP:${updatedStr}`);
    lines.push(`CREATED:${createdStr}`);
    lines.push(`LAST-MODIFIED:${updatedStr}`);

    lines.push(`SUMMARY:${escapeIcsText(event.title)}`);

    if (event.description) {
      lines.push(`DESCRIPTION:${escapeIcsText(stripHtml(event.description))}`);
    }

    if (event.location) {
      lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    }

    if (event.rrule) {
      lines.push(`RRULE:${event.rrule}`);
    }

    // Add exDates
    if (event.exDates && event.exDates.length > 0) {
      const exDateStrs = event.exDates.map((d) =>
        d
          .toISOString()
          .replace(/[-:]/g, '')
          .replace(/\.\d{3}/, ''),
      );
      lines.push(`EXDATE:${exDateStrs.join(',')}`);
    }

    lines.push(`STATUS:CONFIRMED`);
    lines.push('END:VEVENT');
    lines.push('END:VCALENDAR');

    // Fold long lines and join with CRLF per RFC 5545
    return lines.map(foldIcsLine).join('\r\n') + '\r\n';
  }
}

export const eventService = new EventService();
