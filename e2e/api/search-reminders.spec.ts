import { errorBody } from '../support/api';
import { ANCHOR, isoPlusDays, isoPlusHours } from '../support/dates';
import { expect, test } from '../support/fixtures';

/**
 * Full-text search, reminders, push subscriptions and the SSE stream.
 */

interface SearchResults {
  events: { id: string; title: string }[];
  tasks: { id: string; title: string }[];
}

async function search(
  api: {
    get: (p: string, q?: Record<string, string>) => Promise<{ json: () => Promise<unknown> }>;
  },
  q: string,
): Promise<SearchResults> {
  const res = await api.get('/search', { q });
  return (await res.json()) as SearchResults;
}

test.describe('API — search', () => {
  test('finds an event by a word in its title', async ({ api, category }) => {
    const event = await api.createEvent({
      title: 'Quarterly planning offsite',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: category.id,
    });

    const results = await search(api, 'quarterly');
    expect(results.events.map((e) => e.id)).toContain(event.id);
  });

  test('finds a task by a word in its title', async ({ api, category }) => {
    const task = await api.createTask({ title: 'Renew passport', categoryId: category.id });

    const results = await search(api, 'passport');
    expect(results.tasks.map((t) => t.id)).toContain(task.id);
  });

  test('matches on a prefix', async ({ api, category }) => {
    const event = await api.createEvent({
      title: 'Retrospective',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: category.id,
    });

    const results = await search(api, 'retro');
    expect(results.events.map((e) => e.id)).toContain(event.id);
  });

  test('is case-insensitive', async ({ api, category }) => {
    const event = await api.createEvent({
      title: 'Onboarding session',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: category.id,
    });

    const results = await search(api, 'ONBOARDING');
    expect(results.events.map((e) => e.id)).toContain(event.id);
  });

  test('searches descriptions as well as titles', async ({ api, category }) => {
    const event = await api.createEvent({
      title: 'Sync',
      description: 'Discuss the telemetry rollout',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: category.id,
    });

    const results = await search(api, 'telemetry');
    expect(results.events.map((e) => e.id)).toContain(event.id);
  });

  test('returns both events and tasks in one payload', async ({ api, category }) => {
    const token = 'zylophone' + Date.now().toString(36);
    const event = await api.createEvent({
      title: `Event ${token}`,
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: category.id,
    });
    const task = await api.createTask({ title: `Task ${token}`, categoryId: category.id });

    const results = await search(api, token);
    expect(results.events.map((e) => e.id)).toContain(event.id);
    expect(results.tasks.map((t) => t.id)).toContain(task.id);
  });

  test('returns empty arrays when nothing matches', async ({ api }) => {
    const results = await search(api, 'zzzznomatchzzzz');

    expect(results.events).toEqual([]);
    expect(results.tasks).toEqual([]);
  });

  test('excludes soft-deleted events', async ({ api, category }) => {
    const token = 'deleted' + Date.now().toString(36);
    const event = await api.createEvent({
      title: `Gone ${token}`,
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: category.id,
    });
    await api.delete(`/events/${event.id}`);

    const results = await search(api, token);
    expect(results.events).toEqual([]);
  });

  test('excludes soft-deleted tasks', async ({ api, category }) => {
    const token = 'gonetask' + Date.now().toString(36);
    const task = await api.createTask({ title: `Gone ${token}`, categoryId: category.id });
    await api.delete(`/tasks/${task.id}`);

    const results = await search(api, token);
    expect(results.tasks).toEqual([]);
  });

  test("never returns another user's records", async ({ api, otherApi }) => {
    const token = 'private' + Date.now().toString(36);
    const foreignCategory = await otherApi.defaultCategory();
    await otherApi.createEvent({
      title: `Secret ${token}`,
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: foreignCategory.id,
    });

    const results = await search(api, token);
    expect(results.events).toEqual([]);
  });

  test('honours the limit parameter', async ({ api, category }) => {
    const token = 'many' + Date.now().toString(36);
    for (let i = 0; i < 6; i += 1) {
      await api.createEvent({
        title: `${token} item ${i}`,
        startAt: isoPlusHours(ANCHOR, i),
        endAt: isoPlusHours(ANCHOR, i + 1),
        categoryId: category.id,
      });
    }

    // The limit is a combined budget: the service gives each of events and
    // tasks ceil(limit / 2), so limit=2 caps events at 1 even though 6 match.
    const res = await api.get('/search', { q: token, limit: 2 });
    expect(res.status()).toBe(200);

    const results = (await res.json()) as SearchResults;
    expect(results.events).toHaveLength(1);
  });

  test('returns more results as the limit grows', async ({ api, category }) => {
    const token = 'grow' + Date.now().toString(36);
    for (let i = 0; i < 6; i += 1) {
      await api.createEvent({
        title: `${token} item ${i}`,
        startAt: isoPlusHours(ANCHOR, i),
        endAt: isoPlusHours(ANCHOR, i + 1),
        categoryId: category.id,
      });
    }

    const res = await api.get('/search', { q: token, limit: 8 });
    const results = (await res.json()) as SearchResults;
    expect(results.events).toHaveLength(4);
  });

  test('rejects a query shorter than two characters', async ({ api }) => {
    const res = await api.get('/search', { q: 'a' });
    expect(res.status()).toBe(400);
    expect((await errorBody(res)).code).toBe('VALIDATION_ERROR');
  });

  test('rejects a missing query', async ({ api }) => {
    expect((await api.get('/search')).status()).toBe(400);
  });

  test('rejects a query longer than 100 characters', async ({ api }) => {
    expect((await api.get('/search', { q: 'x'.repeat(101) })).status()).toBe(400);
  });

  test('rejects a limit above 50', async ({ api }) => {
    expect((await api.get('/search', { q: 'test', limit: 51 })).status()).toBe(400);
  });

  test('neutralises tsquery punctuation instead of erroring', async ({ api }) => {
    const res = await api.get('/search', { q: "!!! & | ' ()" });

    expect(res.status()).toBe(200);
    const results = (await res.json()) as SearchResults;
    expect(results.events).toEqual([]);
  });

  test('is not vulnerable to SQL injection through the query', async ({ api, category }) => {
    await api.createEvent({
      title: 'Still here',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: category.id,
    });

    const res = await api.get('/search', { q: "x'; DROP TABLE events; --" });
    expect(res.status()).toBe(200);

    // The table is intact.
    expect((await api.listEvents(isoPlusDays(ANCHOR, -1), isoPlusDays(ANCHOR, 1))).length).toBe(1);
  });

  test('search requires authentication', async ({ anonApi }) => {
    expect((await anonApi.get('/search', { q: 'test' })).status()).toBe(401);
  });
});

test.describe('API — reminders', () => {
  test('creates a reminder for an event', async ({ api, category }) => {
    const event = await api.createEvent({
      title: 'Dentist',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: category.id,
    });

    const res = await api.post('/reminders', {
      itemType: 'event',
      itemId: event.id,
      minutesBefore: 30,
      method: 'push',
    });

    expect(res.status()).toBe(201);
    expect(((await res.json()) as { minutesBefore: number }).minutesBefore).toBe(30);
  });

  test('creates a reminder for a task with a due date', async ({ api, category }) => {
    const task = await api.createTask({
      title: 'Pay invoice',
      categoryId: category.id,
      dueAt: isoPlusDays(ANCHOR, 1),
    });

    const res = await api.post('/reminders', {
      itemType: 'task',
      itemId: task.id,
      minutesBefore: 60,
    });

    expect(res.status()).toBe(201);
  });

  test('defaults the delivery method to push', async ({ api, category }) => {
    const event = await api.createEvent({
      title: 'Dentist',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: category.id,
    });

    const res = await api.post('/reminders', {
      itemType: 'event',
      itemId: event.id,
      minutesBefore: 10,
    });

    expect(((await res.json()) as { method: string }).method).toBe('push');
  });

  test('accepts the email and both methods', async ({ api, category }) => {
    const event = await api.createEvent({
      title: 'Dentist',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: category.id,
    });

    for (const method of ['email', 'both'] as const) {
      const res = await api.post('/reminders', {
        itemType: 'event',
        itemId: event.id,
        minutesBefore: 5,
        method,
      });
      expect(res.status()).toBe(201);
    }
  });

  test('lists reminders for an item', async ({ api, category }) => {
    const event = await api.createEvent({
      title: 'Dentist',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: category.id,
    });
    await api.post('/reminders', { itemType: 'event', itemId: event.id, minutesBefore: 15 });

    const res = await api.get('/reminders', { itemType: 'event', itemId: event.id });
    expect(res.status()).toBe(200);
    expect((await res.json()) as unknown[]).toHaveLength(1);
  });

  test('deletes a reminder', async ({ api, category }) => {
    const event = await api.createEvent({
      title: 'Dentist',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: category.id,
    });
    const created = (await (
      await api.post('/reminders', { itemType: 'event', itemId: event.id, minutesBefore: 15 })
    ).json()) as { id: string };

    expect((await api.delete(`/reminders/${created.id}`)).status()).toBe(204);

    const remaining = (await (
      await api.get('/reminders', { itemType: 'event', itemId: event.id })
    ).json()) as unknown[];
    expect(remaining).toHaveLength(0);
  });

  test('rejects a negative lead time', async ({ api, category }) => {
    const event = await api.createEvent({
      title: 'Dentist',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: category.id,
    });

    const res = await api.post('/reminders', {
      itemType: 'event',
      itemId: event.id,
      minutesBefore: -5,
    });
    expect(res.status()).toBe(400);
  });

  test('rejects a lead time beyond four weeks', async ({ api, category }) => {
    const event = await api.createEvent({
      title: 'Dentist',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: category.id,
    });

    const res = await api.post('/reminders', {
      itemType: 'event',
      itemId: event.id,
      minutesBefore: 40321,
    });
    expect(res.status()).toBe(400);
  });

  test('rejects an unknown item type', async ({ api }) => {
    const res = await api.post('/reminders', {
      itemType: 'meeting',
      itemId: 'a'.repeat(24),
      minutesBefore: 10,
    });
    expect(res.status()).toBe(400);
  });

  test('rejects an unknown delivery method', async ({ api, category }) => {
    const event = await api.createEvent({
      title: 'Dentist',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: category.id,
    });

    const res = await api.post('/reminders', {
      itemType: 'event',
      itemId: event.id,
      minutesBefore: 10,
      method: 'carrier-pigeon',
    });
    expect(res.status()).toBe(400);
  });

  test('returns 404 for an unknown item', async ({ api }) => {
    const res = await api.post('/reminders', {
      itemType: 'event',
      itemId: 'a'.repeat(24),
      minutesBefore: 10,
    });
    expect(res.status()).toBe(404);
  });

  test("cannot attach a reminder to another user's event", async ({ api, otherApi }) => {
    const foreignCategory = await otherApi.defaultCategory();
    const foreignEvent = await otherApi.createEvent({
      title: 'Foreign',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: foreignCategory.id,
    });

    const res = await api.post('/reminders', {
      itemType: 'event',
      itemId: foreignEvent.id,
      minutesBefore: 10,
    });
    expect(res.status()).toBe(404);
  });

  test('deleting an unknown reminder returns 404', async ({ api }) => {
    expect((await api.delete(`/reminders/${'a'.repeat(24)}`)).status()).toBe(404);
  });

  test('listing reminders requires an item reference', async ({ api }) => {
    expect((await api.get('/reminders')).status()).toBe(400);
  });

  test('reminders require authentication', async ({ anonApi }) => {
    const res = await anonApi.get('/reminders', { itemType: 'event', itemId: 'a'.repeat(24) });
    expect(res.status()).toBe(401);
  });
});

test.describe('API — push subscriptions', () => {
  test('exposes the VAPID public key endpoint', async ({ api }) => {
    const res = await api.get('/push-subscriptions/vapid-key');

    expect(res.status()).toBe(200);
    expect(await res.json()).toHaveProperty('vapidPublicKey');
  });

  test('lists no subscriptions for a fresh account', async ({ api }) => {
    const res = await api.get('/push-subscriptions');

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test('rejects a subscription with a missing endpoint', async ({ api }) => {
    const res = await api.post('/push-subscriptions', { p256dh: 'key', auth: 'auth' });
    expect(res.status()).toBe(400);
  });

  test('rejects a subscription with a non-URL endpoint', async ({ api }) => {
    const res = await api.post('/push-subscriptions', {
      endpoint: 'not-a-url',
      p256dh: 'key',
      auth: 'auth',
    });
    expect(res.status()).toBe(400);
  });

  test('push subscriptions require authentication', async ({ anonApi }) => {
    expect((await anonApi.get('/push-subscriptions')).status()).toBe(401);
  });
});

test.describe('API — SSE stream', () => {
  test('rejects an unauthenticated connection', async ({ anonApi }) => {
    const res = await anonApi.get('/stream');
    expect(res.status()).toBe(401);
  });

  test('rejects an invalid session token', async ({ anonApi }) => {
    const res = await anonApi.get('/stream', { token: 'not-a-real-session' });
    expect(res.status()).toBe(401);
  });
});
