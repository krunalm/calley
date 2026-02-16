import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// Inject dns-prefetch for the API origin at runtime so it works in all environments
try {
  const apiOrigin = new URL(API_URL).origin;
  const link = document.createElement('link');
  link.rel = 'dns-prefetch';
  link.href = apiOrigin;
  document.head.appendChild(link);
} catch {
  // Ignore if URL is invalid
}

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

    // Guard against offline requests — fail fast with a descriptive error
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error('You are offline. Please check your connection.');
      throw new ApiError(0, {
        code: 'NETWORK_OFFLINE',
        message: 'No internet connection',
      });
    }

    let res: Response;
    try {
      res = await fetch(`${API_URL}${path}`, {
        credentials: 'include',
        ...options,
        headers,
      });
    } catch (err) {
      // Network error (e.g. ERR_NETWORK, DNS failure, CORS preflight fail)
      toast.error('Network error. Please check your connection and try again.');
      throw new ApiError(0, {
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Network request failed',
      });
    }

    if (res.status === 401) {
      // Session expired mid-session — redirect with informative message
      toast.error('Your session has expired. Please sign in again.');
      window.location.href = '/login';
      throw new ApiError(401, { code: 'UNAUTHORIZED', message: 'Session expired' });
    }

    // Rate limit — show a warning toast with Retry-After info
    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      const seconds = retryAfter !== null ? parseInt(retryAfter, 10) : undefined;
      const hasSeconds = seconds !== undefined && !isNaN(seconds);
      const message = hasSeconds
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

  delete<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'DELETE',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }
}

export const apiClient = new ApiClient();
