import { errorBody } from '../support/api';
import { isoPlusDays, isoPlusHours, utcAt, wideRange } from '../support/dates';
import { expect, test } from '../support/fixtures';

import type { ApiEvent, ApiSession } from '../support/api';

/**
 * Recurrence contract (RFC 5545).
 *
 * Series are stored as a single parent row plus an RRULE; instances are
 * expanded per query range and never materialised. These specs pin the
 * expansion rules and the three edit/delete scopes: instance, following, all.
 */

// A Wednesday, so BYDAY assertions are unambiguous.
const SERIES_START = utcAt(2031, 4, 2, 9);
const RANGE = wideRange(SERIES_START, 120);

async function createSeries(
  api: ApiSession,
  categoryId: string,
  rrule: string,
  overrides: Record<string, unknown> = {},
): Promise<ApiEvent> {
  return api.createEvent({
    title: 'Standup',
    startAt: SERIES_START,
    endAt: isoPlusHours(SERIES_START, 1),
    categoryId,
    rrule,
    ...overrides,
  });
}

/** Instances of one series, ordered by start time. */
function instancesOf(events: ApiEvent[], parentId: string): ApiEvent[] {
  return events
    .filter((e) => e.id === parentId || e.recurringEventId === parentId)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

test.describe('API — recurrence validation', () => {
  test('accepts a daily rule', async ({ api, category }) => {
    const event = await createSeries(api, category.id, 'FREQ=DAILY');
    expect(event.rrule).toBe('FREQ=DAILY');
  });

  test('accepts a weekly rule with BYDAY', async ({ api, category }) => {
    const event = await createSeries(api, category.id, 'FREQ=WEEKLY;BYDAY=MO,WE,FR');
    expect(event.rrule).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR');
  });

  test('accepts a monthly rule', async ({ api, category }) => {
    const event = await createSeries(api, category.id, 'FREQ=MONTHLY');
    expect(event.rrule).toBe('FREQ=MONTHLY');
  });

  test('accepts a yearly rule', async ({ api, category }) => {
    const event = await createSeries(api, category.id, 'FREQ=YEARLY');
    expect(event.rrule).toBe('FREQ=YEARLY');
  });

  test('accepts an INTERVAL modifier', async ({ api, category }) => {
    const event = await createSeries(api, category.id, 'FREQ=WEEKLY;INTERVAL=2');
    expect(event.rrule).toBe('FREQ=WEEKLY;INTERVAL=2');
  });

  test('accepts a COUNT limit', async ({ api, category }) => {
    const event = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=5');
    expect(event.rrule).toContain('COUNT=5');
  });

  test('accepts an UNTIL bound', async ({ api, category }) => {
    const event = await createSeries(api, category.id, 'FREQ=DAILY;UNTIL=20310410T090000Z');
    expect(event.rrule).toContain('UNTIL=');
  });

  test('rejects a syntactically invalid rule', async ({ api, category }) => {
    const res = await api.post('/events', {
      title: 'Broken',
      startAt: SERIES_START,
      endAt: isoPlusHours(SERIES_START, 1),
      categoryId: category.id,
      rrule: 'THIS IS NOT AN RRULE',
    });

    expect(res.status()).toBe(422);
    expect((await errorBody(res)).code).toBe('INVALID_RRULE');
  });

  test('rejects an unknown frequency', async ({ api, category }) => {
    const res = await api.post('/events', {
      title: 'Broken',
      startAt: SERIES_START,
      endAt: isoPlusHours(SERIES_START, 1),
      categoryId: category.id,
      rrule: 'FREQ=FORTNIGHTLY',
    });

    expect(res.status()).toBe(422);
  });

  test('rejects an rrule longer than 500 characters', async ({ api, category }) => {
    const res = await api.post('/events', {
      title: 'Broken',
      startAt: SERIES_START,
      endAt: isoPlusHours(SERIES_START, 1),
      categoryId: category.id,
      rrule: 'FREQ=DAILY;' + 'X'.repeat(500),
    });

    expect(res.status()).toBe(400);
  });

  test('a non-recurring event has a null rrule', async ({ api, category }) => {
    const event = await api.createEvent({
      title: 'One-off',
      startAt: SERIES_START,
      endAt: isoPlusHours(SERIES_START, 1),
      categoryId: category.id,
    });

    expect(event.rrule).toBeNull();
  });
});

test.describe('API — recurrence expansion', () => {
  test('expands a daily series across the queried range', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=5');

    const events = await api.listEvents(
      isoPlusDays(SERIES_START, -1),
      isoPlusDays(SERIES_START, 10),
    );

    expect(instancesOf(events, parent.id)).toHaveLength(5);
  });

  test('flags expanded occurrences as recurring instances', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=3');

    const instances = instancesOf(
      await api.listEvents(isoPlusDays(SERIES_START, -1), isoPlusDays(SERIES_START, 10)),
      parent.id,
    );

    expect(instances.every((i) => i.isRecurringInstance)).toBe(true);
    expect(instances.every((i) => typeof i.instanceDate === 'string')).toBe(true);
  });

  test('only returns occurrences inside the requested window', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=30');

    const instances = instancesOf(
      await api.listEvents(SERIES_START, isoPlusDays(SERIES_START, 3)),
      parent.id,
    );

    expect(instances).toHaveLength(3);
  });

  test('honours COUNT', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=4');

    const instances = instancesOf(await api.listEvents(RANGE.start, RANGE.end), parent.id);
    expect(instances).toHaveLength(4);
  });

  test('honours INTERVAL', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;INTERVAL=2;COUNT=3');

    const instances = instancesOf(await api.listEvents(RANGE.start, RANGE.end), parent.id);
    const days = instances.map((i) => new Date(i.startAt).getUTCDate());

    expect(days).toEqual([2, 4, 6]);
  });

  test('honours BYDAY for a weekly rule', async ({ api, category }) => {
    // Series starts Wednesday 2031-04-02; MO,WE,FR within the first week.
    const parent = await createSeries(api, category.id, 'FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=3');

    const instances = instancesOf(await api.listEvents(RANGE.start, RANGE.end), parent.id);
    const weekdays = instances.map((i) => new Date(i.startAt).getUTCDay());

    expect(weekdays).toEqual([3, 5, 1]);
  });

  test('preserves the instance duration', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=3');

    const instances = instancesOf(await api.listEvents(RANGE.start, RANGE.end), parent.id);
    for (const instance of instances) {
      const duration = new Date(instance.endAt).getTime() - new Date(instance.startAt).getTime();
      expect(duration).toBe(3_600_000);
    }
  });

  test('every instance keeps the parent title', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=3');

    const instances = instancesOf(await api.listEvents(RANGE.start, RANGE.end), parent.id);
    expect(instances.every((i) => i.title === 'Standup')).toBe(true);
  });

  test('returns nothing for a range before the series starts', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=5');

    const instances = instancesOf(
      await api.listEvents(isoPlusDays(SERIES_START, -40), isoPlusDays(SERIES_START, -20)),
      parent.id,
    );
    expect(instances).toHaveLength(0);
  });

  test('returns nothing after an UNTIL bound has passed', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;UNTIL=20310405T090000Z');

    const instances = instancesOf(
      await api.listEvents(isoPlusDays(SERIES_START, 20), isoPlusDays(SERIES_START, 40)),
      parent.id,
    );
    expect(instances).toHaveLength(0);
  });

  test('a recurring series is not materialised as separate rows', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=10');

    // Reading the parent by id gives one row, not ten.
    const res = await api.get(`/events/${parent.id}`);
    expect(res.status()).toBe(200);
    expect(((await res.json()) as { rrule: string }).rrule).toBe('FREQ=DAILY;COUNT=10');
  });

  test('respects the category filter for recurring series', async ({ api, category }) => {
    const work = await api.createCategory('Work ' + Date.now(), '#10B981');
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=3');

    const filtered = await api.listEvents(RANGE.start, RANGE.end, [work.id]);
    expect(instancesOf(filtered, parent.id)).toHaveLength(0);
  });
});

test.describe('API — edit scope: instance', () => {
  test('overrides a single occurrence', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=5');
    const second = isoPlusDays(SERIES_START, 1);

    const res = await api.patch(
      `/events/${parent.id}?scope=instance&instanceDate=${encodeURIComponent(second)}`,
      { title: 'Special standup' },
    );
    expect(res.status()).toBe(200);

    const instances = instancesOf(await api.listEvents(RANGE.start, RANGE.end), parent.id);
    const titles = instances.map((i) => i.title);

    expect(titles).toContain('Special standup');
    expect(titles.filter((t) => t === 'Standup')).toHaveLength(4);
  });

  test('leaves the series length unchanged', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=5');
    const second = isoPlusDays(SERIES_START, 1);

    await api.patch(
      `/events/${parent.id}?scope=instance&instanceDate=${encodeURIComponent(second)}`,
      { title: 'Special standup' },
    );

    const instances = instancesOf(await api.listEvents(RANGE.start, RANGE.end), parent.id);
    expect(instances).toHaveLength(5);
  });

  test('leaves the parent row untouched', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=5');
    const second = isoPlusDays(SERIES_START, 1);

    await api.patch(
      `/events/${parent.id}?scope=instance&instanceDate=${encodeURIComponent(second)}`,
      { title: 'Special standup' },
    );

    const stored = (await (await api.get(`/events/${parent.id}`)).json()) as { title: string };
    expect(stored.title).toBe('Standup');
  });

  test('can move a single occurrence to a different time', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=5');
    const second = isoPlusDays(SERIES_START, 1);
    const movedStart = isoPlusHours(second, 3);

    await api.patch(
      `/events/${parent.id}?scope=instance&instanceDate=${encodeURIComponent(second)}`,
      { startAt: movedStart, endAt: isoPlusHours(movedStart, 1) },
    );

    const instances = instancesOf(await api.listEvents(RANGE.start, RANGE.end), parent.id);
    expect(instances.map((i) => i.startAt)).toContain(movedStart);
  });

  test('re-editing the same occurrence replaces the previous override', async ({
    api,
    category,
  }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=5');
    const second = isoPlusDays(SERIES_START, 1);
    const url = `/events/${parent.id}?scope=instance&instanceDate=${encodeURIComponent(second)}`;

    await api.patch(url, { title: 'First override' });
    await api.patch(url, { title: 'Second override' });

    const titles = instancesOf(await api.listEvents(RANGE.start, RANGE.end), parent.id).map(
      (i) => i.title,
    );
    expect(titles).toContain('Second override');
    expect(titles).not.toContain('First override');
  });

  test('requires an instanceDate', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=5');

    const res = await api.patch(`/events/${parent.id}?scope=instance`, { title: 'No date' });
    expect(res.status()).toBe(400);
  });

  test('rejects a malformed instanceDate', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=5');

    const res = await api.patch(`/events/${parent.id}?scope=instance&instanceDate=yesterday`, {
      title: 'Bad date',
    });
    expect(res.status()).toBe(400);
  });

  test('rejects an unknown scope', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=5');

    const res = await api.patch(`/events/${parent.id}?scope=everything`, { title: 'x' });
    expect(res.status()).toBe(400);
  });
});

test.describe('API — edit scope: all', () => {
  test('renames every occurrence', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=4');

    const res = await api.patch(`/events/${parent.id}?scope=all`, { title: 'Renamed series' });
    expect(res.status()).toBe(200);

    const instances = instancesOf(await api.listEvents(RANGE.start, RANGE.end), parent.id);
    expect(instances).toHaveLength(4);
    expect(instances.every((i) => i.title === 'Renamed series')).toBe(true);
  });

  test('updates the stored parent row', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=4');
    await api.patch(`/events/${parent.id}?scope=all`, { title: 'Renamed series' });

    const stored = (await (await api.get(`/events/${parent.id}`)).json()) as { title: string };
    expect(stored.title).toBe('Renamed series');
  });

  test('can change the recurrence rule itself', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=10');

    await api.patch(`/events/${parent.id}?scope=all`, { rrule: 'FREQ=DAILY;COUNT=2' });

    const instances = instancesOf(await api.listEvents(RANGE.start, RANGE.end), parent.id);
    expect(instances).toHaveLength(2);
  });

  test('an update with no scope behaves like a direct edit', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=3');

    await api.patch(`/events/${parent.id}`, { location: 'Room 9' });

    const stored = (await (await api.get(`/events/${parent.id}`)).json()) as { location: string };
    expect(stored.location).toBe('Room 9');
  });
});

test.describe('API — edit scope: following', () => {
  test('splits the series at the given occurrence', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=6');
    const third = isoPlusDays(SERIES_START, 2);

    const res = await api.patch(
      `/events/${parent.id}?scope=following&instanceDate=${encodeURIComponent(third)}`,
      { title: 'New chapter' },
    );
    expect(res.status()).toBe(200);

    const all = await api.listEvents(RANGE.start, RANGE.end);
    const titles = all.map((e) => e.title);

    expect(titles).toContain('Standup');
    expect(titles).toContain('New chapter');
  });

  test('earlier occurrences keep the original values', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=6');
    const third = isoPlusDays(SERIES_START, 2);

    await api.patch(
      `/events/${parent.id}?scope=following&instanceDate=${encodeURIComponent(third)}`,
      { title: 'New chapter' },
    );

    const original = instancesOf(await api.listEvents(RANGE.start, RANGE.end), parent.id);
    expect(original.length).toBeGreaterThanOrEqual(1);
    expect(original.every((i) => i.title === 'Standup')).toBe(true);
    expect(new Date(original[original.length - 1].startAt).getTime()).toBeLessThan(
      new Date(third).getTime(),
    );
  });

  test('requires an instanceDate', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=6');

    const res = await api.patch(`/events/${parent.id}?scope=following`, { title: 'x' });
    expect(res.status()).toBe(400);
  });
});

test.describe('API — delete scopes', () => {
  test('deleting one instance removes only that occurrence', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=5');
    const second = isoPlusDays(SERIES_START, 1);

    const res = await api.delete(
      `/events/${parent.id}?scope=instance&instanceDate=${encodeURIComponent(second)}`,
    );
    expect(res.status()).toBe(204);

    const instances = instancesOf(await api.listEvents(RANGE.start, RANGE.end), parent.id);
    expect(instances).toHaveLength(4);
    expect(instances.map((i) => i.startAt)).not.toContain(second);
  });

  test('the excluded date is recorded on the parent', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=5');
    const second = isoPlusDays(SERIES_START, 1);

    await api.delete(
      `/events/${parent.id}?scope=instance&instanceDate=${encodeURIComponent(second)}`,
    );

    const stored = (await (await api.get(`/events/${parent.id}`)).json()) as {
      exDates: string[] | null;
    };
    expect(stored.exDates ?? []).toHaveLength(1);
  });

  test('deleting two instances excludes both', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=5');

    for (const offset of [1, 3]) {
      const date = isoPlusDays(SERIES_START, offset);
      await api.delete(
        `/events/${parent.id}?scope=instance&instanceDate=${encodeURIComponent(date)}`,
      );
    }

    const instances = instancesOf(await api.listEvents(RANGE.start, RANGE.end), parent.id);
    expect(instances).toHaveLength(3);
  });

  test('deleting an instance requires an instanceDate', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=5');

    expect((await api.delete(`/events/${parent.id}?scope=instance`)).status()).toBe(400);
  });

  test('scope=following truncates the series', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=6');
    const fourth = isoPlusDays(SERIES_START, 3);

    const res = await api.delete(
      `/events/${parent.id}?scope=following&instanceDate=${encodeURIComponent(fourth)}`,
    );
    expect(res.status()).toBe(204);

    const instances = instancesOf(await api.listEvents(RANGE.start, RANGE.end), parent.id);
    expect(instances).toHaveLength(3);
  });

  test('scope=all removes the whole series', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=5');

    const res = await api.delete(`/events/${parent.id}?scope=all`);
    expect(res.status()).toBe(204);

    const instances = instancesOf(await api.listEvents(RANGE.start, RANGE.end), parent.id);
    expect(instances).toHaveLength(0);
  });

  test('deleting with no scope removes the whole series', async ({ api, category }) => {
    const parent = await createSeries(api, category.id, 'FREQ=DAILY;COUNT=5');

    await api.delete(`/events/${parent.id}`);

    const instances = instancesOf(await api.listEvents(RANGE.start, RANGE.end), parent.id);
    expect(instances).toHaveLength(0);
  });

  test("cannot delete an instance of another user's series", async ({ api, otherApi }) => {
    const foreignCategory = await otherApi.defaultCategory();
    const foreignParent = await createSeries(otherApi, foreignCategory.id, 'FREQ=DAILY;COUNT=5');
    const second = isoPlusDays(SERIES_START, 1);

    const res = await api.delete(
      `/events/${foreignParent.id}?scope=instance&instanceDate=${encodeURIComponent(second)}`,
    );
    expect(res.status()).toBe(404);
  });
});

test.describe('API — recurring tasks', () => {
  test('creates a task with a recurrence rule', async ({ api, category }) => {
    const task = await api.createTask({
      title: 'Weekly review',
      categoryId: category.id,
      dueAt: SERIES_START,
      rrule: 'FREQ=WEEKLY',
    });

    expect(task.rrule).toBe('FREQ=WEEKLY');
  });

  test('rejects an invalid task recurrence rule', async ({ api, category }) => {
    const res = await api.post('/tasks', {
      title: 'Broken',
      categoryId: category.id,
      dueAt: SERIES_START,
      rrule: 'NOT A RULE',
    });

    expect(res.status()).toBe(422);
  });

  test('a recurring task parent appears once in the listing', async ({ api, category }) => {
    const task = await api.createTask({
      title: 'Weekly review',
      categoryId: category.id,
      dueAt: SERIES_START,
      rrule: 'FREQ=WEEKLY;COUNT=4',
    });

    const listed = (await api.listTasks()).filter((t) => t.id === task.id);
    expect(listed).toHaveLength(1);
  });
});
