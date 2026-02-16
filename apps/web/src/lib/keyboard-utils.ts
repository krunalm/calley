import type { Event } from '@calley/shared';

/**
 * Returns true if the active element is a text input, textarea, or content-editable,
 * meaning keyboard shortcuts should be disabled.
 */
export function isTypingInInput(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tagName = el.tagName.toLowerCase();
  if (tagName === 'input') {
    const type = (el as HTMLInputElement).type;
    // Allow shortcuts for non-text inputs like checkboxes, radios
    return !['checkbox', 'radio', 'range', 'color', 'file'].includes(type);
  }
  if (tagName === 'textarea') return true;
  if ((el as HTMLElement).isContentEditable || (el as HTMLElement).contentEditable === 'true')
    return true;
  // cmdk input
  if (el.getAttribute('cmdk-input') !== null) return true;
  return false;
}

// ─── Centralized event pickup via keyboard ──────────────────────────────
//
// Event components (EventBlock, EventPill) register their DOM elements and
// Event data in a WeakMap. DndCalendarProvider registers the `pickUp` function
// via a module-level ref. The global useKeyboardShortcuts hook calls
// `pickUpFocusedEvent()` on Shift+Enter to trigger the pickup centrally.

type PickUpFn = (event: Event) => void;

const pickUpRef: { current: PickUpFn | null } = { current: null };

/**
 * Register the event pickup function (called by DndCalendarProvider on mount).
 * Returns a cleanup function to unregister.
 */
export function registerEventPickUp(fn: PickUpFn): () => void {
  pickUpRef.current = fn;
  return () => {
    pickUpRef.current = null;
  };
}

/**
 * WeakMap associating DOM elements with their calendar Event data.
 * Used by pickUpFocusedEvent() to find which event is currently focused.
 */
const eventElementMap = new WeakMap<Element, Event>();

/**
 * Register a DOM element as representing a calendar event.
 * The element should have `data-event-id` for selector matching.
 */
export function registerEventElement(el: Element, event: Event): void {
  eventElementMap.set(el, event);
}

/**
 * Unregister a DOM element from the event element map.
 */
export function unregisterEventElement(el: Element): void {
  eventElementMap.delete(el);
}

/**
 * Attempt to pick up the currently focused calendar event via keyboard.
 * Looks up the focused element (or its closest ancestor with `data-event-id`)
 * in the event registry and calls the globally registered pickUp function.
 *
 * @returns true if a focused event was found and pickup was initiated.
 */
export function pickUpFocusedEvent(): boolean {
  const el = document.activeElement;
  if (!el) return false;

  const eventEl = el.closest('[data-event-id]') ?? (el.hasAttribute('data-event-id') ? el : null);
  if (!eventEl) return false;

  const event = eventElementMap.get(eventEl);
  if (!event || !pickUpRef.current) return false;

  pickUpRef.current(event);
  return true;
}
