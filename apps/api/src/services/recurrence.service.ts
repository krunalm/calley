import rruleLib from 'rrule';

const { RRule, RRuleSet } = rruleLib;

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
    // Use full ISO timestamp for unique keying (avoids collisions when
    // multiple occurrences fall on the same calendar date)
    const isoTimestamp = new Date(originalDate).toISOString();
    return `${parentId}::${isoTimestamp}`;
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
    const rawDuration = eventEndAt.getTime() - eventStartAt.getTime();

    // Guard against negative duration (endAt < startAt on parent)
    if (rawDuration < 0) {
      logger.warn(
        { eventId: parent.id, startAt: parent.startAt, endAt: parent.endAt },
        'Recurring event has endAt before startAt, clamping duration to 0',
      );
    }
    const duration = Math.max(0, rawDuration);

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
      exDateSet.add(exDate.toISOString());
    }

    // Shift the between window back by event duration so we catch occurrences
    // that start before the query range but whose duration extends into it.
    const windowStart = new Date(start.getTime() - duration);
    const occurrences = rruleSet.between(windowStart, end, true);

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

    const startMs = start.getTime();
    const endMs = end.getTime();
    const instances: ExpandedInstance[] = [];

    for (const occurrence of cappedOccurrences) {
      const occurrenceMs = occurrence.getTime();
      const instanceEndMs = occurrenceMs + duration;

      // Filter to only occurrences that actually overlap the requested range:
      // occurrence starts before range end AND occurrence+duration ends after range start
      if (occurrenceMs >= endMs || instanceEndMs <= startMs) {
        continue;
      }

      const instanceDate = occurrence.toISOString();

      // Skip if this occurrence is in exDates (double check in case rruleSet missed it)
      if (exDateSet.has(instanceDate)) {
        continue;
      }

      // Calculate instance start and end based on occurrence date
      const instanceStart = occurrence;
      const instanceEnd = new Date(instanceEndMs);

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
        instance = this.applyOverrides(instance, exception, duration);

        // Re-check overlap after overrides — overrides can move the instance
        // outside (or inside) the query window
        const overriddenStartMs = new Date(instance.startAt).getTime();
        const overriddenEndMs = new Date(instance.endAt).getTime();
        if (overriddenStartMs >= endMs || overriddenEndMs <= startMs) {
          continue;
        }
      }

      instances.push(instance);
    }

    return instances;
  }

  /**
   * Apply exception overrides to an expanded instance.
   *
   * When only startAt is overridden (no endAt), the original duration is
   * preserved by shifting endAt accordingly. After all overrides are applied,
   * endAt is validated to be >= startAt.
   */
  private applyOverrides(
    instance: ExpandedInstance,
    exception: ExceptionOverride,
    originalDuration: number,
  ): ExpandedInstance {
    const overrides = exception.overrides;
    const result = { ...instance };

    if (overrides.title !== undefined) result.title = overrides.title as string;
    if (overrides.description !== undefined)
      result.description = overrides.description as string | null;
    if (overrides.location !== undefined) result.location = overrides.location as string | null;
    if (overrides.categoryId !== undefined) result.categoryId = overrides.categoryId as string;
    if (overrides.color !== undefined) result.color = overrides.color as string | null;
    if (overrides.visibility !== undefined) result.visibility = overrides.visibility as string;
    if (overrides.isAllDay !== undefined) result.isAllDay = overrides.isAllDay as boolean;

    // Handle time overrides with duration preservation
    const hasStartOverride = overrides.startAt !== undefined;
    const hasEndOverride = overrides.endAt !== undefined;

    if (hasStartOverride) {
      result.startAt = overrides.startAt as string;
    }
    if (hasEndOverride) {
      result.endAt = overrides.endAt as string;
    }

    // When only startAt is overridden, preserve the original event duration
    if (hasStartOverride && !hasEndOverride) {
      const newStart = new Date(result.startAt).getTime();
      result.endAt = new Date(newStart + originalDuration).toISOString();
    }

    // Validate that endAt >= startAt after overrides
    const finalStart = new Date(result.startAt).getTime();
    const finalEnd = new Date(result.endAt).getTime();
    if (finalEnd < finalStart) {
      // Clamp endAt to startAt to prevent invalid state
      result.endAt = result.startAt;
    }

    return result;
  }
}

export const recurrenceService = new RecurrenceService();
