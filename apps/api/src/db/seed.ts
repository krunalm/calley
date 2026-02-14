import { createId } from '@paralleldrive/cuid2';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client, { schema });

async function seed() {
  console.log('Seeding database...');

  // ── Test user (password: "password123") ──
  // Pre-computed Argon2id hash for "password123"
  const userId = createId();
  await db.insert(schema.users).values({
    id: userId,
    email: 'test@calley.app',
    // Placeholder hash — will be replaced with a real Argon2id hash when auth service is implemented
    passwordHash:
      '$argon2id$v=19$m=65536,t=3,p=4$placeholder$placeholder_hash_replace_with_real_hash',
    name: 'Test User',
    timezone: 'America/New_York',
    weekStart: 0,
    timeFormat: '12h',
  });
  console.log('  Created test user: test@calley.app');

  // ── Calendar categories ──
  const personalCategoryId = createId();
  const workCategoryId = createId();
  const healthCategoryId = createId();

  await db.insert(schema.calendarCategories).values([
    {
      id: personalCategoryId,
      userId,
      name: 'Personal',
      color: '#3a6b5c',
      isDefault: true,
      sortOrder: 0,
    },
    {
      id: workCategoryId,
      userId,
      name: 'Work',
      color: '#c8522a',
      isDefault: false,
      sortOrder: 1,
    },
    {
      id: healthCategoryId,
      userId,
      name: 'Health',
      color: '#2563eb',
      isDefault: false,
      sortOrder: 2,
    },
  ]);
  console.log('  Created 3 calendar categories');

  // ── Sample events ──
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Helper to create a date relative to today
  const relativeDate = (daysOffset: number, hours: number, minutes = 0) => {
    const d = new Date(today);
    d.setDate(d.getDate() + daysOffset);
    d.setHours(hours, minutes, 0, 0);
    return d;
  };

  const dentistEventId = createId();

  await db.insert(schema.events).values([
    {
      userId,
      categoryId: workCategoryId,
      title: 'Team Standup',
      description: '<p>Daily standup meeting with the engineering team.</p>',
      location: 'Zoom',
      startAt: relativeDate(0, 9, 0),
      endAt: relativeDate(0, 9, 30),
      rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    },
    {
      userId,
      categoryId: workCategoryId,
      title: 'Sprint Planning',
      description: '<p>Plan next sprint tasks and priorities.</p>',
      location: 'Conference Room A',
      startAt: relativeDate(1, 10, 0),
      endAt: relativeDate(1, 11, 0),
    },
    {
      id: dentistEventId,
      userId,
      categoryId: personalCategoryId,
      title: 'Dentist Appointment',
      location: 'Dr. Smith, 123 Main St',
      startAt: relativeDate(2, 14, 0),
      endAt: relativeDate(2, 15, 0),
    },
    {
      userId,
      categoryId: healthCategoryId,
      title: 'Gym Session',
      description: '<p>Upper body workout</p>',
      location: 'FitLife Gym',
      startAt: relativeDate(0, 7, 0),
      endAt: relativeDate(0, 8, 0),
      rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
    },
    {
      userId,
      categoryId: personalCategoryId,
      title: 'Weekend Trip',
      startAt: relativeDate(5, 0, 0),
      endAt: relativeDate(7, 0, 0),
      isAllDay: true,
    },
  ]);
  console.log('  Created 5 sample events');

  // ── Sample tasks ──
  await db.insert(schema.tasks).values([
    {
      userId,
      categoryId: workCategoryId,
      title: 'Review pull request #42',
      description: 'Review the auth middleware refactor PR.',
      dueAt: relativeDate(0, 17, 0),
      priority: 'high',
      status: 'todo',
      sortOrder: 0,
    },
    {
      userId,
      categoryId: workCategoryId,
      title: 'Write API integration tests',
      dueAt: relativeDate(1, 17, 0),
      priority: 'medium',
      status: 'in_progress',
      sortOrder: 1,
    },
    {
      userId,
      categoryId: personalCategoryId,
      title: 'Buy groceries',
      description: 'Milk, eggs, bread, vegetables',
      dueAt: relativeDate(0, 18, 0),
      priority: 'low',
      status: 'todo',
      sortOrder: 2,
    },
    {
      userId,
      categoryId: personalCategoryId,
      title: 'Call dentist to confirm appointment',
      dueAt: relativeDate(1, 12, 0),
      priority: 'medium',
      status: 'todo',
      sortOrder: 3,
    },
    {
      userId,
      categoryId: workCategoryId,
      title: 'Prepare Q1 report',
      dueAt: relativeDate(5, 17, 0),
      priority: 'high',
      status: 'todo',
      sortOrder: 4,
    },
    {
      userId,
      categoryId: personalCategoryId,
      title: 'File tax returns',
      dueAt: relativeDate(-2, 17, 0),
      priority: 'high',
      status: 'todo',
      sortOrder: 5,
    },
    {
      userId,
      categoryId: healthCategoryId,
      title: 'Schedule annual checkup',
      priority: 'none',
      status: 'todo',
      sortOrder: 6,
    },
  ]);
  console.log('  Created 7 sample tasks');

  // ── Sample reminders ──
  await db.insert(schema.reminders).values([
    {
      userId,
      itemType: 'event',
      itemId: dentistEventId,
      minutesBefore: 15,
      method: 'push',
      triggerAt: relativeDate(2, 13, 45),
    },
  ]);
  console.log('  Created 1 sample reminder');

  console.log('Seed complete!');
  await client.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
