import { create } from 'zustand';

interface EventDrawerState {
  open: boolean;
  eventId: string | null;
  defaultDate?: Date;
  defaultTime?: Date;
}

interface TaskDrawerState {
  open: boolean;
  taskId: string | null;
  defaultDate?: Date;
}

interface UIStore {
  eventDrawer: EventDrawerState;
  taskDrawer: TaskDrawerState;
  searchOpen: boolean;

  openEventDrawer: (opts?: Partial<EventDrawerState>) => void;
  closeEventDrawer: () => void;
  openTaskDrawer: (opts?: Partial<TaskDrawerState>) => void;
  closeTaskDrawer: () => void;
  toggleSearch: () => void;
  closeAll: () => void;
}

const defaultEventDrawer: EventDrawerState = {
  open: false,
  eventId: null,
};

const defaultTaskDrawer: TaskDrawerState = {
  open: false,
  taskId: null,
};

export const useUIStore = create<UIStore>((set) => ({
  eventDrawer: defaultEventDrawer,
  taskDrawer: defaultTaskDrawer,
  searchOpen: false,

  openEventDrawer: (opts) =>
    set({
      eventDrawer: { ...defaultEventDrawer, open: true, ...opts },
    }),

  closeEventDrawer: () => set({ eventDrawer: defaultEventDrawer }),

  openTaskDrawer: (opts) =>
    set({
      taskDrawer: { ...defaultTaskDrawer, open: true, ...opts },
    }),

  closeTaskDrawer: () => set({ taskDrawer: defaultTaskDrawer }),

  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),

  closeAll: () =>
    set({
      eventDrawer: defaultEventDrawer,
      taskDrawer: defaultTaskDrawer,
      searchOpen: false,
    }),
}));
