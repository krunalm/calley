import { addDays, addMonths, addWeeks, subDays, subMonths, subWeeks } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { create } from 'zustand';

export type CalendarView = 'month' | 'week' | 'day' | 'agenda';

/**
 * Returns "now" in the user's timezone. Uses the browser's detected timezone
 * as a default; callers can pass an explicit IANA timezone from the user profile.
 */
function getNowInUserTimezone(tz: string = Intl.DateTimeFormat().resolvedOptions().timeZone): Date {
  return toZonedTime(new Date(), tz);
}

interface CalendarStore {
  currentDate: Date;
  view: CalendarView;
  selectedItemId: string | null;
  isTaskPanelOpen: boolean;
  isSidebarOpen: boolean;

  setView: (view: CalendarView) => void;
  navigate: (direction: 'prev' | 'next' | 'today') => void;
  setDate: (date: Date) => void;
  selectItem: (id: string | null) => void;
  toggleTaskPanel: () => void;
  toggleSidebar: () => void;
}

export const useCalendarStore = create<CalendarStore>((set, get) => ({
  currentDate: getNowInUserTimezone(),
  view: 'month',
  selectedItemId: null,
  isTaskPanelOpen: false,
  isSidebarOpen: true,

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
}));
