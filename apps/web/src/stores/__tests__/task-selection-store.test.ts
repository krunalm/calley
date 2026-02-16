import { beforeEach, describe, expect, it } from 'vitest';

import { useTaskSelectionStore } from '../task-selection-store';

describe('useTaskSelectionStore', () => {
  beforeEach(() => {
    useTaskSelectionStore.setState({
      isSelecting: false,
      selectedIds: new Set(),
    });
  });

  // ─── toggleSelecting ──────────────────────────────────────────────────────

  describe('toggleSelecting', () => {
    it('should enable selection mode when currently off', () => {
      useTaskSelectionStore.getState().toggleSelecting();
      expect(useTaskSelectionStore.getState().isSelecting).toBe(true);
    });

    it('should keep selectedIds empty when enabling selection mode', () => {
      useTaskSelectionStore.getState().toggleSelecting();
      expect(useTaskSelectionStore.getState().selectedIds.size).toBe(0);
    });

    it('should disable selection mode and clear selectedIds when currently on', () => {
      // Enable selecting and select some tasks
      useTaskSelectionStore.setState({
        isSelecting: true,
        selectedIds: new Set(['task_1', 'task_2']),
      });

      useTaskSelectionStore.getState().toggleSelecting();

      const state = useTaskSelectionStore.getState();
      expect(state.isSelecting).toBe(false);
      expect(state.selectedIds.size).toBe(0);
    });
  });

  // ─── exitSelecting ────────────────────────────────────────────────────────

  describe('exitSelecting', () => {
    it('should set isSelecting to false and clear selectedIds', () => {
      useTaskSelectionStore.setState({
        isSelecting: true,
        selectedIds: new Set(['task_a', 'task_b', 'task_c']),
      });

      useTaskSelectionStore.getState().exitSelecting();

      const state = useTaskSelectionStore.getState();
      expect(state.isSelecting).toBe(false);
      expect(state.selectedIds.size).toBe(0);
    });

    it('should work when already not selecting', () => {
      useTaskSelectionStore.getState().exitSelecting();

      const state = useTaskSelectionStore.getState();
      expect(state.isSelecting).toBe(false);
      expect(state.selectedIds.size).toBe(0);
    });
  });

  // ─── toggleTask ───────────────────────────────────────────────────────────

  describe('toggleTask', () => {
    it('should add a task ID when it is not already selected', () => {
      useTaskSelectionStore.getState().toggleTask('task_1');
      expect(useTaskSelectionStore.getState().selectedIds.has('task_1')).toBe(true);
    });

    it('should remove a task ID when it is already selected', () => {
      useTaskSelectionStore.setState({ selectedIds: new Set(['task_1']) });
      useTaskSelectionStore.getState().toggleTask('task_1');
      expect(useTaskSelectionStore.getState().selectedIds.has('task_1')).toBe(false);
    });

    it('should handle toggling multiple different task IDs', () => {
      useTaskSelectionStore.getState().toggleTask('task_1');
      useTaskSelectionStore.getState().toggleTask('task_2');
      useTaskSelectionStore.getState().toggleTask('task_3');

      const ids = useTaskSelectionStore.getState().selectedIds;
      expect(ids.size).toBe(3);
      expect(ids.has('task_1')).toBe(true);
      expect(ids.has('task_2')).toBe(true);
      expect(ids.has('task_3')).toBe(true);
    });

    it('should only remove the toggled task, leaving others intact', () => {
      useTaskSelectionStore.setState({
        selectedIds: new Set(['task_1', 'task_2', 'task_3']),
      });

      useTaskSelectionStore.getState().toggleTask('task_2');

      const ids = useTaskSelectionStore.getState().selectedIds;
      expect(ids.size).toBe(2);
      expect(ids.has('task_1')).toBe(true);
      expect(ids.has('task_2')).toBe(false);
      expect(ids.has('task_3')).toBe(true);
    });
  });

  // ─── selectAll ────────────────────────────────────────────────────────────

  describe('selectAll', () => {
    it('should set selectedIds to the provided list of IDs', () => {
      useTaskSelectionStore.getState().selectAll(['task_1', 'task_2', 'task_3']);

      const ids = useTaskSelectionStore.getState().selectedIds;
      expect(ids.size).toBe(3);
      expect(ids.has('task_1')).toBe(true);
      expect(ids.has('task_2')).toBe(true);
      expect(ids.has('task_3')).toBe(true);
    });

    it('should replace any previously selected IDs', () => {
      useTaskSelectionStore.setState({
        selectedIds: new Set(['old_1', 'old_2']),
      });

      useTaskSelectionStore.getState().selectAll(['new_1', 'new_2']);

      const ids = useTaskSelectionStore.getState().selectedIds;
      expect(ids.size).toBe(2);
      expect(ids.has('old_1')).toBe(false);
      expect(ids.has('new_1')).toBe(true);
      expect(ids.has('new_2')).toBe(true);
    });

    it('should handle an empty array by clearing selection', () => {
      useTaskSelectionStore.setState({
        selectedIds: new Set(['task_1']),
      });

      useTaskSelectionStore.getState().selectAll([]);
      expect(useTaskSelectionStore.getState().selectedIds.size).toBe(0);
    });
  });

  // ─── clearSelection ──────────────────────────────────────────────────────

  describe('clearSelection', () => {
    it('should empty the selectedIds set', () => {
      useTaskSelectionStore.setState({
        selectedIds: new Set(['task_1', 'task_2', 'task_3']),
      });

      useTaskSelectionStore.getState().clearSelection();
      expect(useTaskSelectionStore.getState().selectedIds.size).toBe(0);
    });

    it('should be a no-op when selectedIds is already empty', () => {
      useTaskSelectionStore.getState().clearSelection();
      expect(useTaskSelectionStore.getState().selectedIds.size).toBe(0);
    });
  });
});
