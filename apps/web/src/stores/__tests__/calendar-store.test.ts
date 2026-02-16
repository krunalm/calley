import { addDays, addMonths, addWeeks, subDays, subMonths, subWeeks } from 'date-fns';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock localStorage before importing the store (it calls loadHiddenCategories on init)
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem(key: string) {
    return this.store[key] ?? null;
  },
  setItem(key: string, value: string) {
    this.store[key] = value;
  },
  removeItem(key: string) {
    delete this.store[key];
  },
  clear() {
    this.store = {};
  },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

vi.mock('date-fns-tz', () => ({
  toZonedTime: vi.fn((date: Date) => date),
}));

import { useCalendarStore } from '../calendar-store';

const BASELINE_DATE = new Date('2026-03-15T12:00:00Z');

describe('useCalendarStore', () => {
  beforeEach(() => {
    localStorageMock.clear();
    useCalendarStore.setState({
      currentDate: BASELINE_DATE,
      view: 'month',
      viewDirection: 1,
      selectedItemId: null,
      isTaskPanelOpen: false,
      isSidebarOpen: true,
      hiddenCategoryIds: new Set(),
    });
  });

  // ─── setView ────────────────────────────────────────────────────────────────

  describe('setView', () => {
    it('should change the view to the requested value', () => {
      useCalendarStore.getState().setView('week');
      expect(useCalendarStore.getState().view).toBe('week');
    });

    it('should set viewDirection to 1 when moving forward in VIEW_ORDER (month -> week)', () => {
      useCalendarStore.getState().setView('week');
      expect(useCalendarStore.getState().viewDirection).toBe(1);
    });

    it('should set viewDirection to -1 when moving backward in VIEW_ORDER (week -> month)', () => {
      useCalendarStore.setState({ view: 'week' });
      useCalendarStore.getState().setView('month');
      expect(useCalendarStore.getState().viewDirection).toBe(-1);
    });

    it('should set viewDirection to 1 when switching to the same view (month -> month)', () => {
      useCalendarStore.getState().setView('month');
      expect(useCalendarStore.getState().viewDirection).toBe(1);
    });

    it('should set viewDirection to 1 when moving from month to agenda', () => {
      useCalendarStore.getState().setView('agenda');
      expect(useCalendarStore.getState().viewDirection).toBe(1);
      expect(useCalendarStore.getState().view).toBe('agenda');
    });

    it('should set viewDirection to -1 when moving from agenda to day', () => {
      useCalendarStore.setState({ view: 'agenda' });
      useCalendarStore.getState().setView('day');
      expect(useCalendarStore.getState().viewDirection).toBe(-1);
    });
  });

  // ─── navigate ───────────────────────────────────────────────────────────────

  describe('navigate', () => {
    it('should move forward one month when navigating next in month view', () => {
      useCalendarStore.getState().navigate('next');
      const expected = addMonths(BASELINE_DATE, 1);
      expect(useCalendarStore.getState().currentDate.getTime()).toBe(expected.getTime());
    });

    it('should move backward one month when navigating prev in month view', () => {
      useCalendarStore.getState().navigate('prev');
      const expected = subMonths(BASELINE_DATE, 1);
      expect(useCalendarStore.getState().currentDate.getTime()).toBe(expected.getTime());
    });

    it('should move forward one week when navigating next in week view', () => {
      useCalendarStore.setState({ view: 'week' });
      useCalendarStore.getState().navigate('next');
      const expected = addWeeks(BASELINE_DATE, 1);
      expect(useCalendarStore.getState().currentDate.getTime()).toBe(expected.getTime());
    });

    it('should move backward one week when navigating prev in week view', () => {
      useCalendarStore.setState({ view: 'week' });
      useCalendarStore.getState().navigate('prev');
      const expected = subWeeks(BASELINE_DATE, 1);
      expect(useCalendarStore.getState().currentDate.getTime()).toBe(expected.getTime());
    });

    it('should move forward one day when navigating next in day view', () => {
      useCalendarStore.setState({ view: 'day' });
      useCalendarStore.getState().navigate('next');
      const expected = addDays(BASELINE_DATE, 1);
      expect(useCalendarStore.getState().currentDate.getTime()).toBe(expected.getTime());
    });

    it('should move backward one day when navigating prev in day view', () => {
      useCalendarStore.setState({ view: 'day' });
      useCalendarStore.getState().navigate('prev');
      const expected = subDays(BASELINE_DATE, 1);
      expect(useCalendarStore.getState().currentDate.getTime()).toBe(expected.getTime());
    });

    it('should move forward one day when navigating next in agenda view', () => {
      useCalendarStore.setState({ view: 'agenda' });
      useCalendarStore.getState().navigate('next');
      const expected = addDays(BASELINE_DATE, 1);
      expect(useCalendarStore.getState().currentDate.getTime()).toBe(expected.getTime());
    });

    it('should move backward one day when navigating prev in agenda view', () => {
      useCalendarStore.setState({ view: 'agenda' });
      useCalendarStore.getState().navigate('prev');
      const expected = subDays(BASELINE_DATE, 1);
      expect(useCalendarStore.getState().currentDate.getTime()).toBe(expected.getTime());
    });

    it('should reset to current date when navigating today', () => {
      const FROZEN_NOW = new Date('2026-02-16T10:00:00Z');
      vi.useFakeTimers({ now: FROZEN_NOW });

      // Move away from "today" first
      useCalendarStore.getState().navigate('next');
      useCalendarStore.getState().navigate('next');
      expect(useCalendarStore.getState().currentDate.getTime()).not.toBe(BASELINE_DATE.getTime());

      // Navigate to today — getNowInUserTimezone returns new Date() since toZonedTime is mocked as identity
      useCalendarStore.getState().navigate('today');
      const now = useCalendarStore.getState().currentDate;
      // The date should match the frozen time exactly
      expect(now.getTime()).toBe(FROZEN_NOW.getTime());

      vi.useRealTimers();
    });
  });

  // ─── setDate ────────────────────────────────────────────────────────────────

  describe('setDate', () => {
    it('should set currentDate to the given date', () => {
      const target = new Date('2026-12-25T00:00:00Z');
      useCalendarStore.getState().setDate(target);
      expect(useCalendarStore.getState().currentDate).toBe(target);
    });
  });

  // ─── selectItem ─────────────────────────────────────────────────────────────

  describe('selectItem', () => {
    it('should set selectedItemId to a given string', () => {
      useCalendarStore.getState().selectItem('evt_123');
      expect(useCalendarStore.getState().selectedItemId).toBe('evt_123');
    });

    it('should clear selectedItemId when passed null', () => {
      useCalendarStore.getState().selectItem('evt_123');
      useCalendarStore.getState().selectItem(null);
      expect(useCalendarStore.getState().selectedItemId).toBeNull();
    });
  });

  // ─── toggleTaskPanel ───────────────────────────────────────────────────────

  describe('toggleTaskPanel', () => {
    it('should toggle isTaskPanelOpen from false to true', () => {
      expect(useCalendarStore.getState().isTaskPanelOpen).toBe(false);
      useCalendarStore.getState().toggleTaskPanel();
      expect(useCalendarStore.getState().isTaskPanelOpen).toBe(true);
    });

    it('should toggle isTaskPanelOpen from true to false', () => {
      useCalendarStore.setState({ isTaskPanelOpen: true });
      useCalendarStore.getState().toggleTaskPanel();
      expect(useCalendarStore.getState().isTaskPanelOpen).toBe(false);
    });
  });

  // ─── toggleSidebar ─────────────────────────────────────────────────────────

  describe('toggleSidebar', () => {
    it('should toggle isSidebarOpen from true to false', () => {
      expect(useCalendarStore.getState().isSidebarOpen).toBe(true);
      useCalendarStore.getState().toggleSidebar();
      expect(useCalendarStore.getState().isSidebarOpen).toBe(false);
    });

    it('should toggle isSidebarOpen from false to true', () => {
      useCalendarStore.setState({ isSidebarOpen: false });
      useCalendarStore.getState().toggleSidebar();
      expect(useCalendarStore.getState().isSidebarOpen).toBe(true);
    });
  });

  // ─── toggleCategoryVisibility ──────────────────────────────────────────────

  describe('toggleCategoryVisibility', () => {
    it('should add a category ID to hiddenCategoryIds when not present', () => {
      useCalendarStore.getState().toggleCategoryVisibility('cat_1');
      expect(useCalendarStore.getState().hiddenCategoryIds.has('cat_1')).toBe(true);
    });

    it('should remove a category ID from hiddenCategoryIds when already present', () => {
      useCalendarStore.setState({ hiddenCategoryIds: new Set(['cat_1']) });
      useCalendarStore.getState().toggleCategoryVisibility('cat_1');
      expect(useCalendarStore.getState().hiddenCategoryIds.has('cat_1')).toBe(false);
    });

    it('should persist hidden categories to localStorage', () => {
      useCalendarStore.getState().toggleCategoryVisibility('cat_a');
      useCalendarStore.getState().toggleCategoryVisibility('cat_b');
      const stored = JSON.parse(localStorageMock.getItem('calley_hidden_categories')!);
      expect(stored).toEqual(expect.arrayContaining(['cat_a', 'cat_b']));
      expect(stored).toHaveLength(2);
    });

    it('should update localStorage when removing a category', () => {
      useCalendarStore.getState().toggleCategoryVisibility('cat_a');
      useCalendarStore.getState().toggleCategoryVisibility('cat_b');
      useCalendarStore.getState().toggleCategoryVisibility('cat_a');
      const stored = JSON.parse(localStorageMock.getItem('calley_hidden_categories')!);
      expect(stored).toEqual(['cat_b']);
    });

    it('should handle toggling multiple categories independently', () => {
      useCalendarStore.getState().toggleCategoryVisibility('cat_1');
      useCalendarStore.getState().toggleCategoryVisibility('cat_2');
      useCalendarStore.getState().toggleCategoryVisibility('cat_3');

      const ids = useCalendarStore.getState().hiddenCategoryIds;
      expect(ids.size).toBe(3);
      expect(ids.has('cat_1')).toBe(true);
      expect(ids.has('cat_2')).toBe(true);
      expect(ids.has('cat_3')).toBe(true);
    });
  });
});
