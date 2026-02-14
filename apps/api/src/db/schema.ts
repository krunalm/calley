import { createId } from '@paralleldrive/cuid2';
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

// ─── Helpers ──────────────────────────────────────────────────────────

const cuid2 = (name: string) =>
  varchar(name, { length: 128 })
    .$defaultFn(() => createId())
    .notNull();

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => new Date()),
};

// ─── Users ────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: cuid2('id').primaryKey(),
    email: varchar('email', { length: 254 }).notNull(),
    passwordHash: text('password_hash'),
    name: varchar('name', { length: 100 }).notNull(),
    avatarUrl: text('avatar_url'),
    timezone: varchar('timezone', { length: 100 }).notNull().default('UTC'),
    weekStart: integer('week_start').notNull().default(0), // 0 = Sunday, 1 = Monday
    timeFormat: varchar('time_format', { length: 3 }).notNull().default('12h'),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    failedLogins: integer('failed_logins').notNull().default(0),
    ...timestamps,
  },
  (table) => [uniqueIndex('idx_users_email').on(table.email)],
);

// ─── OAuth Accounts ───────────────────────────────────────────────────

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: cuid2('id').primaryKey(),
    userId: varchar('user_id', { length: 128 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 20 }).notNull(),
    providerAccountId: varchar('provider_account_id', {
      length: 255,
    }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_oauth_provider_id').on(table.provider, table.providerAccountId),
    index('idx_oauth_user_id').on(table.userId),
  ],
);

// ─── Sessions ─────────────────────────────────────────────────────────

export const sessions = pgTable(
  'sessions',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    userId: varchar('user_id', { length: 128 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userAgent: text('user_agent'),
    ipAddress: varchar('ip_address', { length: 255 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_sessions_user_id').on(table.userId),
    index('idx_sessions_expires_at').on(table.expiresAt),
  ],
);

// ─── Password Reset Tokens ───────────────────────────────────────────

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: cuid2('id').primaryKey(),
    userId: varchar('user_id', { length: 128 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 255 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_reset_tokens_user').on(table.userId),
    index('idx_reset_tokens_expires').on(table.expiresAt),
  ],
);

// ─── Calendar Categories ─────────────────────────────────────────────

export const calendarCategories = pgTable(
  'calendar_categories',
  {
    id: cuid2('id').primaryKey(),
    userId: varchar('user_id', { length: 128 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 50 }).notNull(),
    color: varchar('color', { length: 7 }).notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    visible: boolean('visible').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (table) => [index('idx_categories_user').on(table.userId)],
);

// ─── Events ──────────────────────────────────────────────────────────

export const events = pgTable(
  'events',
  {
    id: cuid2('id').primaryKey(),
    userId: varchar('user_id', { length: 128 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    categoryId: varchar('category_id', { length: 128 })
      .notNull()
      .references(() => calendarCategories.id, { onDelete: 'restrict' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    location: varchar('location', { length: 500 }),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    isAllDay: boolean('is_all_day').notNull().default(false),
    color: varchar('color', { length: 7 }),
    visibility: varchar('visibility', { length: 10 }).notNull().default('private'),

    // Recurrence (parent event)
    rrule: text('rrule'),
    exDates: timestamp('ex_dates', { withTimezone: true, mode: 'date' }).array().default([]),

    // Recurrence (exception instance)
    recurringEventId: varchar('recurring_event_id', { length: 128 }),
    originalDate: timestamp('original_date', { withTimezone: true }),

    ...timestamps,
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // Self-referential FK for recurring event exceptions
    foreignKey({
      columns: [table.recurringEventId],
      foreignColumns: [table.id],
    }).onDelete('cascade'),

    // Indexes
    index('idx_events_user_date')
      .on(table.userId, table.startAt, table.endAt)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_events_user_category')
      .on(table.userId, table.categoryId)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_events_recurring_parent')
      .on(table.recurringEventId)
      .where(sql`${table.recurringEventId} IS NOT NULL`),
    index('idx_events_search').using(
      'gin',
      sql`to_tsvector('english', ${table.title} || ' ' || COALESCE(${table.description}, ''))`,
    ),
  ],
);

// ─── Tasks ───────────────────────────────────────────────────────────

export const tasks = pgTable(
  'tasks',
  {
    id: cuid2('id').primaryKey(),
    userId: varchar('user_id', { length: 128 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    categoryId: varchar('category_id', { length: 128 })
      .notNull()
      .references(() => calendarCategories.id, { onDelete: 'restrict' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    priority: varchar('priority', { length: 10 }).notNull().default('none'),
    status: varchar('status', { length: 15 }).notNull().default('todo'),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    // Recurrence
    rrule: text('rrule'),
    exDates: timestamp('ex_dates', { withTimezone: true, mode: 'date' }).array().default([]),
    recurringTaskId: varchar('recurring_task_id', { length: 128 }),
    originalDate: timestamp('original_date', { withTimezone: true }),

    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // Self-referential FK for recurring task exceptions
    foreignKey({
      columns: [table.recurringTaskId],
      foreignColumns: [table.id],
    }).onDelete('cascade'),

    // Indexes
    index('idx_tasks_user_due')
      .on(table.userId, table.dueAt)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_tasks_user_status')
      .on(table.userId, table.status)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_tasks_recurring_parent')
      .on(table.recurringTaskId)
      .where(sql`${table.recurringTaskId} IS NOT NULL`),
    index('idx_tasks_search').using(
      'gin',
      sql`to_tsvector('english', ${table.title} || ' ' || COALESCE(${table.description}, ''))`,
    ),
  ],
);

// ─── Reminders ───────────────────────────────────────────────────────

export const reminders = pgTable(
  'reminders',
  {
    id: cuid2('id').primaryKey(),
    userId: varchar('user_id', { length: 128 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemType: varchar('item_type', { length: 10 }).notNull(),
    itemId: varchar('item_id', { length: 128 }).notNull(),
    minutesBefore: integer('minutes_before').notNull(),
    method: varchar('method', { length: 10 }).notNull(),
    triggerAt: timestamp('trigger_at', { withTimezone: true }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_reminders_trigger')
      .on(table.triggerAt)
      .where(sql`${table.sentAt} IS NULL`),
    index('idx_reminders_item').on(table.itemType, table.itemId),
  ],
);

// ─── User Push Subscriptions ─────────────────────────────────────────

export const userPushSubscriptions = pgTable('user_push_subscriptions', {
  id: cuid2('id').primaryKey(),
  userId: varchar('user_id', { length: 128 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Audit Logs ──────────────────────────────────────────────────────

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: cuid2('id').primaryKey(),
    userId: varchar('user_id', { length: 128 }).references(() => users.id, {
      onDelete: 'set null',
    }),
    action: varchar('action', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }),
    entityId: varchar('entity_id', { length: 128 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ipAddress: varchar('ip_address', { length: 255 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_audit_user_time').on(table.userId, table.createdAt),
    index('idx_audit_action').on(table.action, table.createdAt),
  ],
);

// ─── Relations (Drizzle query builder) ───────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  oauthAccounts: many(oauthAccounts),
  sessions: many(sessions),
  passwordResetTokens: many(passwordResetTokens),
  calendarCategories: many(calendarCategories),
  events: many(events),
  tasks: many(tasks),
  reminders: many(reminders),
  userPushSubscriptions: many(userPushSubscriptions),
  auditLogs: many(auditLogs),
}));

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, {
    fields: [oauthAccounts.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}));

export const calendarCategoriesRelations = relations(calendarCategories, ({ one, many }) => ({
  user: one(users, {
    fields: [calendarCategories.userId],
    references: [users.id],
  }),
  events: many(events),
  tasks: many(tasks),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  user: one(users, {
    fields: [events.userId],
    references: [users.id],
  }),
  category: one(calendarCategories, {
    fields: [events.categoryId],
    references: [calendarCategories.id],
  }),
  parentEvent: one(events, {
    fields: [events.recurringEventId],
    references: [events.id],
    relationName: 'eventExceptions',
  }),
  exceptions: many(events, { relationName: 'eventExceptions' }),
  reminders: many(reminders),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  user: one(users, {
    fields: [tasks.userId],
    references: [users.id],
  }),
  category: one(calendarCategories, {
    fields: [tasks.categoryId],
    references: [calendarCategories.id],
  }),
  parentTask: one(tasks, {
    fields: [tasks.recurringTaskId],
    references: [tasks.id],
    relationName: 'taskExceptions',
  }),
  exceptions: many(tasks, { relationName: 'taskExceptions' }),
  reminders: many(reminders),
}));

export const remindersRelations = relations(reminders, ({ one }) => ({
  user: one(users, {
    fields: [reminders.userId],
    references: [users.id],
  }),
}));

export const userPushSubscriptionsRelations = relations(userPushSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [userPushSubscriptions.userId],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));
