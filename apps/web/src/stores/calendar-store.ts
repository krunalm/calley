import { addDays, addMonths, addWeeks, subDays, subMonths, subWeeks } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { create } from 'zustand';

export type CalendarView = 'month' | 'week' | 'day' | 'agenda';

const HIDDEN_CATEGORIES_KEY = 'calley_hidden_categories';

function loadHiddenCategories(): Set<string> {
  try {
    const stored = localStorage.getItem(HIDDEN_CATEGORIES_KEY);
    if (stored) {
      return new Set(JSON.parse(stored) as string[]);
    }
  } catch {
    // Ignore parse errors
  }
  return new Set();
}

function saveHiddenCategories(ids: Set<string>) {
  try {
    localStorage.setItem(HIDDEN_CATEGORIES_KEY, JSON.stringify([...ids]));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Returns "now" in the user's timezone. Uses the browser's detected timezone
 * as a default; callers can pass an explicit IANA timezone from the user profile.
 */
export function getNowInUserTimezone(
  tz: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): Date {
  return toZonedTime(new Date(), tz);
}

interface CalendarStore {
  currentDate: Date;
  view: CalendarView;
  selectedItemId: string | null;
  isTaskPanelOpen: boolean;
  isSidebarOpen: boolean;
  hiddenCategoryIds: Set<string>;

  setView: (view: CalendarView) => void;
  navigate: (direction: 'prev' | 'next' | 'today') => void;
  setDate: (date: Date) => void;
  selectItem: (id: string | null) => void;
  toggleTaskPanel: () => void;
  toggleSidebar: () => void;
  toggleCategoryVisibility: (categoryId: string) => void;
}

export const useCalendarStore = create<CalendarStore>((set, get) => ({
  currentDate: getNowInUserTimezone(),
  view: 'month',
  selectedItemId: null,
  isTaskPanelOpen: false,
  isSidebarOpen: true,
  hiddenCategoryIds: loadHiddenCategories(),

  setView: (view) => set({ view }),

  navigate: (direction) => {
    const { currentDate, view } = get();

    if (direction === 'today') {
      set({ currentDate: getNowInUserTimezone() });
      return;
    }

    const delta = direction === 'next' ? 1 : -1;

    let newDate: Date;
    switch (view) {
      case 'month':
        newDate = delta > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1);
        break;
      case 'week':
        newDate = delta > 0 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1);
        break;
      case 'day':
      case 'agenda':
        newDate = delta > 0 ? addDays(currentDate, 1) : subDays(currentDate, 1);
        break;
      default:
        newDate = currentDate;
    }

    set({ currentDate: newDate });
  },

  setDate: (date) => set({ currentDate: date }),
  selectItem: (id) => set({ selectedItemId: id }),
  toggleTaskPanel: () => set((s) => ({ isTaskPanelOpen: !s.isTaskPanelOpen })),
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  toggleCategoryVisibility: (categoryId) => {
    const { hiddenCategoryIds } = get();
    const next = new Set(hiddenCategoryIds);
    if (next.has(categoryId)) {
      next.delete(categoryId);
    } else {
      next.add(categoryId);
    }
    saveHiddenCategories(next);
    set({ hiddenCategoryIds: next });
  },
}));
