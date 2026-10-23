import rruleLib from 'rrule';

import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

const { RRule, RRuleSet } = rruleLib;

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

/**
 * Minimal task shape needed for task recurrence expansion.
 * Matches the TaskResponse returned by TaskService.
 */
export interface RecurrableTask {
  id: string;
  userId: string;
  categoryId: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  priority: string;
  status: string;
  completedAt: string | null;
  rrule: string | null;
  exDates: string[];
  recurringTaskId: string | null;
  originalDate: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ExpandedTaskInstance extends RecurrableTask {
  isRecurringInstance: true;
  instanceDate: string;
}

// ─── Constants ──────────────────────────────────────────────────────

const MAX_INSTANCES_PER_SERIES = 1000;

/**
 * Ceiling on the number of expanded instances a single listing response may
 * contain, across every series. The per-series cap alone cannot bound the
 * response: a calendar range over a user with hundreds of recurring series
 * would happily expand to hundreds of thousands of instances.
 */
const MAX_INSTANCES_PER_RESPONSE = 2000;

// ─── Service ────────────────────────────────────────────────────────

export class RecurrenceService {
  /**
   * Terminate a recurring series by adding an UNTIL clause just before splitDate.
   * Removes any existing UNTIL or COUNT from the RRULE and appends a new UNTIL.
   * Used by both event and task services when splitting a "following" series.
   *
   * The rule is parsed into parts and reassembled rather than edited by regex:
   * string surgery produced a leading-semicolon rule (`;FREQ=DAILY;UNTIL=…`)
   * for valid rules whose parts were ordered differently (e.g. `COUNT=5;FREQ=DAILY`),
   * which rrule.js then refuses to parse.
   */
  terminateSeriesAt(rrule: string, splitDate: Date): string {
    const untilDate = new Date(splitDate.getTime() - 1);
    const untilStr = untilDate
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');

    const parts = parseRruleParts(rrule);
    parts.delete('UNTIL');
    parts.delete('COUNT');
    parts.set('UNTIL', untilStr);
    return buildRruleString(parts);
  }

  /**
   * Split a recurrence rule at splitDate into the rule the ORIGINAL series
   * should keep and the rule the NEW tail series should carry.
   *
   * The head is the original series terminated just before the split (UNTIL).
   * The tail is where a naive copy used to duplicate the occurrence budget: a
   * `COUNT=10` series split at occurrence #6 ended up as 15 total occurrences
   * (5 in the head + a tail that restarted the counter at 10). Instead the
   * tail keeps only the occurrences the original rule had left: `COUNT = 10 - 5`.
   *
   * Returns `tail: null` when the split date lies at or after the series end —
   * there is nothing to hand to the new series.
   */
  splitSeriesAt(
    rrule: string,
    dtstart: Date,
    splitDate: Date,
  ): { head: string; tail: string | null } {
    const head = this.terminateSeriesAt(rrule, splitDate);

    const parts = parseRruleParts(rrule);
    const countStr = parts.get('COUNT');
    if (countStr === undefined) {
      // Open-ended or UNTIL-bounded series: the tail is a verbatim copy; its
      // new dtstart (the split occurrence) is what re-anchors it in time.
      return { head, tail: rrule };
    }

    const count = Number(countStr);
    if (!Number.isInteger(count) || count <= 0) {
      return { head, tail: rrule };
    }

    // Occurrences the head has consumed: those strictly before the split date.
    let consumed = 0;
    try {
      const parsed = RRule.fromString(rrule);
      const base = new RRule({ ...parsed.origOptions, dtstart });
      consumed = base.between(dtstart, new Date(splitDate.getTime() - 1), true).length;
    } catch (err) {
      // The rule was already validated on write, so this is a defensive path —
      // preserve the old behaviour (copy verbatim) rather than guessing a count.
      logger.warn(
        { err, rrule, splitDate: splitDate.toISOString() },
        'Could not count occurrences before a series split; keeping original COUNT on the tail',
      );
      return { head, tail: rrule };
    }

    const remaining = count - consumed;
    if (remaining <= 0) {
      return { head, tail: null };
    }

    const tailParts = parseRruleParts(rrule);
    tailParts.set('COUNT', String(remaining));
    return { head, tail: buildRruleString(tailParts) };
  }

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

    // Global budget across every series in the response. Truncation is logged
    // loudly: it means the response is silently incomplete and the client
    // should narrow its window.
    let budgetRemaining = MAX_INSTANCES_PER_RESPONSE;

    for (const event of events) {
      if (!event.rrule || event.recurringEventId !== null) {
        // Non-recurring event or exception record — include as-is
        result.push(event);
        continue;
      }

      // Recurring parent: expand into instances
      const instances = this.expandSingleSeries(event, startDate, endDate, exceptionMap);

      if (instances.length > budgetRemaining) {
        logger.warn(
          {
            eventId: event.id,
            dropped: instances.length - budgetRemaining,
            totalInstances: instances.length,
          },
          'Recurring event expansion truncated at the per-response instance budget',
        );
      }

      const allowed = instances.slice(0, Math.max(0, budgetRemaining));
      budgetRemaining -= allowed.length;
      result.push(...allowed);
    }

    return result;
  }

  /**
   * Expand recurring tasks into individual instances within a due-date range.
   *
   * Tasks differ from events in two ways that shape this method:
   *
   * 1. They are point events — an instance is relevant when its dueAt falls in
   *    [start, end), with no duration to consider.
   *
   * 2. Their per-instance exceptions are full rows in the tasks table
   *    (created by `updateTask` with scope 'instance'), and `updateTask` already
   *    adds the occurrence to the parent's exDates. So exceptions are NOT
   *    merged into instances here — the caller includes the exception rows as
   *    standalone tasks, and this expansion only has to avoid double-listing
   *    the excluded occurrences. The exDate set is the source of truth.
   *
   * Parents without a due date cannot anchor an RRULE (rrule.js needs a
   * dtstart); they are passed through untouched.
   */
  expandRecurringTasks(
    tasks: RecurrableTask[],
    start: string,
    end: string,
  ): (RecurrableTask | ExpandedTaskInstance)[] {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();
    const result: (RecurrableTask | ExpandedTaskInstance)[] = [];

    let budgetRemaining = MAX_INSTANCES_PER_RESPONSE;

    for (const task of tasks) {
      // Exception rows and one-offs are included as-is by the caller.
      if (!task.rrule || task.recurringTaskId !== null) {
        result.push(task);
        continue;
      }

      if (!task.dueAt) {
        // A recurring task without a due date has no anchor to expand from.
        result.push(task);
        continue;
      }

      const dueAt = new Date(task.dueAt);

      let rrule: InstanceType<typeof RRule>;
      try {
        rrule = RRule.fromString(task.rrule);
      } catch (err) {
        logger.warn(
          { taskId: task.id, rrule: task.rrule, error: err },
          'Failed to parse RRULE for task, skipping expansion',
        );
        continue;
      }

      const rruleSet = new RRuleSet();
      rruleSet.rrule(new RRule({ ...rrule.origOptions, dtstart: dueAt }));

      const exDateSet = new Set<string>();
      for (const exDateStr of task.exDates) {
        const exDate = new Date(exDateStr);
        rruleSet.exdate(exDate);
        const truncated = new Date(exDate);
        truncated.setMilliseconds(0);
        exDateSet.add(truncated.toISOString());
      }

      const occurrences = rruleSet.between(dueAt, endDate, true);

      let expanded = 0;
      for (const occurrence of occurrences) {
        if (expanded >= budgetRemaining) {
          logger.warn(
            { taskId: task.id },
            'Recurring task expansion truncated at the per-response instance budget',
          );
          break;
        }

        // Truncate milliseconds so instance dates key identically to the
        // exDates stored on the parent and to `originalDate` on exceptions.
        occurrence.setMilliseconds(0);
        const occurrenceMs = occurrence.getTime();

        // Point event: in range iff start <= due < end
        if (occurrenceMs < startMs || occurrenceMs >= endMs) continue;

        const instanceDate = occurrence.toISOString();
        if (exDateSet.has(instanceDate)) continue;

        result.push({
          ...task,
          dueAt: instanceDate,
          isRecurringInstance: true,
          instanceDate,
        });
        expanded++;
      }

      budgetRemaining -= expanded;
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

  private exceptionKey(parentId: string, originalDate: string | Date): string {
    // Use epoch seconds for unique keying — truncate milliseconds to avoid
    // precision mismatches between rrule.js expansion and DB-stored dates.
    const d = new Date(originalDate);
    d.setMilliseconds(0);
    return `${parentId}::${d.toISOString()}`;
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

    let rrule: InstanceType<typeof RRule>;
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
      // Truncate before deriving the end, not after. `instanceDate` is
      // millisecond-truncated to match how exception dates are keyed, so
      // computing the end from the untruncated value stretched every instance
      // by whatever sub-second remainder dtstart carried.
      occurrence.setMilliseconds(0);
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

// ─── RRULE string helpers ────────────────────────────────────────────

/**
 * Parse an RRULE string into an ordered map of its parts.
 *
 * Tolerates the optional `RRULE:` prefix, surrounding whitespace, and empty
 * segments, so rules written by hand or by other clients do not have to be in
 * the exact shape this app produces.
 */
function parseRruleParts(rrule: string): Map<string, string> {
  const stripped = rrule.replace(/^RRULE:/i, '').trim();
  const parts = new Map<string, string>();

  for (const chunk of stripped.split(';')) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    parts.set(trimmed.slice(0, eq).trim().toUpperCase(), trimmed.slice(eq + 1).trim());
  }

  return parts;
}

function buildRruleString(parts: Map<string, string>): string {
  return [...parts.entries()].map(([key, value]) => `${key}=${value}`).join(';');
}

export const recurrenceService = new RecurrenceService();
