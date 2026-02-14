import { RRule, RRuleSet } from 'rrule';

import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

// ─── Types ──────────────────────────────────────────────────────────

/**
 * Minimal event shape needed for recurrence expansion.
 * Matches the EventResponse returned by EventService.
 */
export interface RecurrableEvent {
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

export interface ExceptionOverride {
  id: string;
  recurringEventId: string;
  userId: string;
  originalDate: string;
  overrides: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ExpandedInstance extends RecurrableEvent {
  isRecurringInstance: true;
  instanceDate: string;
}

// ─── Constants ──────────────────────────────────────────────────────

const MAX_INSTANCES_PER_SERIES = 1000;

// ─── Service ────────────────────────────────────────────────────────

export class RecurrenceService {
  /**
   * Expand recurring events into individual instances within a date range.
   *
   * Flow:
   * 1. Separate recurring parents from non-recurring events.
   * 2. For each parent, use rrule.js to generate occurrence dates within [start, end].
   * 3. Subtract exDates (excluded occurrences).
   * 4. Apply exception overrides (per-instance modifications).
   * 5. Return combined list of non-recurring events + expanded instances.
   */
  expandRecurringEvents(
    events: RecurrableEvent[],
    start: string,
    end: string,
    exceptions: ExceptionOverride[] = [],
  ): (RecurrableEvent | ExpandedInstance)[] {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const result: (RecurrableEvent | ExpandedInstance)[] = [];

    // Build a lookup of exceptions by parent ID + original date
    const exceptionMap = this.buildExceptionMap(exceptions);

    for (const event of events) {
      if (!event.rrule || event.recurringEventId !== null) {
        // Non-recurring event or exception record — include as-is
        result.push(event);
        continue;
      }

      // Recurring parent: expand into instances
      const instances = this.expandSingleSeries(event, startDate, endDate, exceptionMap);
      result.push(...instances);
    }

    return result;
  }

  /**
   * Validate an RRULE string by parsing it with rrule.js.
   * Throws AppError(422, 'INVALID_RRULE') if the string is invalid.
   */
  validateRrule(rruleStr: string): void {
    // Basic structural checks
    if (!rruleStr.includes('FREQ=')) {
      throw new AppError(422, 'INVALID_RRULE', 'Invalid recurrence rule: missing FREQ');
    }

    const validFreqs = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
    const freqMatch = rruleStr.match(/FREQ=(\w+)/);
    if (!freqMatch || !validFreqs.includes(freqMatch[1])) {
      throw new AppError(422, 'INVALID_RRULE', 'Invalid recurrence rule: invalid FREQ value');
    }

    // Attempt to parse with rrule.js for full validation
    try {
      RRule.fromString(rruleStr);
    } catch {
      throw new AppError(422, 'INVALID_RRULE', 'Invalid recurrence rule: failed to parse');
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  /**
   * Build a lookup map of exception overrides keyed by `parentId::originalDateISO`.
   */
  private buildExceptionMap(exceptions: ExceptionOverride[]): Map<string, ExceptionOverride> {
    const map = new Map<string, ExceptionOverride>();
    for (const exc of exceptions) {
      const key = this.exceptionKey(exc.recurringEventId, exc.originalDate);
      map.set(key, exc);
    }
    return map;
  }

  private exceptionKey(parentId: string, originalDate: string): string {
    // Normalize to date-only comparison for matching instances
    const dateOnly = new Date(originalDate).toISOString().slice(0, 10);
    return `${parentId}::${dateOnly}`;
  }

  /**
   * Expand a single recurring event into instances within [start, end].
   */
  private expandSingleSeries(
    parent: RecurrableEvent,
    start: Date,
    end: Date,
    exceptionMap: Map<string, ExceptionOverride>,
  ): ExpandedInstance[] {
    const eventStartAt = new Date(parent.startAt);
    const eventEndAt = new Date(parent.endAt);
    const duration = eventEndAt.getTime() - eventStartAt.getTime();

    let rrule: RRule;
    try {
      rrule = RRule.fromString(parent.rrule!);
    } catch (err) {
      logger.warn(
        { eventId: parent.id, rrule: parent.rrule, error: err },
        'Failed to parse RRULE for event, skipping expansion',
      );
      return [];
    }

    // Create an RRuleSet to support exDates
    const rruleSet = new RRuleSet();

    // Re-create the RRule with the event's dtstart
    const rruleWithStart = new RRule({
      ...rrule.origOptions,
      dtstart: eventStartAt,
    });
    rruleSet.rrule(rruleWithStart);

    // Add exDates
    const exDateSet = new Set<string>();
    for (const exDateStr of parent.exDates) {
      const exDate = new Date(exDateStr);
      rruleSet.exdate(exDate);
      exDateSet.add(exDate.toISOString().slice(0, 10));
    }

    // Expand occurrences within the range
    // We expand slightly beyond the range to catch events that start before
    // the range but whose duration extends into it
    const occurrences = rruleSet.between(start, end, true);

    // Cap at MAX_INSTANCES_PER_SERIES
    const cappedOccurrences = occurrences.slice(0, MAX_INSTANCES_PER_SERIES);

    if (occurrences.length > MAX_INSTANCES_PER_SERIES) {
      logger.warn(
        {
          eventId: parent.id,
          totalOccurrences: occurrences.length,
          capped: MAX_INSTANCES_PER_SERIES,
        },
        'Recurring event expansion capped at maximum instances',
      );
    }

    const instances: ExpandedInstance[] = [];

    for (const occurrence of cappedOccurrences) {
      const instanceDate = occurrence.toISOString();
      const instanceDateOnly = occurrence.toISOString().slice(0, 10);

      // Skip if this date is in exDates (double check in case rruleSet missed it)
      if (exDateSet.has(instanceDateOnly)) {
        continue;
      }

      // Calculate instance start and end based on occurrence date
      const instanceStart = occurrence;
      const instanceEnd = new Date(occurrence.getTime() + duration);

      // Build the base instance
      let instance: ExpandedInstance = {
        ...parent,
        startAt: instanceStart.toISOString(),
        endAt: instanceEnd.toISOString(),
        isRecurringInstance: true,
        instanceDate,
      };

      // Apply exception overrides if any
      const exceptionKey = this.exceptionKey(parent.id, instanceDate);
      const exception = exceptionMap.get(exceptionKey);
      if (exception) {
        instance = this.applyOverrides(instance, exception);
      }

      instances.push(instance);
    }

    return instances;
  }

  /**
   * Apply exception overrides to an expanded instance.
   */
  private applyOverrides(
    instance: ExpandedInstance,
    exception: ExceptionOverride,
  ): ExpandedInstance {
    const overrides = exception.overrides;
    const result = { ...instance };

    if (overrides.title !== undefined) result.title = overrides.title as string;
    if (overrides.description !== undefined)
      result.description = overrides.description as string | null;
    if (overrides.location !== undefined) result.location = overrides.location as string | null;
    if (overrides.startAt !== undefined) result.startAt = overrides.startAt as string;
    if (overrides.endAt !== undefined) result.endAt = overrides.endAt as string;
    if (overrides.isAllDay !== undefined) result.isAllDay = overrides.isAllDay as boolean;
    if (overrides.categoryId !== undefined) result.categoryId = overrides.categoryId as string;
    if (overrides.color !== undefined) result.color = overrides.color as string | null;
    if (overrides.visibility !== undefined) result.visibility = overrides.visibility as string;

    return result;
  }
}

export const recurrenceService = new RecurrenceService();
