import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

// ─── Mocks ──────────────────────────────────────────────────────────

let mockEvents: unknown[] = [];

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(async () => mockEvents),
  },
}));

vi.mock('@/hooks/use-user-timezone', () => ({
  useUserTimezone: () => 'UTC',
}));

import { useEventsByDate } from '@/hooks/use-events';

import type { Event } from '@calley/shared';

// ─── Fixtures ───────────────────────────────────────────────────────

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'evt1',
    userId: 'user1',
    categoryId: 'cat1',
    title: 'Event',
    description: null,
    location: null,
    startAt: '2026-03-15T10:00:00.000Z',
    endAt: '2026-03-15T11:00:00.000Z',
    isAllDay: false,
    color: null,
    visibility: 'private',
    rrule: null,
    exDates: [],
    recurringEventId: null,
    originalDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function TestWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return TestWrapper;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('useEventsByDate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEvents = [];
  });

  afterEach(() => {
    cleanup();
  });

  it('spreads a cross-midnight timed event onto the following day', async () => {
    mockEvents = [
      makeEvent({
        id: 'late',
        startAt: '2026-03-15T23:00:00.000Z',
        endAt: '2026-03-16T01:00:00.000Z',
      }),
    ];

    const { result } = renderHook(
      () => useEventsByDate('2026-03-15T00:00:00Z', '2026-03-17T00:00:00Z'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const byDate = result.current.eventsByDate;
    // Used to appear only on its start date, so the 00:00–01:00 tail of the
    // event was invisible in every grid.
    expect(byDate.get('2026-03-15')).toHaveLength(1);
    expect(byDate.get('2026-03-16')).toHaveLength(1);
    expect(byDate.get('2026-03-15')![0].id).toBe('late');
    expect(byDate.get('2026-03-16')![0].id).toBe('late');
  });

  it('does not spread an event that ends exactly at midnight', async () => {
    mockEvents = [
      makeEvent({
        id: 'ends-midnight',
        startAt: '2026-03-15T22:00:00.000Z',
        endAt: '2026-03-16T00:00:00.000Z',
      }),
    ];

    const { result } = renderHook(
      () => useEventsByDate('2026-03-15T00:00:00Z', '2026-03-17T00:00:00Z'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.eventsByDate.get('2026-03-15')).toHaveLength(1);
    expect(result.current.eventsByDate.has('2026-03-16')).toBe(false);
  });

  it('keeps spreading multi-day all-day events', async () => {
    mockEvents = [
      makeEvent({
        id: 'allday',
        isAllDay: true,
        startAt: '2026-03-15T00:00:00.000Z',
        endAt: '2026-03-17T23:59:59.999Z',
      }),
    ];

    const { result } = renderHook(
      () => useEventsByDate('2026-03-15T00:00:00Z', '2026-03-20T00:00:00Z'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    for (const key of ['2026-03-15', '2026-03-16', '2026-03-17']) {
      expect(result.current.eventsByDate.get(key)).toHaveLength(1);
    }
    expect(result.current.eventsByDate.has('2026-03-18')).toBe(false);
  });
});
