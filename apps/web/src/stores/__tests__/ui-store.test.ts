import { beforeEach, describe, expect, it } from 'vitest';

import { useUIStore } from '../ui-store';

const defaultEventDrawer = { open: false, eventId: null };
const defaultTaskDrawer = { open: false, taskId: null };

describe('useUIStore', () => {
  beforeEach(() => {
    useUIStore.setState({
      eventDrawer: { ...defaultEventDrawer },
      taskDrawer: { ...defaultTaskDrawer },
      searchOpen: false,
    });
  });

  // ─── openEventDrawer ──────────────────────────────────────────────────────

  describe('openEventDrawer', () => {
    it('should open the event drawer with defaults when called without options', () => {
      useUIStore.getState().openEventDrawer();
      const { eventDrawer } = useUIStore.getState();
      expect(eventDrawer.open).toBe(true);
      expect(eventDrawer.eventId).toBeNull();
      expect(eventDrawer.defaultDate).toBeUndefined();
      expect(eventDrawer.defaultTime).toBeUndefined();
    });

    it('should open the event drawer with an eventId when editing an existing event', () => {
      useUIStore.getState().openEventDrawer({ eventId: 'evt_42' });
      const { eventDrawer } = useUIStore.getState();
      expect(eventDrawer.open).toBe(true);
      expect(eventDrawer.eventId).toBe('evt_42');
    });

    it('should open the event drawer with a defaultDate', () => {
      const date = new Date('2026-04-01T00:00:00Z');
      useUIStore.getState().openEventDrawer({ defaultDate: date });
      const { eventDrawer } = useUIStore.getState();
      expect(eventDrawer.open).toBe(true);
      expect(eventDrawer.defaultDate).toBe(date);
      expect(eventDrawer.eventId).toBeNull();
    });

    it('should open the event drawer with a defaultTime', () => {
      const time = new Date('2026-04-01T14:30:00Z');
      useUIStore.getState().openEventDrawer({ defaultTime: time });
      const { eventDrawer } = useUIStore.getState();
      expect(eventDrawer.open).toBe(true);
      expect(eventDrawer.defaultTime).toBe(time);
    });

    it('should open the event drawer with both eventId and defaultDate', () => {
      const date = new Date('2026-05-10T00:00:00Z');
      useUIStore.getState().openEventDrawer({ eventId: 'evt_99', defaultDate: date });
      const { eventDrawer } = useUIStore.getState();
      expect(eventDrawer.open).toBe(true);
      expect(eventDrawer.eventId).toBe('evt_99');
      expect(eventDrawer.defaultDate).toBe(date);
    });
  });

  // ─── closeEventDrawer ─────────────────────────────────────────────────────

  describe('closeEventDrawer', () => {
    it('should reset event drawer to default closed state', () => {
      useUIStore.getState().openEventDrawer({ eventId: 'evt_1' });
      expect(useUIStore.getState().eventDrawer.open).toBe(true);

      useUIStore.getState().closeEventDrawer();
      const { eventDrawer } = useUIStore.getState();
      expect(eventDrawer.open).toBe(false);
      expect(eventDrawer.eventId).toBeNull();
    });
  });

  // ─── openTaskDrawer ───────────────────────────────────────────────────────

  describe('openTaskDrawer', () => {
    it('should open the task drawer with defaults when called without options', () => {
      useUIStore.getState().openTaskDrawer();
      const { taskDrawer } = useUIStore.getState();
      expect(taskDrawer.open).toBe(true);
      expect(taskDrawer.taskId).toBeNull();
      expect(taskDrawer.defaultDate).toBeUndefined();
    });

    it('should open the task drawer with a taskId for editing', () => {
      useUIStore.getState().openTaskDrawer({ taskId: 'task_7' });
      const { taskDrawer } = useUIStore.getState();
      expect(taskDrawer.open).toBe(true);
      expect(taskDrawer.taskId).toBe('task_7');
    });

    it('should open the task drawer with a defaultDate', () => {
      const date = new Date('2026-06-15T00:00:00Z');
      useUIStore.getState().openTaskDrawer({ defaultDate: date });
      const { taskDrawer } = useUIStore.getState();
      expect(taskDrawer.open).toBe(true);
      expect(taskDrawer.defaultDate).toBe(date);
      expect(taskDrawer.taskId).toBeNull();
    });
  });

  // ─── closeTaskDrawer ──────────────────────────────────────────────────────

  describe('closeTaskDrawer', () => {
    it('should reset task drawer to default closed state', () => {
      useUIStore.getState().openTaskDrawer({ taskId: 'task_5' });
      expect(useUIStore.getState().taskDrawer.open).toBe(true);

      useUIStore.getState().closeTaskDrawer();
      const { taskDrawer } = useUIStore.getState();
      expect(taskDrawer.open).toBe(false);
      expect(taskDrawer.taskId).toBeNull();
    });
  });

  // ─── toggleSearch ─────────────────────────────────────────────────────────

  describe('toggleSearch', () => {
    it('should toggle searchOpen from false to true', () => {
      expect(useUIStore.getState().searchOpen).toBe(false);
      useUIStore.getState().toggleSearch();
      expect(useUIStore.getState().searchOpen).toBe(true);
    });

    it('should toggle searchOpen from true to false', () => {
      useUIStore.setState({ searchOpen: true });
      useUIStore.getState().toggleSearch();
      expect(useUIStore.getState().searchOpen).toBe(false);
    });
  });

  // ─── closeAll ─────────────────────────────────────────────────────────────

  describe('closeAll', () => {
    it('should close everything when all drawers and search are open', () => {
      useUIStore.getState().openEventDrawer({ eventId: 'evt_1' });
      useUIStore.getState().openTaskDrawer({ taskId: 'task_1' });
      useUIStore.setState({ searchOpen: true });

      useUIStore.getState().closeAll();

      const state = useUIStore.getState();
      expect(state.eventDrawer.open).toBe(false);
      expect(state.eventDrawer.eventId).toBeNull();
      expect(state.taskDrawer.open).toBe(false);
      expect(state.taskDrawer.taskId).toBeNull();
      expect(state.searchOpen).toBe(false);
    });

    it('should be a no-op when everything is already closed', () => {
      useUIStore.getState().closeAll();

      const state = useUIStore.getState();
      expect(state.eventDrawer.open).toBe(false);
      expect(state.taskDrawer.open).toBe(false);
      expect(state.searchOpen).toBe(false);
    });
  });
});
