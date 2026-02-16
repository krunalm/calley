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
  if ((el as HTMLElement).isContentEditable) return true;
  // cmdk input
  if (el.getAttribute('cmdk-input') !== null) return true;
  return false;
}
