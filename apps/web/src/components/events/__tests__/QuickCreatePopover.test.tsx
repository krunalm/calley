import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────

const mockCreateEvent = vi.fn();
const mockCreateTask = vi.fn();
const mockOpenEventDrawer = vi.fn();
const mockOpenTaskDrawer = vi.fn();

vi.mock('date-fns-tz', () => ({
  fromZonedTime: vi.fn((date: Date) => date),
}));

vi.mock('@/components/ui/Popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/hooks/use-categories', () => ({
  useCategories: () => ({
    data: [{ id: 'cat_default', name: 'Personal', isDefault: true }],
  }),
}));

vi.mock('@/hooks/use-event-mutations', () => ({
  useCreateEvent: () => ({ mutate: mockCreateEvent }),
}));

vi.mock('@/hooks/use-task-mutations', () => ({
  useCreateTask: () => ({ mutate: mockCreateTask }),
}));

vi.mock('@/hooks/use-user-timezone', () => ({
  useUserTimezone: () => 'UTC',
}));

vi.mock('@/stores/ui-store', () => ({
  useUIStore: () => ({
    openEventDrawer: mockOpenEventDrawer,
    openTaskDrawer: mockOpenTaskDrawer,
  }),
}));

import { QuickCreatePopover } from '@/components/events/QuickCreatePopover';

// ─── Tests ──────────────────────────────────────────────────────────

describe('QuickCreatePopover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  function renderPopover(props: { defaultTime?: Date } = {}) {
    render(
      <QuickCreatePopover
        open={true}
        onOpenChange={vi.fn()}
        defaultDate={new Date('2026-03-15T00:00:00Z')}
        defaultTime={props.defaultTime}
      >
        <button type="button">trigger</button>
      </QuickCreatePopover>,
    );
  }

  it('creates an event with a whole-day span for the all-day branch', async () => {
    const user = userEvent.setup();
    renderPopover();

    await user.type(screen.getByPlaceholderText('Event title'), 'Standup');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mockCreateEvent).toHaveBeenCalledTimes(1);
    expect(mockCreateEvent.mock.calls[0][0]).toMatchObject({
      title: 'Standup',
      isAllDay: true,
      categoryId: 'cat_default',
      // All-day: midnight to end-of-day on the same date, not a one-hour event.
      startAt: '2026-03-15T00:00:00.000Z',
      endAt: '2026-03-15T23:59:59.999Z',
    });
    expect(mockCreateTask).not.toHaveBeenCalled();
  });

  /**
   * Regression: the Task branch fell straight through the submit handler and
   * the popover closed — the typed title was silently discarded.
   */
  it('creates a task when the Task type is selected', async () => {
    const user = userEvent.setup();
    renderPopover();

    await user.type(screen.getByPlaceholderText('Event title'), 'Water plants');
    await user.click(screen.getByRole('button', { name: 'Task' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mockCreateTask).toHaveBeenCalledTimes(1);
    expect(mockCreateTask.mock.calls[0][0]).toMatchObject({
      title: 'Water plants',
      priority: 'none',
      categoryId: 'cat_default',
      // No time slot selected: due end-of-day on the chosen date.
      dueAt: '2026-03-15T23:59:59.999Z',
    });
    expect(mockCreateEvent).not.toHaveBeenCalled();
  });

  it('anchors a quick-created task at the tapped time slot', async () => {
    const user = userEvent.setup();
    renderPopover({ defaultTime: new Date('2026-03-15T14:30:00Z') });

    await user.type(screen.getByPlaceholderText('Event title'), 'Call back');
    await user.click(screen.getByRole('button', { name: 'Task' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mockCreateTask).toHaveBeenCalledTimes(1);
    expect(mockCreateTask.mock.calls[0][0]).toMatchObject({
      dueAt: '2026-03-15T14:30:00.000Z',
    });
  });

  it('opens the task drawer from More options when Task is selected', async () => {
    const user = userEvent.setup();
    renderPopover();

    await user.click(screen.getByRole('button', { name: 'Task' }));
    await user.click(screen.getByRole('button', { name: 'More options' }));

    expect(mockOpenTaskDrawer).toHaveBeenCalledWith({
      defaultDate: new Date('2026-03-15T00:00:00Z'),
    });
    expect(mockOpenEventDrawer).not.toHaveBeenCalled();
  });
});
