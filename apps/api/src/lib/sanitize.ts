import createDOMPurify from 'isomorphic-dompurify';

const { sanitize } = createDOMPurify;

/**
 * Allowlisted HTML tags for event descriptions (Tiptap output).
 * Per spec §4.5: only basic formatting + links allowed.
 */
const ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'];
const ALLOWED_ATTR = ['href', 'target', 'rel'];

/**
 * Sanitize HTML content from Tiptap editor.
 * Strips all tags except the allowlisted set to prevent XSS.
 */
export function sanitizeHtml(dirty: string): string {
  return sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });
}
