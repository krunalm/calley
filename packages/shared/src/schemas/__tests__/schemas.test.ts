import { describe, expect, it } from 'vitest';

import {
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  updateProfileSchema,
} from '../auth.schema';
import { createCategorySchema, updateCategorySchema } from '../category.schema';
import {
  cuid2Schema,
  dateRangeSchema,
  datetimeSchema,
  editScopeSchema,
  hexColorSchema,
  paginationSchema,
  timezoneSchema,
  visibilitySchema,
} from '../common.schema';
import { createEventSchema, listEventsQuerySchema, updateEventSchema } from '../event.schema';
import { createReminderSchema, listRemindersQuerySchema } from '../reminder.schema';
import { searchQuerySchema } from '../search.schema';
import {
  createTaskSchema,
  reorderTasksSchema,
  taskPrioritySchema,
  taskStatusSchema,
  updateTaskSchema,
} from '../task.schema';

// ─── Helper ─────────────────────────────────────────────────────────

/** Valid CUID2-like string for testing */
const VALID_CUID2 = 'clh3am2e40000qwer1234abcd';

// ─── Common Schemas ─────────────────────────────────────────────────

describe('Common Schemas', () => {
  describe('cuid2Schema', () => {
    it('should accept a valid CUID2 string', () => {
      expect(cuid2Schema.parse(VALID_CUID2)).toBe(VALID_CUID2);
    });

    it('should reject an uppercase string', () => {
      expect(() => cuid2Schema.parse('CLH3AM2E40000QWER1234ABCD')).toThrow();
    });

    it('should reject a string that is too short', () => {
      expect(() => cuid2Schema.parse('abc123')).toThrow();
    });

    it('should reject a string with special characters', () => {
      expect(() => cuid2Schema.parse('clh3am2e-0000-qwer-1234-abcd')).toThrow();
    });
  });

  describe('hexColorSchema', () => {
    it('should accept a valid hex color', () => {
      expect(hexColorSchema.parse('#FF5733')).toBe('#FF5733');
    });

    it('should accept lowercase hex color', () => {
      expect(hexColorSchema.parse('#ff5733')).toBe('#ff5733');
    });

    it('should reject hex without hash', () => {
      expect(() => hexColorSchema.parse('FF5733')).toThrow();
    });

    it('should reject 3-digit hex shorthand', () => {
      expect(() => hexColorSchema.parse('#F00')).toThrow();
    });

    it('should reject invalid hex characters', () => {
      expect(() => hexColorSchema.parse('#GGGGGG')).toThrow();
    });
  });

  describe('datetimeSchema', () => {
    it('should accept a valid ISO 8601 datetime', () => {
      expect(datetimeSchema.parse('2026-03-15T10:00:00Z')).toBe('2026-03-15T10:00:00Z');
    });

    it('should accept datetime with milliseconds', () => {
      expect(datetimeSchema.parse('2026-03-15T10:00:00.000Z')).toBe('2026-03-15T10:00:00.000Z');
    });

    it('should reject a plain date string', () => {
      expect(() => datetimeSchema.parse('2026-03-15')).toThrow();
    });

    it('should reject an invalid datetime', () => {
      expect(() => datetimeSchema.parse('not-a-date')).toThrow();
    });
  });

  describe('timezoneSchema', () => {
    it('should accept a valid IANA timezone', () => {
      expect(timezoneSchema.parse('America/New_York')).toBe('America/New_York');
    });

    it('should accept UTC', () => {
      expect(timezoneSchema.parse('UTC')).toBe('UTC');
    });

    it('should reject an invalid timezone', () => {
      expect(() => timezoneSchema.parse('Invalid/Timezone')).toThrow();
    });

    it('should reject an empty string', () => {
      expect(() => timezoneSchema.parse('')).toThrow();
    });
  });

  describe('paginationSchema', () => {
    it('should accept valid page and limit', () => {
      const result = paginationSchema.parse({ page: 2, limit: 50 });
      expect(result.page).toBe(2);
      expect(result.limit).toBe(50);
    });

    it('should apply default values', () => {
      const result = paginationSchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should coerce string numbers', () => {
      const result = paginationSchema.parse({ page: '3', limit: '25' });
      expect(result.page).toBe(3);
      expect(result.limit).toBe(25);
    });

    it('should reject page less than 1', () => {
      expect(() => paginationSchema.parse({ page: 0 })).toThrow();
    });

    it('should reject limit greater than 100', () => {
      expect(() => paginationSchema.parse({ limit: 101 })).toThrow();
    });
  });

  describe('dateRangeSchema', () => {
    it('should accept a valid date range', () => {
      const result = dateRangeSchema.parse({
        start: '2026-03-01T00:00:00Z',
        end: '2026-03-31T23:59:59Z',
      });
      expect(result.start).toBe('2026-03-01T00:00:00Z');
      expect(result.end).toBe('2026-03-31T23:59:59Z');
    });

    it('should reject when start is after end', () => {
      expect(() =>
        dateRangeSchema.parse({
          start: '2026-03-31T00:00:00Z',
          end: '2026-03-01T00:00:00Z',
        }),
      ).toThrow();
    });

    it('should reject when start equals end', () => {
      expect(() =>
        dateRangeSchema.parse({
          start: '2026-03-15T10:00:00Z',
          end: '2026-03-15T10:00:00Z',
        }),
      ).toThrow();
    });
  });

  describe('editScopeSchema', () => {
    it('should accept valid scope values', () => {
      expect(editScopeSchema.parse('instance')).toBe('instance');
      expect(editScopeSchema.parse('following')).toBe('following');
      expect(editScopeSchema.parse('all')).toBe('all');
    });

    it('should reject invalid scope value', () => {
      expect(() => editScopeSchema.parse('none')).toThrow();
    });
  });

  describe('visibilitySchema', () => {
    it('should accept valid visibility values', () => {
      expect(visibilitySchema.parse('public')).toBe('public');
      expect(visibilitySchema.parse('private')).toBe('private');
    });

    it('should reject invalid visibility value', () => {
      expect(() => visibilitySchema.parse('hidden')).toThrow();
    });
  });
});

// ─── Auth Schemas ───────────────────────────────────────────────────

describe('Auth Schemas', () => {
  describe('signupSchema', () => {
    it('should accept valid signup data', () => {
      const result = signupSchema.parse({
        name: 'John Doe',
        email: 'John@Example.COM',
        password: 'securepass123',
      });
      expect(result.name).toBe('John Doe');
      expect(result.email).toBe('john@example.com'); // transformed to lowercase
      expect(result.password).toBe('securepass123');
    });

    it('should reject missing name', () => {
      expect(() =>
        signupSchema.parse({ email: 'test@example.com', password: 'password123' }),
      ).toThrow();
    });

    it('should reject invalid email', () => {
      expect(() =>
        signupSchema.parse({ name: 'John', email: 'not-an-email', password: 'password123' }),
      ).toThrow();
    });

    it('should reject password shorter than 8 characters', () => {
      expect(() =>
        signupSchema.parse({ name: 'John', email: 'test@example.com', password: 'short' }),
      ).toThrow();
    });

    it('should reject password longer than 128 characters', () => {
      expect(() =>
        signupSchema.parse({
          name: 'John',
          email: 'test@example.com',
          password: 'a'.repeat(129),
        }),
      ).toThrow();
    });

    it('should reject name longer than 100 characters', () => {
      expect(() =>
        signupSchema.parse({
          name: 'a'.repeat(101),
          email: 'test@example.com',
          password: 'password123',
        }),
      ).toThrow();
    });

    it('should transform email to lowercase', () => {
      const result = signupSchema.parse({
        name: 'John',
        email: 'TEST@EXAMPLE.COM',
        password: 'password123',
      });
      expect(result.email).toBe('test@example.com');
    });
  });

  describe('loginSchema', () => {
    it('should accept valid login data', () => {
      const result = loginSchema.parse({
        email: 'Test@Example.com',
        password: 'password123',
      });
      expect(result.email).toBe('test@example.com');
    });

    it('should reject empty password', () => {
      expect(() => loginSchema.parse({ email: 'test@example.com', password: '' })).toThrow();
    });

    it('should reject invalid email format', () => {
      expect(() => loginSchema.parse({ email: 'invalid', password: 'password123' })).toThrow();
    });
  });

  describe('forgotPasswordSchema', () => {
    it('should accept valid email', () => {
      const result = forgotPasswordSchema.parse({ email: 'USER@Example.com' });
      expect(result.email).toBe('user@example.com');
    });

    it('should reject invalid email', () => {
      expect(() => forgotPasswordSchema.parse({ email: 'not-an-email' })).toThrow();
    });
  });

  describe('resetPasswordSchema', () => {
    it('should accept valid token and password', () => {
      const result = resetPasswordSchema.parse({
        token: 'valid-reset-token-123',
        password: 'newpassword123',
      });
      expect(result.token).toBe('valid-reset-token-123');
      expect(result.password).toBe('newpassword123');
    });

    it('should reject empty token', () => {
      expect(() => resetPasswordSchema.parse({ token: '', password: 'newpassword123' })).toThrow();
    });

    it('should reject password shorter than 8 characters', () => {
      expect(() =>
        resetPasswordSchema.parse({ token: 'valid-token', password: 'short' }),
      ).toThrow();
    });

    it('should reject token longer than 256 characters', () => {
      expect(() =>
        resetPasswordSchema.parse({ token: 'a'.repeat(257), password: 'newpassword123' }),
      ).toThrow();
    });
  });

  describe('updateProfileSchema', () => {
    it('should accept valid profile updates', () => {
      const result = updateProfileSchema.parse({
        name: 'New Name',
        timezone: 'Europe/London',
        weekStart: 1,
        timeFormat: '24h',
      });
      expect(result.name).toBe('New Name');
      expect(result.timezone).toBe('Europe/London');
      expect(result.weekStart).toBe(1);
      expect(result.timeFormat).toBe('24h');
    });

    it('should accept empty object (all fields optional)', () => {
      const result = updateProfileSchema.parse({});
      expect(result).toEqual({});
    });

    it('should reject invalid weekStart value', () => {
      expect(() => updateProfileSchema.parse({ weekStart: 2 })).toThrow();
    });

    it('should reject invalid timeFormat', () => {
      expect(() => updateProfileSchema.parse({ timeFormat: '8h' })).toThrow();
    });
  });

  describe('changePasswordSchema', () => {
    it('should accept valid password change', () => {
      const result = changePasswordSchema.parse({
        currentPassword: 'oldpassword',
        newPassword: 'newpassword123',
      });
      expect(result.currentPassword).toBe('oldpassword');
      expect(result.newPassword).toBe('newpassword123');
    });

    it('should reject empty current password', () => {
      expect(() =>
        changePasswordSchema.parse({ currentPassword: '', newPassword: 'newpass123' }),
      ).toThrow();
    });

    it('should reject new password shorter than 8 characters', () => {
      expect(() =>
        changePasswordSchema.parse({ currentPassword: 'old', newPassword: 'short' }),
      ).toThrow();
    });
  });

  describe('deleteAccountSchema', () => {
    it('should accept valid password', () => {
      const result = deleteAccountSchema.parse({ password: 'mypassword' });
      expect(result.password).toBe('mypassword');
    });

    it('should reject empty password', () => {
      expect(() => deleteAccountSchema.parse({ password: '' })).toThrow();
    });
  });
});

// ─── Event Schemas ──────────────────────────────────────────────────

describe('Event Schemas', () => {
  describe('createEventSchema', () => {
    const validEvent = {
      title: 'Team Meeting',
      startAt: '2026-03-15T10:00:00Z',
      endAt: '2026-03-15T11:00:00Z',
      categoryId: VALID_CUID2,
    };

    it('should accept a valid event', () => {
      const result = createEventSchema.parse(validEvent);
      expect(result.title).toBe('Team Meeting');
      expect(result.isAllDay).toBe(false); // default
      expect(result.visibility).toBe('private'); // default
    });

    it('should reject missing title', () => {
      expect(() => createEventSchema.parse({ ...validEvent, title: undefined })).toThrow();
    });

    it('should reject empty title', () => {
      expect(() => createEventSchema.parse({ ...validEvent, title: '' })).toThrow();
    });

    it('should reject title longer than 200 characters', () => {
      expect(() => createEventSchema.parse({ ...validEvent, title: 'a'.repeat(201) })).toThrow();
    });

    it('should reject when endAt is before startAt', () => {
      expect(() =>
        createEventSchema.parse({
          ...validEvent,
          startAt: '2026-03-15T14:00:00Z',
          endAt: '2026-03-15T13:00:00Z',
        }),
      ).toThrow();
    });

    it('should allow endAt before startAt for all-day events', () => {
      // All-day events skip the end > start refinement
      const result = createEventSchema.parse({
        ...validEvent,
        isAllDay: true,
        startAt: '2026-03-15T00:00:00Z',
        endAt: '2026-03-15T00:00:00Z',
      });
      expect(result.isAllDay).toBe(true);
    });

    it('should reject description longer than 5000 characters', () => {
      expect(() =>
        createEventSchema.parse({ ...validEvent, description: 'a'.repeat(5001) }),
      ).toThrow();
    });

    it('should reject location longer than 500 characters', () => {
      expect(() => createEventSchema.parse({ ...validEvent, location: 'a'.repeat(501) })).toThrow();
    });

    it('should accept optional reminder', () => {
      const result = createEventSchema.parse({
        ...validEvent,
        reminder: { minutesBefore: 15, method: 'push' },
      });
      expect(result.reminder?.minutesBefore).toBe(15);
      expect(result.reminder?.method).toBe('push');
    });

    it('should reject reminder with negative minutesBefore', () => {
      expect(() =>
        createEventSchema.parse({
          ...validEvent,
          reminder: { minutesBefore: -1, method: 'push' },
        }),
      ).toThrow();
    });

    it('should reject reminder with minutesBefore exceeding max (40320)', () => {
      expect(() =>
        createEventSchema.parse({
          ...validEvent,
          reminder: { minutesBefore: 40321, method: 'push' },
        }),
      ).toThrow();
    });

    it('should accept valid visibility values', () => {
      const result = createEventSchema.parse({ ...validEvent, visibility: 'public' });
      expect(result.visibility).toBe('public');
    });

    it('should accept null color', () => {
      const result = createEventSchema.parse({ ...validEvent, color: null });
      expect(result.color).toBeNull();
    });

    it('should accept valid hex color', () => {
      const result = createEventSchema.parse({ ...validEvent, color: '#FF5733' });
      expect(result.color).toBe('#FF5733');
    });

    it('should reject invalid hex color', () => {
      expect(() => createEventSchema.parse({ ...validEvent, color: 'red' })).toThrow();
    });
  });

  describe('updateEventSchema', () => {
    it('should accept partial update', () => {
      const result = updateEventSchema.parse({ title: 'Updated Title' });
      expect(result.title).toBe('Updated Title');
    });

    it('should accept empty update (all fields optional)', () => {
      const result = updateEventSchema.parse({});
      expect(result).toBeDefined();
    });

    it('should reject when both startAt and endAt given but end is before start', () => {
      expect(() =>
        updateEventSchema.parse({
          startAt: '2026-03-15T14:00:00Z',
          endAt: '2026-03-15T13:00:00Z',
        }),
      ).toThrow();
    });

    it('should allow mismatched times when only one is provided', () => {
      // Refinement only triggers when both startAt and endAt are given
      const result = updateEventSchema.parse({ startAt: '2026-03-15T14:00:00Z' });
      expect(result.startAt).toBe('2026-03-15T14:00:00Z');
    });
  });

  describe('listEventsQuerySchema', () => {
    it('should accept valid start and end', () => {
      const result = listEventsQuerySchema.parse({
        start: '2026-03-01T00:00:00Z',
        end: '2026-03-31T23:59:59Z',
      });
      expect(result.start).toBe('2026-03-01T00:00:00Z');
      expect(result.end).toBe('2026-03-31T23:59:59Z');
    });

    it('should reject missing start', () => {
      expect(() => listEventsQuerySchema.parse({ end: '2026-03-31T23:59:59Z' })).toThrow();
    });

    it('should parse categoryIds from comma-separated string', () => {
      const result = listEventsQuerySchema.parse({
        start: '2026-03-01T00:00:00Z',
        end: '2026-03-31T23:59:59Z',
        categoryIds: `${VALID_CUID2},${VALID_CUID2}`,
      });
      expect(result.categoryIds).toHaveLength(2);
    });

    it('should reject invalid categoryIds format', () => {
      expect(() =>
        listEventsQuerySchema.parse({
          start: '2026-03-01T00:00:00Z',
          end: '2026-03-31T23:59:59Z',
          categoryIds: 'invalid-id,also-invalid',
        }),
      ).toThrow();
    });
  });
});

// ─── Task Schemas ───────────────────────────────────────────────────

describe('Task Schemas', () => {
  describe('taskPrioritySchema', () => {
    it('should accept valid priority values', () => {
      expect(taskPrioritySchema.parse('none')).toBe('none');
      expect(taskPrioritySchema.parse('low')).toBe('low');
      expect(taskPrioritySchema.parse('medium')).toBe('medium');
      expect(taskPrioritySchema.parse('high')).toBe('high');
    });

    it('should reject invalid priority', () => {
      expect(() => taskPrioritySchema.parse('urgent')).toThrow();
    });
  });

  describe('taskStatusSchema', () => {
    it('should accept valid status values', () => {
      expect(taskStatusSchema.parse('todo')).toBe('todo');
      expect(taskStatusSchema.parse('in_progress')).toBe('in_progress');
      expect(taskStatusSchema.parse('done')).toBe('done');
    });

    it('should reject invalid status', () => {
      expect(() => taskStatusSchema.parse('cancelled')).toThrow();
    });
  });

  describe('createTaskSchema', () => {
    const validTask = {
      title: 'Buy groceries',
      categoryId: VALID_CUID2,
    };

    it('should accept a valid task', () => {
      const result = createTaskSchema.parse(validTask);
      expect(result.title).toBe('Buy groceries');
      expect(result.priority).toBe('none'); // default
    });

    it('should reject missing title', () => {
      expect(() => createTaskSchema.parse({ categoryId: VALID_CUID2 })).toThrow();
    });

    it('should reject empty title', () => {
      expect(() => createTaskSchema.parse({ ...validTask, title: '' })).toThrow();
    });

    it('should reject title longer than 200 characters', () => {
      expect(() => createTaskSchema.parse({ ...validTask, title: 'a'.repeat(201) })).toThrow();
    });

    it('should accept nullable dueAt', () => {
      const result = createTaskSchema.parse({ ...validTask, dueAt: null });
      expect(result.dueAt).toBeNull();
    });

    it('should accept valid dueAt datetime', () => {
      const result = createTaskSchema.parse({
        ...validTask,
        dueAt: '2026-04-01T12:00:00Z',
      });
      expect(result.dueAt).toBe('2026-04-01T12:00:00Z');
    });

    it('should accept description up to 5000 characters', () => {
      const result = createTaskSchema.parse({
        ...validTask,
        description: 'a'.repeat(5000),
      });
      expect(result.description).toHaveLength(5000);
    });

    it('should reject description longer than 5000 characters', () => {
      expect(() =>
        createTaskSchema.parse({ ...validTask, description: 'a'.repeat(5001) }),
      ).toThrow();
    });
  });

  describe('updateTaskSchema', () => {
    it('should accept partial update', () => {
      const result = updateTaskSchema.parse({ title: 'Updated task' });
      expect(result.title).toBe('Updated task');
    });

    it('should accept status update', () => {
      const result = updateTaskSchema.parse({ status: 'done' });
      expect(result.status).toBe('done');
    });

    it('should accept priority update', () => {
      const result = updateTaskSchema.parse({ priority: 'high' });
      expect(result.priority).toBe('high');
    });

    it('should reject invalid status on update', () => {
      expect(() => updateTaskSchema.parse({ status: 'pending' })).toThrow();
    });
  });

  describe('reorderTasksSchema', () => {
    it('should accept valid task IDs array', () => {
      const result = reorderTasksSchema.parse({
        ids: [VALID_CUID2, VALID_CUID2],
      });
      expect(result.ids).toHaveLength(2);
    });

    it('should reject empty IDs array', () => {
      expect(() => reorderTasksSchema.parse({ ids: [] })).toThrow();
    });

    it('should reject invalid ID format', () => {
      expect(() => reorderTasksSchema.parse({ ids: ['invalid-id'] })).toThrow();
    });
  });
});

// ─── Category Schemas ───────────────────────────────────────────────

describe('Category Schemas', () => {
  describe('createCategorySchema', () => {
    it('should accept valid category data', () => {
      const result = createCategorySchema.parse({
        name: 'Work',
        color: '#4A90D9',
      });
      expect(result.name).toBe('Work');
      expect(result.color).toBe('#4A90D9');
    });

    it('should reject missing name', () => {
      expect(() => createCategorySchema.parse({ color: '#4A90D9' })).toThrow();
    });

    it('should reject empty name', () => {
      expect(() => createCategorySchema.parse({ name: '', color: '#4A90D9' })).toThrow();
    });

    it('should reject name longer than 50 characters', () => {
      expect(() =>
        createCategorySchema.parse({ name: 'a'.repeat(51), color: '#4A90D9' }),
      ).toThrow();
    });

    it('should reject invalid color format', () => {
      expect(() => createCategorySchema.parse({ name: 'Work', color: 'blue' })).toThrow();
    });
  });

  describe('updateCategorySchema', () => {
    it('should accept partial update with name only', () => {
      const result = updateCategorySchema.parse({ name: 'Personal' });
      expect(result.name).toBe('Personal');
    });

    it('should accept visible toggle', () => {
      const result = updateCategorySchema.parse({ visible: false });
      expect(result.visible).toBe(false);
    });

    it('should accept sortOrder', () => {
      const result = updateCategorySchema.parse({ sortOrder: 5 });
      expect(result.sortOrder).toBe(5);
    });

    it('should reject negative sortOrder', () => {
      expect(() => updateCategorySchema.parse({ sortOrder: -1 })).toThrow();
    });

    it('should accept empty object', () => {
      const result = updateCategorySchema.parse({});
      expect(result).toBeDefined();
    });
  });
});

// ─── Reminder Schemas ───────────────────────────────────────────────

describe('Reminder Schemas', () => {
  describe('createReminderSchema', () => {
    it('should accept valid reminder data', () => {
      const result = createReminderSchema.parse({
        itemType: 'event',
        itemId: VALID_CUID2,
        minutesBefore: 15,
      });
      expect(result.itemType).toBe('event');
      expect(result.minutesBefore).toBe(15);
      expect(result.method).toBe('push'); // default
    });

    it('should accept task item type', () => {
      const result = createReminderSchema.parse({
        itemType: 'task',
        itemId: VALID_CUID2,
        minutesBefore: 30,
        method: 'email',
      });
      expect(result.itemType).toBe('task');
      expect(result.method).toBe('email');
    });

    it('should accept "both" method', () => {
      const result = createReminderSchema.parse({
        itemType: 'event',
        itemId: VALID_CUID2,
        minutesBefore: 10,
        method: 'both',
      });
      expect(result.method).toBe('both');
    });

    it('should reject invalid item type', () => {
      expect(() =>
        createReminderSchema.parse({
          itemType: 'note',
          itemId: VALID_CUID2,
          minutesBefore: 15,
        }),
      ).toThrow();
    });

    it('should reject negative minutesBefore', () => {
      expect(() =>
        createReminderSchema.parse({
          itemType: 'event',
          itemId: VALID_CUID2,
          minutesBefore: -5,
        }),
      ).toThrow();
    });

    it('should reject minutesBefore exceeding 40320 (4 weeks)', () => {
      expect(() =>
        createReminderSchema.parse({
          itemType: 'event',
          itemId: VALID_CUID2,
          minutesBefore: 40321,
        }),
      ).toThrow();
    });

    it('should accept 0 minutesBefore', () => {
      const result = createReminderSchema.parse({
        itemType: 'event',
        itemId: VALID_CUID2,
        minutesBefore: 0,
      });
      expect(result.minutesBefore).toBe(0);
    });

    it('should accept 40320 minutesBefore (exactly 4 weeks)', () => {
      const result = createReminderSchema.parse({
        itemType: 'event',
        itemId: VALID_CUID2,
        minutesBefore: 40320,
      });
      expect(result.minutesBefore).toBe(40320);
    });
  });

  describe('listRemindersQuerySchema', () => {
    it('should accept valid query', () => {
      const result = listRemindersQuerySchema.parse({
        itemType: 'event',
        itemId: VALID_CUID2,
      });
      expect(result.itemType).toBe('event');
      expect(result.itemId).toBe(VALID_CUID2);
    });

    it('should reject missing itemType', () => {
      expect(() => listRemindersQuerySchema.parse({ itemId: VALID_CUID2 })).toThrow();
    });

    it('should reject missing itemId', () => {
      expect(() => listRemindersQuerySchema.parse({ itemType: 'event' })).toThrow();
    });
  });
});

// ─── Search Schema ──────────────────────────────────────────────────

describe('Search Schema', () => {
  describe('searchQuerySchema', () => {
    it('should accept valid search query', () => {
      const result = searchQuerySchema.parse({ q: 'team meeting' });
      expect(result.q).toBe('team meeting');
      expect(result.limit).toBe(20); // default
    });

    it('should accept custom limit', () => {
      const result = searchQuerySchema.parse({ q: 'test', limit: 10 });
      expect(result.limit).toBe(10);
    });

    it('should reject query shorter than 2 characters', () => {
      expect(() => searchQuerySchema.parse({ q: 'a' })).toThrow();
    });

    it('should reject query longer than 100 characters', () => {
      expect(() => searchQuerySchema.parse({ q: 'a'.repeat(101) })).toThrow();
    });

    it('should reject limit greater than 50', () => {
      expect(() => searchQuerySchema.parse({ q: 'test', limit: 51 })).toThrow();
    });

    it('should reject limit less than 1', () => {
      expect(() => searchQuerySchema.parse({ q: 'test', limit: 0 })).toThrow();
    });

    it('should coerce string limit to number', () => {
      const result = searchQuerySchema.parse({ q: 'test', limit: '15' });
      expect(result.limit).toBe(15);
    });
  });
});
