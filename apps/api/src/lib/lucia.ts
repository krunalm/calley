import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle';
import { Lucia, TimeSpan } from 'lucia';

import { db } from '../db';
import { sessions, users } from '../db/schema';

const adapter = new DrizzlePostgreSQLAdapter(db, sessions, users);

export const lucia = new Lucia(adapter, {
  sessionExpiresIn: new TimeSpan(30, 'd'), // 30-day absolute expiry
  sessionCookie: {
    name: 'calley_session',
    attributes: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      domain: process.env.COOKIE_DOMAIN,
    },
  },
  getSessionAttributes: (attributes) => {
    return {
      userAgent: attributes.userAgent,
      ipAddress: attributes.ipAddress,
      lastActiveAt: attributes.lastActiveAt,
    };
  },
  getUserAttributes: (attributes) => {
    return {
      email: attributes.email,
      name: attributes.name,
      avatarUrl: attributes.avatarUrl,
      timezone: attributes.timezone,
      weekStart: attributes.weekStart,
      timeFormat: attributes.timeFormat,
    };
  },
});

// ─── Lucia Type Declarations ───────────────────────────────────────────

declare module 'lucia' {
  interface Register {
    Lucia: typeof lucia;
    DatabaseSessionAttributes: DatabaseSessionAttributes;
    DatabaseUserAttributes: DatabaseUserAttributes;
  }
}

interface DatabaseSessionAttributes {
  userAgent: string | null;
  ipAddress: string | null;
  lastActiveAt: Date;
}

interface DatabaseUserAttributes {
  email: string;
  name: string;
  avatarUrl: string | null;
  timezone: string;
  weekStart: number;
  timeFormat: string;
}
