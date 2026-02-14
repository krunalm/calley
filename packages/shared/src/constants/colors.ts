/** Default category color palette — 12 preset colors */
export const CATEGORY_COLORS = [
  '#c8522a', // Terracotta (accent)
  '#3a6b5c', // Forest Green
  '#4a90d9', // Sky Blue
  '#d4a017', // Gold
  '#8e44ad', // Purple
  '#e74c3c', // Red
  '#2ecc71', // Emerald
  '#f39c12', // Orange
  '#1abc9c', // Teal
  '#e91e63', // Pink
  '#607d8b', // Blue Grey
  '#795548', // Brown
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number];

/** Default color for new categories */
export const DEFAULT_CATEGORY_COLOR = '#4a90d9';

/** Reminder preset options (in minutes) */
export const REMINDER_PRESETS = [
  { value: 0, label: 'At time of event' },
  { value: 5, label: '5 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 1440, label: '1 day before' },
] as const;

/** Recurrence preset options for the UI dropdown */
export const RECURRENCE_PRESETS = [
  { value: null, label: 'Does not repeat' },
  { value: 'FREQ=DAILY', label: 'Every day' },
  { value: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', label: 'Every weekday' },
  { value: 'FREQ=WEEKLY;BYDAY=SA,SU', label: 'Every weekend' },
  { value: 'FREQ=WEEKLY', label: 'Every week' },
  { value: 'FREQ=MONTHLY', label: 'Every month' },
  { value: 'FREQ=YEARLY', label: 'Every year' },
] as const;

/** Maximum number of categories per user */
export const MAX_CATEGORIES_PER_USER = 20;

/** Maximum recurrence instances to expand per query */
export const MAX_RECURRENCE_INSTANCES = 1000;
