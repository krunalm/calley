import { describe, expect, it } from 'vitest';

import { queryKeys } from '@/lib/query-keys';

/**
 * Every mutation invalidates by prefix — `queryKeys.events.all` has to be a
 * prefix of every events key, or an optimistic update leaves a stale entry in
 * the cache that nothing ever refetches. These assertions pin the shape that
 * makes prefix invalidation work.
 */
describe('queryKeys', () => {
  const RANGE_START = '2026-03-01T00:00:00.000Z';
  const RANGE_END = '2026-03-31T00:00:00.000Z';

  it('prefixes every events key with the events root', () => {
    const root = queryKeys.events.all;

    for (const key of [
      queryKeys.events.range(RANGE_START, RANGE_END),
      queryKeys.events.detail('evt_1'),
      queryKeys.events.occurrences('evt_1', RANGE_START, RANGE_END),
    ]) {
      expect(key.slice(0, root.length)).toEqual([...root]);
    }
  });

  it('prefixes every tasks key with the tasks root', () => {
    const root = queryKeys.tasks.all;

    for (const key of [
      queryKeys.tasks.list({ status: ['todo'] } as never),
      queryKeys.tasks.detail('task_1'),
    ]) {
      expect(key.slice(0, root.length)).toEqual([...root]);
    }
  });

  it('separates ranges that differ only in one bound', () => {
    expect(queryKeys.events.range(RANGE_START, RANGE_END)).not.toEqual(
      queryKeys.events.range(RANGE_START, '2026-04-30T00:00:00.000Z'),
    );
  });

  it('separates detail keys from range keys', () => {
    expect(queryKeys.events.detail('evt_1')).not.toEqual(
      queryKeys.events.range('evt_1', RANGE_END),
    );
  });

  it('is stable for identical arguments', () => {
    expect(queryKeys.events.range(RANGE_START, RANGE_END)).toEqual(
      queryKeys.events.range(RANGE_START, RANGE_END),
    );
    expect(queryKeys.tasks.detail('task_1')).toEqual(queryKeys.tasks.detail('task_1'));
  });

  it('keys reminders by both item type and id', () => {
    // A task and an event can share an id shape, so the type has to be part of
    // the key or one item's reminders would answer for the other's.
    expect(queryKeys.reminders.byItem('event', 'x')).not.toEqual(
      queryKeys.reminders.byItem('task', 'x'),
    );
  });

  it('keys search results by query text', () => {
    expect(queryKeys.search.results('standup')).not.toEqual(queryKeys.search.results('retro'));
    expect(queryKeys.search.results('standup')[0]).toBe('search');
  });

  it('gives the user scope distinct keys', () => {
    expect(queryKeys.user.me).not.toEqual(queryKeys.user.sessions);
    expect(queryKeys.user.me[0]).toBe('user');
    expect(queryKeys.user.sessions[0]).toBe('user');
  });

  it('gives categories a stable root', () => {
    expect(queryKeys.categories.all).toEqual(['categories']);
  });
});
