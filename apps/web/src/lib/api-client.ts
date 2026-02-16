import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

/**
 * Read the CSRF token from the `csrf_token` cookie.
 *
 * The cookie is set by the backend with `HttpOnly: false` so that frontend
 * JavaScript can read it. The value is sent as the `X-CSRF-Token` header
 * on all state-changing requests (POST, PATCH, DELETE) to implement
 * double-submit cookie CSRF protection (spec §4.7).
 */
function getCsrfTokenFromCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Structured API error from the backend.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public error: { code: string; message: string; details?: unknown },
  ) {
    super(error.message);
    this.name = 'ApiError';
  }
}

/**
 * API client wrapping fetch with:
 * - Base URL from environment
 * - Credentials: include (for session cookies)
 * - Auto-attach CSRF token header on state-changing requests
 * - Auto-parse JSON responses
 * - Error handling (throw on non-2xx, extract error body)
 * - 401 handling → redirect to login
 * - 429 handling → show rate limit warning toast with Retry-After
 */
class ApiClient {
  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options?.headers as Record<string, string>) ?? {}),
    };

    // Attach CSRF token on state-changing requests
    const method = options?.method?.toUpperCase() ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      const csrfToken = getCsrfTokenFromCookie();
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }
    }

    const res = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      ...options,
      headers,
    });

    if (res.status === 401) {
      window.location.href = '/login';
      throw new ApiError(401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
    }

    // Rate limit — show a warning toast with Retry-After info
    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      const seconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
      const message =
        seconds && !isNaN(seconds)
          ? `Too many requests. Please try again in ${seconds} seconds.`
          : 'Too many requests. Please try again later.';
      toast.warning(message);
      const body = await res.json().catch(() => ({
        error: { code: 'RATE_LIMITED', message },
      }));
      throw new ApiError(429, body.error);
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({
        error: { code: 'UNKNOWN', message: 'An unexpected error occurred' },
      }));
      throw new ApiError(res.status, body.error);
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
