import { create } from 'zustand';

interface TaskSelectionStore {
  /** Whether multi-select mode is active */
  isSelecting: boolean;
  /** Set of selected task IDs */
  selectedIds: Set<string>;

  /** Toggle multi-select mode on/off */
  toggleSelecting: () => void;
  /** Turn off multi-select mode and clear selection */
  exitSelecting: () => void;
  /** Toggle a single task's selection */
  toggleTask: (taskId: string) => void;
  /** Select all tasks from a list of IDs */
  selectAll: (taskIds: string[]) => void;
  /** Clear all selections */
  clearSelection: () => void;
}

export const useTaskSelectionStore = create<TaskSelectionStore>((set, get) => ({
  isSelecting: false,
  selectedIds: new Set<string>(),

  toggleSelecting: () => {
    const { isSelecting } = get();
    if (isSelecting) {
      set({ isSelecting: false, selectedIds: new Set() });
    } else {
      set({ isSelecting: true });
    }
  },

  exitSelecting: () => set({ isSelecting: false, selectedIds: new Set() }),

  toggleTask: (taskId) => {
    const { selectedIds } = get();
    const next = new Set(selectedIds);
    if (next.has(taskId)) {
      next.delete(taskId);
    } else {
      next.add(taskId);
    }
    set({ selectedIds: next });
  },

  selectAll: (taskIds) => {
    set({ selectedIds: new Set(taskIds) });
  },

  clearSelection: () => set({ selectedIds: new Set() }),
}));
