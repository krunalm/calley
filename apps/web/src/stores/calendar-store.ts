import { addDays, addMonths, addWeeks, subDays, subMonths, subWeeks } from 'date-fns';
import { create } from 'zustand';

export type CalendarView = 'month' | 'week' | 'day' | 'agenda';

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
  currentDate: new Date(),
  view: 'month',
  selectedItemId: null,
  isTaskPanelOpen: false,
  isSidebarOpen: true,

  setView: (view) => set({ view }),

  navigate: (direction) => {
    const { currentDate, view } = get();

    if (direction === 'today') {
      set({ currentDate: new Date() });
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
