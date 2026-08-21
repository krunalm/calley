import { errorBody } from '../support/api';
import { ANCHOR, isoPlusDays, isoPlusHours, utcAt, wideRange } from '../support/dates';
import { expect, test } from '../support/fixtures';

/**
 * Event CRUD contract: creation, validation, reads, updates, deletes,
 * duplication and ICS export.
 */

const RANGE = wideRange(ANCHOR);

/** Minimal valid payload — spread over it to vary one field at a time. */
function eventPayload(categoryId: string, overrides: Record<string, unknown> = {}) {
  return {
    title: 'Design review',
    startAt: ANCHOR,
    endAt: isoPlusHours(ANCHOR, 1),
    categoryId,
    ...overrides,
  };
}

test.describe('API — create event', () => {
  test('creates an event and echoes the stored fields', async ({ api, category }) => {
    const res = await api.post('/events', eventPayload(category.id));
    expect(res.status()).toBe(201);

    const event = (await res.json()) as Record<string, unknown>;
    expect(event.title).toBe('Design review');
    expect(event.categoryId).toBe(category.id);
    expect(new Date(event.startAt as string).toISOString()).toBe(ANCHOR);
  });

  test('defaults isAllDay to false and visibility to private', async ({ api, category }) => {
    const event = await api.createEvent(eventPayload(category.id));

    expect(event.isAllDay).toBe(false);
    expect(event.visibility).toBe('private');
  });

  test('stores an optional description and location', async ({ api, category }) => {
    const event = await api.createEvent(
      eventPayload(category.id, { description: 'Agenda items', location: 'Room 4' }),
    );

    expect(event.description).toBe('Agenda items');
    expect(event.location).toBe('Room 4');
  });

  test('accepts an explicit colour override', async ({ api, category }) => {
    const event = await api.createEvent(eventPayload(category.id, { color: '#FF5733' }));
    expect(event.color).toBe('#FF5733');
  });

  test('accepts a public visibility', async ({ api, category }) => {
    const event = await api.createEvent(eventPayload(category.id, { visibility: 'public' }));
    expect(event.visibility).toBe('public');
  });

  test('creates an all-day event', async ({ api, category }) => {
    const event = await api.createEvent(
      eventPayload(category.id, {
        isAllDay: true,
        startAt: utcAt(2031, 3, 12, 0),
        endAt: utcAt(2031, 3, 12, 0),
      }),
    );

    expect(event.isAllDay).toBe(true);
  });

  test('strips script tags out of the description', async ({ api, category }) => {
    const event = await api.createEvent(
      eventPayload(category.id, {
        description: 'Safe text<script>alert("xss")</script>',
      }),
    );

    expect(event.description).not.toContain('<script');
    expect(event.description).not.toContain('alert(');
    expect(event.description).toContain('Safe text');
  });

  test('strips inline event handlers out of the description', async ({ api, category }) => {
    const event = await api.createEvent(
      eventPayload(category.id, { description: '<img src=x onerror="alert(1)">caption' }),
    );

    expect(event.description).not.toContain('onerror');
  });

  test('keeps allowed formatting tags in the description', async ({ api, category }) => {
    const event = await api.createEvent(
      eventPayload(category.id, { description: '<b>bold</b> and <i>italic</i>' }),
    );

    expect(event.description).toContain('bold');
    expect(event.description).toContain('italic');
  });

  test('rejects an end time before the start time', async ({ api, category }) => {
    const res = await api.post(
      '/events',
      eventPayload(category.id, { endAt: isoPlusHours(ANCHOR, -1) }),
    );

    expect(res.status()).toBe(400);
    const err = await errorBody(res);
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  test('rejects an end time equal to the start time for timed events', async ({
    api,
    category,
  }) => {
    const res = await api.post('/events', eventPayload(category.id, { endAt: ANCHOR }));
    expect(res.status()).toBe(400);
  });

  test('rejects an empty title', async ({ api, category }) => {
    const res = await api.post('/events', eventPayload(category.id, { title: '   ' }));
    expect(res.status()).toBe(400);
  });

  test('rejects a title longer than 200 characters', async ({ api, category }) => {
    const res = await api.post('/events', eventPayload(category.id, { title: 'x'.repeat(201) }));
    expect(res.status()).toBe(400);
  });

  test('accepts a title of exactly 200 characters', async ({ api, category }) => {
    const event = await api.createEvent(eventPayload(category.id, { title: 'x'.repeat(200) }));
    expect(event.title).toHaveLength(200);
  });

  test('rejects a description longer than 5000 characters', async ({ api, category }) => {
    const res = await api.post(
      '/events',
      eventPayload(category.id, { description: 'x'.repeat(5001) }),
    );
    expect(res.status()).toBe(400);
  });

  test('rejects a location longer than 500 characters', async ({ api, category }) => {
    const res = await api.post('/events', eventPayload(category.id, { location: 'x'.repeat(501) }));
    expect(res.status()).toBe(400);
  });

  test('rejects a malformed hex colour', async ({ api, category }) => {
    const res = await api.post('/events', eventPayload(category.id, { color: 'red' }));
    expect(res.status()).toBe(400);
  });

  test('rejects a non-ISO start time', async ({ api, category }) => {
    const res = await api.post('/events', eventPayload(category.id, { startAt: '12 March 2031' }));
    expect(res.status()).toBe(400);
  });

  test('rejects a missing category', async ({ api }) => {
    const res = await api.post('/events', {
      title: 'No category',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
    });
    expect(res.status()).toBe(400);
  });

  test('rejects a category id that is not a CUID2', async ({ api }) => {
    const res = await api.post('/events', eventPayload('nope'));
    expect(res.status()).toBe(400);
  });

  test('rejects a category that does not exist', async ({ api }) => {
    const res = await api.post('/events', eventPayload('a'.repeat(24)));
    expect(res.status()).toBe(404);
    expect((await errorBody(res)).code).toBe('NOT_FOUND');
  });

  test("rejects another user's category", async ({ api, otherApi }) => {
    const foreign = await otherApi.defaultCategory();

    const res = await api.post('/events', eventPayload(foreign.id));
    expect(res.status()).toBe(404);
  });

  test('rejects an unknown visibility value', async ({ api, category }) => {
    const res = await api.post('/events', eventPayload(category.id, { visibility: 'secret' }));
    expect(res.status()).toBe(400);
  });

  test('creating an event requires authentication', async ({ anonApi, category }) => {
    const res = await anonApi.post('/events', eventPayload(category.id));
    expect(res.status()).toBe(401);
  });

  test('creates an inline reminder when requested', async ({ api, category }) => {
    const event = await api.createEvent(
      eventPayload(category.id, { reminder: { minutesBefore: 15, method: 'push' } }),
    );

    const reminders = (await (
      await api.get('/reminders', { itemType: 'event', itemId: event.id })
    ).json()) as { minutesBefore: number }[];

    expect(reminders).toHaveLength(1);
    expect(reminders[0].minutesBefore).toBe(15);
  });

  test('rejects an inline reminder further out than four weeks', async ({ api, category }) => {
    const res = await api.post(
      '/events',
      eventPayload(category.id, { reminder: { minutesBefore: 40321, method: 'push' } }),
    );
    expect(res.status()).toBe(400);
  });
});

test.describe('API — read events', () => {
  test('fetches a single event by id', async ({ api, category }) => {
    const created = await api.createEvent(eventPayload(category.id));

    const res = await api.get(`/events/${created.id}`);
    expect(res.status()).toBe(200);
    expect(((await res.json()) as { id: string }).id).toBe(created.id);
  });

  test('returns 404 for an unknown event id', async ({ api }) => {
    const res = await api.get(`/events/${'b'.repeat(24)}`);
    expect(res.status()).toBe(404);
  });

  /**
   * Recurrence is expanded per request rather than materialised, so the work a
   * listing does grows with the span asked for. Without a ceiling, one request
   * could ask the server to expand every daily series across centuries.
   */
  test('rejects a listing range wider than the supported window', async ({ api }) => {
    const res = await api.get(
      `/events?start=${encodeURIComponent(isoPlusDays(ANCHOR, -400))}` +
        `&end=${encodeURIComponent(isoPlusDays(ANCHOR, 400))}`,
    );

    expect(res.status()).toBe(400);
    expect((await errorBody(res)).code).toBe('VALIDATION_ERROR');
  });

  test('accepts a listing range inside the supported window', async ({ api }) => {
    const res = await api.get(
      `/events?start=${encodeURIComponent(isoPlusDays(ANCHOR, -30))}` +
        `&end=${encodeURIComponent(isoPlusDays(ANCHOR, 30))}`,
    );

    expect(res.status()).toBe(200);
  });

  test('returns 400 for a malformed event id', async ({ api }) => {
    const res = await api.get('/events/not-a-cuid');
    expect(res.status()).toBe(400);
  });

  test("returns 404 for another user's event (no IDOR)", async ({ api, otherApi }) => {
    const foreignCategory = await otherApi.defaultCategory();
    const foreignEvent = await otherApi.createEvent(eventPayload(foreignCategory.id));

    const res = await api.get(`/events/${foreignEvent.id}`);
    expect(res.status()).toBe(404);
  });

  test('lists events that fall inside the requested range', async ({ api, category }) => {
    const created = await api.createEvent(eventPayload(category.id, { title: 'In range' }));

    const events = await api.listEvents(RANGE.start, RANGE.end);
    expect(events.map((e) => e.id)).toContain(created.id);
  });

  test('excludes events outside the requested range', async ({ api, category }) => {
    const created = await api.createEvent(eventPayload(category.id));

    const events = await api.listEvents(isoPlusDays(ANCHOR, 30), isoPlusDays(ANCHOR, 60));
    expect(events.map((e) => e.id)).not.toContain(created.id);
  });

  test('includes an event that only partially overlaps the range', async ({ api, category }) => {
    const created = await api.createEvent(
      eventPayload(category.id, { startAt: ANCHOR, endAt: isoPlusHours(ANCHOR, 6) }),
    );

    const events = await api.listEvents(isoPlusHours(ANCHOR, 3), isoPlusHours(ANCHOR, 9));
    expect(events.map((e) => e.id)).toContain(created.id);
  });

  test('filters by a single category', async ({ api, category }) => {
    const work = await api.createCategory('Work ' + Date.now(), '#10B981');
    const personalEvent = await api.createEvent(eventPayload(category.id, { title: 'Personal' }));
    const workEvent = await api.createEvent(eventPayload(work.id, { title: 'Work' }));

    const events = await api.listEvents(RANGE.start, RANGE.end, [work.id]);
    const ids = events.map((e) => e.id);

    expect(ids).toContain(workEvent.id);
    expect(ids).not.toContain(personalEvent.id);
  });

  test('filters by multiple categories', async ({ api, category }) => {
    const work = await api.createCategory('Work ' + Date.now(), '#10B981');
    const a = await api.createEvent(eventPayload(category.id));
    const b = await api.createEvent(eventPayload(work.id));

    const events = await api.listEvents(RANGE.start, RANGE.end, [category.id, work.id]);
    const ids = events.map((e) => e.id);

    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
  });

  test('a new account starts with an empty calendar', async ({ api }) => {
    const events = await api.listEvents(RANGE.start, RANGE.end);
    expect(events).toEqual([]);
  });

  test("never returns another user's events", async ({ api, otherApi }) => {
    const foreignCategory = await otherApi.defaultCategory();
    await otherApi.createEvent(eventPayload(foreignCategory.id, { title: 'Foreign' }));

    const events = await api.listEvents(RANGE.start, RANGE.end);
    expect(events).toEqual([]);
  });

  test('rejects a range whose start is after its end', async ({ api }) => {
    const res = await api.get('/events', { start: RANGE.end, end: RANGE.start });
    expect(res.status()).toBe(400);
  });

  test('rejects a listing with no range at all', async ({ api }) => {
    const res = await api.get('/events');
    expect(res.status()).toBe(400);
  });

  test('rejects a category filter that is not a CUID2', async ({ api }) => {
    const res = await api.get('/events', {
      start: RANGE.start,
      end: RANGE.end,
      categoryIds: 'bogus',
    });
    expect(res.status()).toBe(400);
  });

  test('listing requires authentication', async ({ anonApi }) => {
    const res = await anonApi.get('/events', { start: RANGE.start, end: RANGE.end });
    expect(res.status()).toBe(401);
  });
});

test.describe('API — update event', () => {
  test('updates the title', async ({ api, category }) => {
    const created = await api.createEvent(eventPayload(category.id));

    const res = await api.patch(`/events/${created.id}`, { title: 'Renamed' });
    expect(res.status()).toBe(200);
    expect(((await res.json()) as { title: string }).title).toBe('Renamed');
  });

  test('updates the start and end times together', async ({ api, category }) => {
    const created = await api.createEvent(eventPayload(category.id));
    const newStart = isoPlusHours(ANCHOR, 5);
    const newEnd = isoPlusHours(ANCHOR, 6);

    const res = await api.patch(`/events/${created.id}`, { startAt: newStart, endAt: newEnd });
    expect(res.status()).toBe(200);

    const updated = (await res.json()) as { startAt: string; endAt: string };
    expect(new Date(updated.startAt).toISOString()).toBe(newStart);
    expect(new Date(updated.endAt).toISOString()).toBe(newEnd);
  });

  test('leaves untouched fields alone on a partial update', async ({ api, category }) => {
    const created = await api.createEvent(
      eventPayload(category.id, { location: 'Room 4', description: 'Notes' }),
    );

    await api.patch(`/events/${created.id}`, { title: 'Only the title' });

    const after = (await (await api.get(`/events/${created.id}`)).json()) as {
      location: string;
      description: string;
    };
    expect(after.location).toBe('Room 4');
    expect(after.description).toBe('Notes');
  });

  test('moves an event to another category', async ({ api, category }) => {
    const created = await api.createEvent(eventPayload(category.id));
    const work = await api.createCategory('Work ' + Date.now(), '#10B981');

    const res = await api.patch(`/events/${created.id}`, { categoryId: work.id });
    expect(res.status()).toBe(200);
    expect(((await res.json()) as { categoryId: string }).categoryId).toBe(work.id);
  });

  test('clears a colour override with null', async ({ api, category }) => {
    const created = await api.createEvent(eventPayload(category.id, { color: '#FF5733' }));

    const res = await api.patch(`/events/${created.id}`, { color: null });
    expect(res.status()).toBe(200);
    expect(((await res.json()) as { color: string | null }).color).toBeNull();
  });

  test('flips an event to all-day', async ({ api, category }) => {
    const created = await api.createEvent(eventPayload(category.id));

    const res = await api.patch(`/events/${created.id}`, { isAllDay: true });
    expect(res.status()).toBe(200);
    expect(((await res.json()) as { isAllDay: boolean }).isAllDay).toBe(true);
  });

  test('sanitizes HTML on update too', async ({ api, category }) => {
    const created = await api.createEvent(eventPayload(category.id));

    const res = await api.patch(`/events/${created.id}`, {
      description: '<script>steal()</script>ok',
    });
    const updated = (await res.json()) as { description: string };

    expect(updated.description).not.toContain('<script');
  });

  test('rejects an update that inverts start and end', async ({ api, category }) => {
    const created = await api.createEvent(eventPayload(category.id));

    const res = await api.patch(`/events/${created.id}`, {
      startAt: isoPlusHours(ANCHOR, 4),
      endAt: isoPlusHours(ANCHOR, 2),
    });
    expect(res.status()).toBe(400);
  });

  test('rejects an empty title on update', async ({ api, category }) => {
    const created = await api.createEvent(eventPayload(category.id));

    const res = await api.patch(`/events/${created.id}`, { title: '' });
    expect(res.status()).toBe(400);
  });

  test('rejects a move into a category owned by someone else', async ({
    api,
    category,
    otherApi,
  }) => {
    const created = await api.createEvent(eventPayload(category.id));
    const foreign = await otherApi.defaultCategory();

    const res = await api.patch(`/events/${created.id}`, { categoryId: foreign.id });
    expect(res.status()).toBe(404);
  });

  test('returns 404 when updating an unknown event', async ({ api }) => {
    const res = await api.patch(`/events/${'c'.repeat(24)}`, { title: 'Ghost' });
    expect(res.status()).toBe(404);
  });

  test("returns 404 when updating another user's event", async ({ api, otherApi }) => {
    const foreignCategory = await otherApi.defaultCategory();
    const foreignEvent = await otherApi.createEvent(eventPayload(foreignCategory.id));

    const res = await api.patch(`/events/${foreignEvent.id}`, { title: 'Hijacked' });
    expect(res.status()).toBe(404);

    const stillThere = (await (await otherApi.get(`/events/${foreignEvent.id}`)).json()) as {
      title: string;
    };
    expect(stillThere.title).toBe('Design review');
  });

  test('updating requires authentication', async ({ anonApi }) => {
    const res = await anonApi.patch(`/events/${'d'.repeat(24)}`, { title: 'x' });
    expect(res.status()).toBe(401);
  });
});

test.describe('API — delete event', () => {
  test('deletes an event and returns 204', async ({ api, category }) => {
    const created = await api.createEvent(eventPayload(category.id));

    const res = await api.delete(`/events/${created.id}`);
    expect(res.status()).toBe(204);
  });

  test('a deleted event is no longer readable', async ({ api, category }) => {
    const created = await api.createEvent(eventPayload(category.id));
    await api.delete(`/events/${created.id}`);

    expect((await api.get(`/events/${created.id}`)).status()).toBe(404);
  });

  test('a deleted event drops out of the range listing (soft delete filter)', async ({
    api,
    category,
  }) => {
    const created = await api.createEvent(eventPayload(category.id));
    await api.delete(`/events/${created.id}`);

    const events = await api.listEvents(RANGE.start, RANGE.end);
    expect(events.map((e) => e.id)).not.toContain(created.id);
  });

  test('deleting twice returns 404 the second time', async ({ api, category }) => {
    const created = await api.createEvent(eventPayload(category.id));
    await api.delete(`/events/${created.id}`);

    expect((await api.delete(`/events/${created.id}`)).status()).toBe(404);
  });

  test('returns 404 when deleting an unknown event', async ({ api }) => {
    expect((await api.delete(`/events/${'e'.repeat(24)}`)).status()).toBe(404);
  });

  test("cannot delete another user's event", async ({ api, otherApi }) => {
    const foreignCategory = await otherApi.defaultCategory();
    const foreignEvent = await otherApi.createEvent(eventPayload(foreignCategory.id));

    expect((await api.delete(`/events/${foreignEvent.id}`)).status()).toBe(404);
    expect((await otherApi.get(`/events/${foreignEvent.id}`)).status()).toBe(200);
  });

  test('deleting requires authentication', async ({ anonApi }) => {
    expect((await anonApi.delete(`/events/${'f'.repeat(24)}`)).status()).toBe(401);
  });
});

test.describe('API — duplicate event', () => {
  test('creates an independent copy', async ({ api, category }) => {
    const created = await api.createEvent(
      eventPayload(category.id, { location: 'Room 4', description: 'Notes' }),
    );

    const res = await api.post(`/events/${created.id}/duplicate`);
    expect(res.status()).toBe(201);

    const copy = (await res.json()) as { id: string; title: string; location: string };
    expect(copy.id).not.toBe(created.id);
    expect(copy.title).toBe(created.title);
    expect(copy.location).toBe('Room 4');
  });

  test('the copy is standalone — recurrence is not carried over', async ({ api, category }) => {
    const created = await api.createEvent(
      eventPayload(category.id, { rrule: 'FREQ=WEEKLY;BYDAY=MO' }),
    );

    const copy = (await (await api.post(`/events/${created.id}/duplicate`)).json()) as {
      rrule: string | null;
      recurringEventId: string | null;
    };

    expect(copy.rrule).toBeNull();
    expect(copy.recurringEventId).toBeNull();
  });

  test('editing the copy leaves the original untouched', async ({ api, category }) => {
    const created = await api.createEvent(eventPayload(category.id));
    const copy = (await (await api.post(`/events/${created.id}/duplicate`)).json()) as {
      id: string;
    };

    await api.patch(`/events/${copy.id}`, { title: 'Copy edited' });

    const original = (await (await api.get(`/events/${created.id}`)).json()) as { title: string };
    expect(original.title).toBe('Design review');
  });

  test('returns 404 when duplicating an unknown event', async ({ api }) => {
    expect((await api.post(`/events/${'a'.repeat(24)}/duplicate`)).status()).toBe(404);
  });

  test("cannot duplicate another user's event", async ({ api, otherApi }) => {
    const foreignCategory = await otherApi.defaultCategory();
    const foreignEvent = await otherApi.createEvent(eventPayload(foreignCategory.id));

    expect((await api.post(`/events/${foreignEvent.id}/duplicate`)).status()).toBe(404);
  });
});

test.describe('API — ICS export', () => {
  test('serves a calendar content type', async ({ api, category }) => {
    const created = await api.createEvent(eventPayload(category.id));

    const res = await api.get(`/events/${created.id}/ics`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/calendar');
  });

  test('offers the file as a download', async ({ api, category }) => {
    const created = await api.createEvent(eventPayload(category.id));

    const res = await api.get(`/events/${created.id}/ics`);
    expect(res.headers()['content-disposition']).toContain('attachment');
    expect(res.headers()['content-disposition']).toContain('.ics');
  });

  test('emits a well-formed VCALENDAR envelope', async ({ api, category }) => {
    const created = await api.createEvent(eventPayload(category.id));
    const body = await (await api.get(`/events/${created.id}/ics`)).text();

    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('VERSION:2.0');
    expect(body).toContain('BEGIN:VEVENT');
    expect(body).toContain('END:VEVENT');
    expect(body).toContain('END:VCALENDAR');
  });

  test('includes the summary, uid and timestamps', async ({ api, category }) => {
    const created = await api.createEvent(eventPayload(category.id, { title: 'Design review' }));
    const body = await (await api.get(`/events/${created.id}/ics`)).text();

    expect(body).toContain('SUMMARY:Design review');
    expect(body).toContain(`UID:${created.id}@calley.app`);
    expect(body).toContain('DTSTART:');
    expect(body).toContain('DTEND:');
  });

  test('escapes commas and semicolons in the summary per RFC 5545', async ({ api, category }) => {
    const created = await api.createEvent(
      eventPayload(category.id, { title: 'Lunch, then; talk' }),
    );
    const body = await (await api.get(`/events/${created.id}/ics`)).text();

    expect(body).toContain('SUMMARY:Lunch\\, then\\; talk');
  });

  test('exports an all-day event with DATE values', async ({ api, category }) => {
    const created = await api.createEvent(
      eventPayload(category.id, {
        isAllDay: true,
        startAt: utcAt(2031, 3, 12, 0),
        endAt: utcAt(2031, 3, 13, 0),
      }),
    );
    const body = await (await api.get(`/events/${created.id}/ics`)).text();

    expect(body).toContain('DTSTART;VALUE=DATE:20310312');
  });

  test('carries the RRULE for a recurring event', async ({ api, category }) => {
    const created = await api.createEvent(
      eventPayload(category.id, { rrule: 'FREQ=WEEKLY;BYDAY=MO' }),
    );
    const body = await (await api.get(`/events/${created.id}/ics`)).text();

    expect(body).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO');
  });

  test('strips HTML from the exported description', async ({ api, category }) => {
    const created = await api.createEvent(
      eventPayload(category.id, { description: '<b>Bold</b> plan' }),
    );
    const body = await (await api.get(`/events/${created.id}/ics`)).text();

    expect(body).toContain('DESCRIPTION:');
    expect(body).not.toContain('<b>');
  });

  test('uses CRLF line endings', async ({ api, category }) => {
    const created = await api.createEvent(eventPayload(category.id));
    const body = await (await api.get(`/events/${created.id}/ics`)).text();

    expect(body).toContain('\r\n');
  });

  test('returns 404 for an unknown event', async ({ api }) => {
    expect((await api.get(`/events/${'a'.repeat(24)}/ics`)).status()).toBe(404);
  });

  test("cannot export another user's event", async ({ api, otherApi }) => {
    const foreignCategory = await otherApi.defaultCategory();
    const foreignEvent = await otherApi.createEvent(eventPayload(foreignCategory.id));

    expect((await api.get(`/events/${foreignEvent.id}/ics`)).status()).toBe(404);
  });

  test('export requires authentication', async ({ anonApi }) => {
    expect((await anonApi.get(`/events/${'a'.repeat(24)}/ics`)).status()).toBe(401);
  });
});
