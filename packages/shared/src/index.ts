// @calley/shared — Shared schemas, types, and constants
// This package is the single source of truth for data validation
// and TypeScript types used across the frontend and backend.

// ─── Schemas ────────────────────────────────────────────────────────

// Common
export {
  cuid2Pattern,
  cuid2Schema,
  dateRangeSchema,
  datetimeSchema,
  editScopeSchema,
  hexColorPattern,
  hexColorSchema,
  paginationSchema,
  timezoneSchema,
  visibilitySchema,
} from './schemas/common.schema';

// Auth
export {
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  updateProfileSchema,
} from './schemas/auth.schema';

// Events
export {
  createEventSchema,
  eventIdParamSchema,
  eventScopeQuerySchema,
  listEventsQuerySchema,
  updateEventSchema,
} from './schemas/event.schema';

// Tasks
export {
  bulkCompleteTasksSchema,
  bulkDeleteTasksSchema,
  createTaskSchema,
  listTasksQuerySchema,
  reorderTasksSchema,
  taskIdParamSchema,
  taskPrioritySchema,
  taskScopeQuerySchema,
  taskStatusSchema,
  updateTaskSchema,
} from './schemas/task.schema';

// Categories
export {
  categoryIdParamSchema,
  createCategorySchema,
  updateCategorySchema,
} from './schemas/category.schema';

// Reminders
export {
  createReminderSchema,
  listRemindersQuerySchema,
  reminderIdParamSchema,
  reminderItemTypeSchema,
  reminderMethodSchema,
} from './schemas/reminder.schema';

// Search
export { searchQuerySchema } from './schemas/search.schema';

// ─── Types ──────────────────────────────────────────────────────────

export type {
  ApiErrorResponse,
  AuditLog,
  BulkCompleteTasksInput,
  BulkDeleteTasksInput,
  CalendarCategory,
  ChangePasswordInput,
  CreateCategoryInput,
  CreateEventInput,
  CreateReminderInput,
  CreateTaskInput,
  DateRangeInput,
  DeleteAccountInput,
  EditScope,
  Event,
  EventScopeQuery,
  ForgotPasswordInput,
  ListEventsQuery,
  ListRemindersQuery,
  ListTasksQuery,
  LoginInput,
  PaginationInput,
  Reminder,
  ReorderTasksInput,
  ResetPasswordInput,
  SearchQuery,
  SearchResults,
  Session,
  SignupInput,
  Task,
  TaskScopeQuery,
  UpdateCategoryInput,
  UpdateEventInput,
  UpdateProfileInput,
  UpdateTaskInput,
  User,
  Visibility,
} from './types/index';

// ─── Constants ──────────────────────────────────────────────────────

export {
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_COLOR,
  MAX_CATEGORIES_PER_USER,
  MAX_RECURRENCE_INSTANCES,
  RECURRENCE_PRESETS,
  REMINDER_PRESETS,
} from './constants/colors';
export type { TaskPriority } from './constants/priorities';
export { PRIORITY_LABELS, PRIORITY_ORDER, TASK_PRIORITIES } from './constants/priorities';
export type { TaskStatus, VisibilityOption } from './constants/statuses';
export {
  STATUS_LABELS,
  TASK_STATUSES,
  VISIBILITY_LABELS,
  VISIBILITY_OPTIONS,
} from './constants/statuses';
