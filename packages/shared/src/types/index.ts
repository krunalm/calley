// Re-export all types inferred from Zod schemas.
// These are the canonical TypeScript types used across frontend and backend.

// ─── Common ─────────────────────────────────────────────────────────

export type {
  DateRangeInput,
  EditScope,
  PaginationInput,
  Visibility,
} from '../schemas/common.schema';

// ─── Auth ───────────────────────────────────────────────────────────

export type {
  ChangePasswordInput,
  DeleteAccountInput,
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
  SignupInput,
  UpdateProfileInput,
} from '../schemas/auth.schema';

// ─── Events ─────────────────────────────────────────────────────────

export type {
  CreateEventInput,
  EventScopeQuery,
  ListEventsQuery,
  UpdateEventInput,
} from '../schemas/event.schema';

// ─── Tasks ──────────────────────────────────────────────────────────

export type {
  BulkCompleteTasksInput,
  BulkDeleteTasksInput,
  CreateTaskInput,
  ListTasksQuery,
  ReorderTasksInput,
  TaskScopeQuery,
  UpdateTaskInput,
} from '../schemas/task.schema';

// ─── Categories ─────────────────────────────────────────────────────

export type { CreateCategoryInput, UpdateCategoryInput } from '../schemas/category.schema';

// ─── Reminders ──────────────────────────────────────────────────────

export type { CreateReminderInput, ListRemindersQuery } from '../schemas/reminder.schema';

// ─── Push Subscriptions ─────────────────────────────────────────────

export type { CreatePushSubscriptionInput } from '../schemas/push-subscription.schema';

// ─── Search ─────────────────────────────────────────────────────────

export type { SearchQuery } from '../schemas/search.schema';

// ─── Domain Entity Types (API response shapes) ──────────────────────
// These represent the full entity shapes returned from the API.
// They are NOT inferred from create/update schemas but defined to match
// the database models as returned by the server.

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  timezone: string;
  weekStart: 0 | 1;
  timeFormat: '12h' | '24h';
  createdAt: string;
  updatedAt: string;
}

export interface Event {
  id: string;
  userId: string;
  categoryId: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  color: string | null;
  visibility: 'public' | 'private';
  rrule: string | null;
  exDates: string[];
  recurringEventId: string | null;
  originalDate: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  // Present on expanded recurring instances
  isRecurringInstance?: boolean;
  instanceDate?: string;
}

export interface Task {
  id: string;
  userId: string;
  categoryId: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  priority: 'none' | 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress' | 'done';
  completedAt: string | null;
  rrule: string | null;
  exDates: string[];
  recurringTaskId: string | null;
  originalDate: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  // Present on expanded recurring instances
  isRecurringInstance?: boolean;
  instanceDate?: string;
}

export interface CalendarCategory {
  id: string;
  userId: string;
  name: string;
  color: string;
  isDefault: boolean;
  visible: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Reminder {
  id: string;
  userId: string;
  itemType: 'event' | 'task';
  itemId: string;
  minutesBefore: number;
  method: 'push' | 'email' | 'both';
  triggerAt: string;
  sentAt: string | null;
  createdAt: string;
}

export interface PushSubscription {
  id: string;
  userId: string;
  endpoint: string;
  userAgent: string | null;
  createdAt: string;
}

export interface OAuthAccount {
  id: string;
  provider: string;
  createdAt: string;
}

export interface Session {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: string;
  lastActiveAt: string;
  createdAt: string;
  isCurrent?: boolean;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

// ─── API Error Shape ────────────────────────────────────────────────

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ─── Search Results ─────────────────────────────────────────────────

export interface SearchResults {
  events: Event[];
  tasks: Task[];
}
