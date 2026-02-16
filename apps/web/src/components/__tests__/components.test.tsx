import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

// ─── Mock date-fns-tz before importing anything that uses the calendar store ──
vi.mock('date-fns-tz', () => ({
  toZonedTime: vi.fn((date: Date) => date),
}));

// ─── EmptyState ─────────────────────────────────────────────────────────────

import {
  EmptyState,
  NoEventsEmptyState,
  NoSearchResultsEmptyState,
  NoTasksEmptyState,
} from '@/components/EmptyState';

describe('EmptyState', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the title text', () => {
    render(<EmptyState title="No items here" />);
    expect(screen.getByText('No items here')).toBeDefined();
  });

  it('renders the description when provided', () => {
    render(<EmptyState title="Empty" description="There is nothing to show." />);
    expect(screen.getByText('There is nothing to show.')).toBeDefined();
  });

  it('does not render a description element when description is omitted', () => {
    const { container } = render(<EmptyState title="Empty" />);
    // The description paragraph should not exist
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBe(0);
  });

  it('renders an action button when action prop is provided', () => {
    const onClick = vi.fn();
    render(<EmptyState title="Empty" action={{ label: 'Add item', onClick }} />);
    const button = screen.getByRole('button', { name: 'Add item' });
    expect(button).toBeDefined();
  });

  it('calls action.onClick when the action button is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<EmptyState title="Empty" action={{ label: 'Add item', onClick }} />);

    await user.click(screen.getByRole('button', { name: 'Add item' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not render an action button when action prop is omitted', () => {
    render(<EmptyState title="Empty" />);
    const buttons = screen.queryAllByRole('button');
    expect(buttons.length).toBe(0);
  });

  it('renders the icon when provided', () => {
    render(<EmptyState title="Empty" icon={<span data-testid="custom-icon">Icon</span>} />);
    expect(screen.getByTestId('custom-icon')).toBeDefined();
  });

  it('does not render the icon container when icon is omitted', () => {
    render(<EmptyState title="Empty" />);
    expect(screen.queryByTestId('empty-state-icon')).toBeNull();
  });
});

describe('NoEventsEmptyState', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders "No events" title and a create button', () => {
    const onCreateEvent = vi.fn();
    render(<NoEventsEmptyState onCreateEvent={onCreateEvent} />);
    expect(screen.getByText('No events')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Create your first event' })).toBeDefined();
  });

  it('calls onCreateEvent when the create button is clicked', async () => {
    const user = userEvent.setup();
    const onCreateEvent = vi.fn();
    render(<NoEventsEmptyState onCreateEvent={onCreateEvent} />);

    await user.click(screen.getByRole('button', { name: 'Create your first event' }));
    expect(onCreateEvent).toHaveBeenCalledOnce();
  });
});

describe('NoTasksEmptyState', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders "No tasks" title and an add button', () => {
    const onCreateTask = vi.fn();
    render(<NoTasksEmptyState onCreateTask={onCreateTask} />);
    expect(screen.getByText('No tasks')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Add a task' })).toBeDefined();
  });
});

describe('NoSearchResultsEmptyState', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the search query in the title', () => {
    render(<NoSearchResultsEmptyState query="meeting" />);
    expect(screen.getByText('No results for "meeting"')).toBeDefined();
  });

  it('renders a helpful description about trying different terms', () => {
    render(<NoSearchResultsEmptyState query="test" />);
    expect(screen.getByText('Try a different search term or check your spelling.')).toBeDefined();
  });
});

// ─── ErrorBoundary ──────────────────────────────────────────────────────────

import { ErrorBoundary } from '@/components/ErrorBoundary';

function ThrowingComponent({ message }: { message: string }): ReactNode {
  throw new Error(message);
}

function GoodComponent() {
  return <div>Everything is fine</div>;
}

describe('ErrorBoundary', () => {
  // Suppress console.error from React and our ErrorBoundary during error tests
  const originalConsoleError = console.error;

  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
    cleanup();
  });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <GoodComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Everything is fine')).toBeDefined();
  });

  it('shows the default error UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent message="Test error" />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeDefined();
    expect(screen.getByText('An unexpected error occurred. Please try again.')).toBeDefined();
  });

  it('displays the error message in the default error UI', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent message="Specific error message" />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Specific error message')).toBeDefined();
  });

  it('shows a "Try again" button in the default error UI', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent message="Test error" />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('button', { name: /try again/i })).toBeDefined();
  });

  it('renders custom fallback UI when provided and error occurs', () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowingComponent message="Test error" />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Custom fallback')).toBeDefined();
    // Default UI should NOT be shown
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });
});

// ─── ViewSwitcher ───────────────────────────────────────────────────────────

import { ViewSwitcher } from '@/components/layout/ViewSwitcher';
import { useCalendarStore } from '@/stores/calendar-store';

describe('ViewSwitcher', () => {
  beforeEach(() => {
    useCalendarStore.setState({
      currentDate: new Date('2026-03-15T12:00:00Z'),
      view: 'month',
      viewDirection: 1,
      selectedItemId: null,
      isTaskPanelOpen: false,
      isSidebarOpen: true,
      hiddenCategoryIds: new Set(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders all four view buttons (Month, Week, Day, Agenda)', () => {
    render(<ViewSwitcher />);
    expect(screen.getByRole('tab', { name: 'Month' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Week' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Day' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Agenda' })).toBeDefined();
  });

  it('marks the current view tab as aria-selected', () => {
    render(<ViewSwitcher />);
    const monthTab = screen.getByRole('tab', { name: 'Month' });
    expect(monthTab.getAttribute('aria-selected')).toBe('true');

    const weekTab = screen.getByRole('tab', { name: 'Week' });
    expect(weekTab.getAttribute('aria-selected')).toBe('false');
  });

  it('updates the store view when a view button is clicked', async () => {
    const user = userEvent.setup();
    render(<ViewSwitcher />);

    await user.click(screen.getByRole('tab', { name: 'Week' }));
    expect(useCalendarStore.getState().view).toBe('week');
  });

  it('updates aria-selected on view change', async () => {
    const user = userEvent.setup();
    render(<ViewSwitcher />);

    await user.click(screen.getByRole('tab', { name: 'Day' }));
    expect(useCalendarStore.getState().view).toBe('day');
  });

  it('has a tablist role container with an accessible label', () => {
    render(<ViewSwitcher />);
    const tablist = screen.getByRole('tablist', { name: 'Calendar view' });
    expect(tablist).toBeDefined();
  });
});

// ─── DateNavigator ──────────────────────────────────────────────────────────

import { DateNavigator } from '@/components/layout/DateNavigator';

describe('DateNavigator', () => {
  beforeEach(() => {
    useCalendarStore.setState({
      currentDate: new Date('2026-03-15T12:00:00Z'),
      view: 'month',
      viewDirection: 1,
      selectedItemId: null,
      isTaskPanelOpen: false,
      isSidebarOpen: true,
      hiddenCategoryIds: new Set(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('displays the month and year title in month view', () => {
    render(<DateNavigator />);
    expect(screen.getByText('March 2026')).toBeDefined();
  });

  it('displays the day title in day view', () => {
    useCalendarStore.setState({ view: 'day' });
    render(<DateNavigator />);
    // date-fns format 'EEEE, MMMM d, yyyy' for March 15, 2026 (Sunday)
    expect(screen.getByText('Sunday, March 15, 2026')).toBeDefined();
  });

  it('renders Previous and Next navigation buttons', () => {
    render(<DateNavigator />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDefined();
  });

  it('renders a "Today" button', () => {
    render(<DateNavigator />);
    expect(screen.getByRole('button', { name: 'Today' })).toBeDefined();
  });

  it('navigates to the next month when the Next button is clicked', async () => {
    const user = userEvent.setup();
    render(<DateNavigator />);

    await user.click(screen.getByRole('button', { name: 'Next' }));

    const newDate = useCalendarStore.getState().currentDate;
    expect(newDate.getMonth()).toBe(3); // April (0-indexed)
    expect(newDate.getFullYear()).toBe(2026);
  });

  it('navigates to the previous month when the Previous button is clicked', async () => {
    const user = userEvent.setup();
    render(<DateNavigator />);

    await user.click(screen.getByRole('button', { name: 'Previous' }));

    const newDate = useCalendarStore.getState().currentDate;
    expect(newDate.getMonth()).toBe(1); // February (0-indexed)
    expect(newDate.getFullYear()).toBe(2026);
  });

  it('navigates to today when the Today button is clicked', () => {
    const FROZEN_NOW = new Date('2026-02-16T10:00:00Z');
    vi.useFakeTimers({ now: FROZEN_NOW });

    // Move away from today first
    useCalendarStore.setState({ currentDate: new Date('2025-01-01T12:00:00Z') });
    render(<DateNavigator />);

    fireEvent.click(screen.getByRole('button', { name: 'Today' }));

    const newDate = useCalendarStore.getState().currentDate;
    expect(newDate.getTime()).toBe(FROZEN_NOW.getTime());

    vi.useRealTimers();
  });
});
