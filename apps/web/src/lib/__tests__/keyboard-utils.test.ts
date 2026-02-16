import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isTypingInInput,
  pickUpFocusedEvent,
  registerEventElement,
  registerEventPickUp,
  unregisterEventElement,
} from '../keyboard-utils';

import type { Event } from '@calley/shared';

// ─── Helpers ────────────────────────────────────────────────────────────

/** Create a minimal Event fixture for testing. */
function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'evt_test1',
    userId: 'user_1',
    title: 'Test Event',
    startAt: '2026-02-16T10:00:00Z',
    endAt: '2026-02-16T11:00:00Z',
    isAllDay: false,
    color: null,
    location: null,
    description: null,
    categoryId: 'cat_default_001',
    visibility: 'private',
    rrule: null,
    exDates: [],
    recurringEventId: null,
    originalDate: null,
    isRecurringInstance: false,
    instanceDate: undefined,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

/**
 * Focus a DOM element by setting it as document.activeElement.
 * In jsdom, calling element.focus() sets document.activeElement.
 */
function focusElement(el: HTMLElement): void {
  el.focus();
}

// ─── isTypingInInput ────────────────────────────────────────────────────

describe('isTypingInInput', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('returns false when no element is focused', () => {
    // Focus the body (no interactive element)
    document.body.focus();
    expect(isTypingInInput()).toBe(false);
  });

  it('returns true when a text input is focused', () => {
    const input = document.createElement('input');
    input.type = 'text';
    container.appendChild(input);
    focusElement(input);
    expect(isTypingInInput()).toBe(true);
  });

  it('returns true when an email input is focused', () => {
    const input = document.createElement('input');
    input.type = 'email';
    container.appendChild(input);
    focusElement(input);
    expect(isTypingInInput()).toBe(true);
  });

  it('returns true when a password input is focused', () => {
    const input = document.createElement('input');
    input.type = 'password';
    container.appendChild(input);
    focusElement(input);
    expect(isTypingInInput()).toBe(true);
  });

  it('returns true when a search input is focused', () => {
    const input = document.createElement('input');
    input.type = 'search';
    container.appendChild(input);
    focusElement(input);
    expect(isTypingInInput()).toBe(true);
  });

  it('returns false when a checkbox input is focused', () => {
    const input = document.createElement('input');
    input.type = 'checkbox';
    container.appendChild(input);
    focusElement(input);
    expect(isTypingInInput()).toBe(false);
  });

  it('returns false when a radio input is focused', () => {
    const input = document.createElement('input');
    input.type = 'radio';
    container.appendChild(input);
    focusElement(input);
    expect(isTypingInInput()).toBe(false);
  });

  it('returns false when a range input is focused', () => {
    const input = document.createElement('input');
    input.type = 'range';
    container.appendChild(input);
    focusElement(input);
    expect(isTypingInInput()).toBe(false);
  });

  it('returns false when a color input is focused', () => {
    const input = document.createElement('input');
    input.type = 'color';
    container.appendChild(input);
    focusElement(input);
    expect(isTypingInInput()).toBe(false);
  });

  it('returns false when a file input is focused', () => {
    const input = document.createElement('input');
    input.type = 'file';
    container.appendChild(input);
    focusElement(input);
    expect(isTypingInInput()).toBe(false);
  });

  it('returns true when a textarea is focused', () => {
    const textarea = document.createElement('textarea');
    container.appendChild(textarea);
    focusElement(textarea);
    expect(isTypingInInput()).toBe(true);
  });

  it('returns true when a contentEditable element is focused', () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.tabIndex = 0;
    container.appendChild(div);
    focusElement(div);
    expect(isTypingInInput()).toBe(true);
  });

  it('returns true when a cmdk-input element is focused', () => {
    const input = document.createElement('div');
    input.setAttribute('cmdk-input', '');
    input.tabIndex = 0;
    container.appendChild(input);
    focusElement(input);
    expect(isTypingInInput()).toBe(true);
  });

  it('returns false when a regular button is focused', () => {
    const button = document.createElement('button');
    container.appendChild(button);
    focusElement(button);
    expect(isTypingInInput()).toBe(false);
  });

  it('returns false when a div with tabIndex is focused', () => {
    const div = document.createElement('div');
    div.tabIndex = 0;
    container.appendChild(div);
    focusElement(div);
    expect(isTypingInInput()).toBe(false);
  });
});

// ─── pickUpFocusedEvent ────────────────────────────────────────────────

describe('pickUpFocusedEvent', () => {
  let container: HTMLDivElement;
  let cleanupPickUp: (() => void) | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    cleanupPickUp?.();
    cleanupPickUp = undefined;
  });

  it('returns false when no element is focused', () => {
    document.body.focus();
    expect(pickUpFocusedEvent()).toBe(false);
  });

  it('returns false when focused element has no data-event-id', () => {
    const button = document.createElement('button');
    container.appendChild(button);
    focusElement(button);
    expect(pickUpFocusedEvent()).toBe(false);
  });

  it('returns false when no pickUp function is registered', () => {
    const event = makeEvent();
    const button = document.createElement('button');
    button.setAttribute('data-event-id', event.id);
    container.appendChild(button);
    registerEventElement(button, event);
    focusElement(button);

    // No pickUp registered
    expect(pickUpFocusedEvent()).toBe(false);

    unregisterEventElement(button);
  });

  it('returns false when element is registered but not in WeakMap', () => {
    const pickUp = vi.fn();
    cleanupPickUp = registerEventPickUp(pickUp);

    const button = document.createElement('button');
    button.setAttribute('data-event-id', 'some-id');
    container.appendChild(button);
    // NOT registered via registerEventElement
    focusElement(button);

    expect(pickUpFocusedEvent()).toBe(false);
    expect(pickUp).not.toHaveBeenCalled();
  });

  it('calls pickUp with the correct event when focused on a registered element', () => {
    const pickUp = vi.fn();
    cleanupPickUp = registerEventPickUp(pickUp);

    const event = makeEvent({ id: 'evt_pickup_test' });
    const button = document.createElement('button');
    button.setAttribute('data-event-id', event.id);
    container.appendChild(button);
    registerEventElement(button, event);
    focusElement(button);

    expect(pickUpFocusedEvent()).toBe(true);
    expect(pickUp).toHaveBeenCalledOnce();
    expect(pickUp).toHaveBeenCalledWith(event);

    unregisterEventElement(button);
  });

  it('finds event via closest ancestor with data-event-id', () => {
    const pickUp = vi.fn();
    cleanupPickUp = registerEventPickUp(pickUp);

    const event = makeEvent({ id: 'evt_ancestor_test' });
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-event-id', event.id);
    const innerButton = document.createElement('button');
    wrapper.appendChild(innerButton);
    container.appendChild(wrapper);
    registerEventElement(wrapper, event);
    focusElement(innerButton);

    expect(pickUpFocusedEvent()).toBe(true);
    expect(pickUp).toHaveBeenCalledWith(event);

    unregisterEventElement(wrapper);
  });

  it('unregistering pickUp prevents future pickups', () => {
    const pickUp = vi.fn();
    const cleanup = registerEventPickUp(pickUp);

    const event = makeEvent();
    const button = document.createElement('button');
    button.setAttribute('data-event-id', event.id);
    container.appendChild(button);
    registerEventElement(button, event);
    focusElement(button);

    // Works before cleanup
    expect(pickUpFocusedEvent()).toBe(true);
    expect(pickUp).toHaveBeenCalledOnce();

    // After cleanup, should fail
    cleanup();
    expect(pickUpFocusedEvent()).toBe(false);

    unregisterEventElement(button);
  });

  it('unregistering event element prevents pickup', () => {
    const pickUp = vi.fn();
    cleanupPickUp = registerEventPickUp(pickUp);

    const event = makeEvent();
    const button = document.createElement('button');
    button.setAttribute('data-event-id', event.id);
    container.appendChild(button);
    registerEventElement(button, event);
    focusElement(button);

    // Unregister the element
    unregisterEventElement(button);

    expect(pickUpFocusedEvent()).toBe(false);
    expect(pickUp).not.toHaveBeenCalled();
  });
});

// ─── Integration: shortcut disabled when typing ─────────────────────────

describe('Shift+Enter shortcut is disabled when typing in input', () => {
  let container: HTMLDivElement;
  let cleanupPickUp: (() => void) | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    cleanupPickUp?.();
    cleanupPickUp = undefined;
  });

  /**
   * Simulates what the global useKeyboardShortcuts handler does:
   * 1. Check isTypingInInput → return early
   * 2. Check Shift+Enter → pickUpFocusedEvent
   */
  function simulateGlobalShortcutHandler(): boolean {
    if (isTypingInInput()) return false;
    return pickUpFocusedEvent();
  }

  it('does NOT pick up when a text input is focused (even if event is registered)', () => {
    const pickUp = vi.fn();
    cleanupPickUp = registerEventPickUp(pickUp);

    const event = makeEvent();
    const input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('data-event-id', event.id);
    container.appendChild(input);
    registerEventElement(input, event);
    focusElement(input);

    expect(simulateGlobalShortcutHandler()).toBe(false);
    expect(pickUp).not.toHaveBeenCalled();

    unregisterEventElement(input);
  });

  it('does NOT pick up when a textarea is focused', () => {
    const pickUp = vi.fn();
    cleanupPickUp = registerEventPickUp(pickUp);

    const event = makeEvent();
    const textarea = document.createElement('textarea');
    textarea.setAttribute('data-event-id', event.id);
    container.appendChild(textarea);
    registerEventElement(textarea, event);
    focusElement(textarea);

    expect(simulateGlobalShortcutHandler()).toBe(false);
    expect(pickUp).not.toHaveBeenCalled();

    unregisterEventElement(textarea);
  });

  it('does NOT pick up when a contentEditable element is focused', () => {
    const pickUp = vi.fn();
    cleanupPickUp = registerEventPickUp(pickUp);

    const event = makeEvent();
    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.tabIndex = 0;
    div.setAttribute('data-event-id', event.id);
    container.appendChild(div);
    registerEventElement(div, event);
    focusElement(div);

    expect(simulateGlobalShortcutHandler()).toBe(false);
    expect(pickUp).not.toHaveBeenCalled();

    unregisterEventElement(div);
  });

  it('DOES pick up when a button is focused (not typing)', () => {
    const pickUp = vi.fn();
    cleanupPickUp = registerEventPickUp(pickUp);

    const event = makeEvent();
    const button = document.createElement('button');
    button.setAttribute('data-event-id', event.id);
    container.appendChild(button);
    registerEventElement(button, event);
    focusElement(button);

    expect(simulateGlobalShortcutHandler()).toBe(true);
    expect(pickUp).toHaveBeenCalledWith(event);

    unregisterEventElement(button);
  });
});
