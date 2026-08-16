import { request } from '@playwright/test';

import type { APIRequestContext, APIResponse } from '@playwright/test';

/**
 * Thin HTTP client used by the E2E suite to drive the Calley API directly.
 *
 * The UI specs exercise the app through the browser; these helpers let the
 * API-contract specs (and the setup phase of UI specs) create fixtures
 * cheaply, without paying for a full page load per record.
 *
 * Cookie handling is delegated to Playwright's per-context cookie jar. The
 * only thing this wrapper adds is the double-submit CSRF header (§4.7),
 * which the backend requires on every state-changing request.
 */

export const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:4000';

export const CSRF_COOKIE = 'csrf_token';
export const SESSION_COOKIE = 'calley_session';

export interface TestCredentials {
  name: string;
  email: string;
  password: string;
}

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  timezone: string;
  weekStart: number;
  timeFormat: string;
}

export interface ApiCategory {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
  visible: boolean;
  sortOrder: number;
}

export interface ApiEvent {
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
  exDates: string[] | null;
  recurringEventId: string | null;
  originalDate?: string | null;
  isRecurringInstance?: boolean;
  instanceDate?: string;
  deletedAt: string | null;
}

export interface ApiTask {
  id: string;
  userId: string;
  categoryId: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  priority: 'none' | 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress' | 'done';
  completedAt: string | null;
  sortOrder: number;
  rrule: string | null;
  deletedAt: string | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

let counter = 0;

/** Build an email that is unique across workers, files and repeat runs. */
export function uniqueEmail(prefix = 'e2e'): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${counter}-${rand}@example.com`;
}

export function makeCredentials(prefix = 'e2e'): TestCredentials {
  return {
    name: 'E2E Test User',
    email: uniqueEmail(prefix),
    password: 'E2eTestP@ss123!',
  };
}

/** A session-scoped API client bound to one Playwright request context. */
export class ApiSession {
  constructor(
    readonly ctx: APIRequestContext,
    public credentials?: TestCredentials,
    public user?: ApiUser,
  ) {}

  /** Read the double-submit CSRF token out of the context cookie jar. */
  async csrfToken(): Promise<string | undefined> {
    const state = await this.ctx.storageState();
    return state.cookies.find((c) => c.name === CSRF_COOKIE)?.value;
  }

  async sessionCookie(): Promise<string | undefined> {
    const state = await this.ctx.storageState();
    return state.cookies.find((c) => c.name === SESSION_COOKIE)?.value;
  }

  async cookies() {
    const state = await this.ctx.storageState();
    return state.cookies;
  }

  private async writeHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
    const token = await this.csrfToken();
    return {
      'content-type': 'application/json',
      ...(token ? { 'x-csrf-token': token } : {}),
      ...extra,
    };
  }

  get(path: string, params?: Record<string, string | number | boolean>): Promise<APIResponse> {
    return this.ctx.get(API_BASE + path, params ? { params } : undefined);
  }

  async post(path: string, data?: unknown, headers?: Record<string, string>): Promise<APIResponse> {
    return this.ctx.post(API_BASE + path, {
      headers: await this.writeHeaders(headers),
      data: data === undefined ? {} : data,
    });
  }

  async patch(
    path: string,
    data?: unknown,
    headers?: Record<string, string>,
  ): Promise<APIResponse> {
    return this.ctx.patch(API_BASE + path, {
      headers: await this.writeHeaders(headers),
      data: data === undefined ? {} : data,
    });
  }

  async delete(
    path: string,
    data?: unknown,
    headers?: Record<string, string>,
  ): Promise<APIResponse> {
    return this.ctx.delete(API_BASE + path, {
      headers: await this.writeHeaders(headers),
      ...(data === undefined ? {} : { data }),
    });
  }

  // ─── Typed convenience wrappers ─────────────────────────────────

  async signup(credentials: TestCredentials = makeCredentials()): Promise<ApiUser> {
    const res = await this.post('/auth/signup', credentials);
    if (res.status() !== 201) {
      throw new Error(`Signup failed (${res.status()}): ${await res.text()}`);
    }
    this.credentials = credentials;
    this.user = (await res.json()) as ApiUser;
    return this.user;
  }

  async login(credentials: TestCredentials): Promise<ApiUser> {
    const res = await this.post('/auth/login', {
      email: credentials.email,
      password: credentials.password,
    });
    if (!res.ok()) {
      throw new Error(`Login failed (${res.status()}): ${await res.text()}`);
    }
    this.credentials = credentials;
    this.user = (await res.json()) as ApiUser;
    return this.user;
  }

  async logout(): Promise<void> {
    await this.post('/auth/logout');
  }

  async me(): Promise<ApiUser> {
    const res = await this.get('/auth/me');
    if (!res.ok()) throw new Error(`GET /auth/me failed (${res.status()})`);
    return (await res.json()) as ApiUser;
  }

  async categories(): Promise<ApiCategory[]> {
    const res = await this.get('/categories');
    if (!res.ok()) throw new Error(`GET /categories failed (${res.status()})`);
    return (await res.json()) as ApiCategory[];
  }

  async defaultCategory(): Promise<ApiCategory> {
    const all = await this.categories();
    const found = all.find((c) => c.isDefault) ?? all[0];
    if (!found) throw new Error('No categories found for user');
    return found;
  }

  async createCategory(name: string, color = '#3B82F6'): Promise<ApiCategory> {
    const res = await this.post('/categories', { name, color });
    if (res.status() !== 201) {
      throw new Error(`Create category failed (${res.status()}): ${await res.text()}`);
    }
    return (await res.json()) as ApiCategory;
  }

  async createEvent(data: Record<string, unknown>): Promise<ApiEvent> {
    const res = await this.post('/events', data);
    if (res.status() !== 201) {
      throw new Error(`Create event failed (${res.status()}): ${await res.text()}`);
    }
    return (await res.json()) as ApiEvent;
  }

  async listEvents(start: string, end: string, categoryIds?: string[]): Promise<ApiEvent[]> {
    const res = await this.get('/events', {
      start,
      end,
      ...(categoryIds ? { categoryIds: categoryIds.join(',') } : {}),
    });
    if (!res.ok()) throw new Error(`List events failed (${res.status()}): ${await res.text()}`);
    return (await res.json()) as ApiEvent[];
  }

  async createTask(data: Record<string, unknown>): Promise<ApiTask> {
    const res = await this.post('/tasks', data);
    if (res.status() !== 201) {
      throw new Error(`Create task failed (${res.status()}): ${await res.text()}`);
    }
    return (await res.json()) as ApiTask;
  }

  async listTasks(params?: Record<string, string>): Promise<ApiTask[]> {
    const res = await this.get('/tasks', params);
    if (!res.ok()) throw new Error(`List tasks failed (${res.status()}): ${await res.text()}`);
    return (await res.json()) as ApiTask[];
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }
}

/** Create a brand-new, unauthenticated API session. */
export async function newApiSession(): Promise<ApiSession> {
  const ctx = await request.newContext({ baseURL: API_BASE });
  return new ApiSession(ctx);
}

/** Create an API session already signed up (and therefore logged in). */
export async function newAuthedApiSession(prefix = 'e2e'): Promise<ApiSession> {
  const session = await newApiSession();
  await session.signup(makeCredentials(prefix));
  return session;
}

/** Parse an error body, failing loudly when the shape is unexpected. */
export async function errorBody(res: APIResponse): Promise<ApiErrorBody['error']> {
  const body = (await res.json()) as ApiErrorBody;
  if (!body || typeof body !== 'object' || !('error' in body)) {
    throw new Error(`Expected an error envelope, got: ${JSON.stringify(body)}`);
  }
  return body.error;
}
