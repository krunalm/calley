import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `sonner` renders toasts through a live store; the client only needs to know
// that it asked for one. The factory is hoisted above these imports, so it
// cannot close over anything declared here — the mock is read back through the
// module instead.
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

import { toast } from 'sonner';

import { apiClient, ApiError, isInvalidCredentials } from '@/lib/api-client';

const toastMock = toast as unknown as {
  error: ReturnType<typeof vi.fn>;
  warning: ReturnType<typeof vi.fn>;
};

// ─── Helpers ────────────────────────────────────────────────────────

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function errorResponse(
  status: number,
  code: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ error: { code, message: 'nope' } }), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function lastRequestInit(): RequestInit {
  const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1][1] as RequestInit;
}

function lastHeaders(): Record<string, string> {
  return lastRequestInit().headers as Record<string, string>;
}

let fetchMock: ReturnType<typeof vi.fn>;
let originalLocation: Location;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  document.cookie = 'csrf_token=; Max-Age=0; path=/';
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

  originalLocation = window.location;
  // jsdom refuses real navigation; the client sets `href` on session expiry and
  // the test only needs to observe that assignment.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, href: '' },
  });
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  vi.restoreAllMocks();
});

// ─── CSRF ───────────────────────────────────────────────────────────

describe('CSRF token handling', () => {
  it('attaches the cookie value on state-changing requests', async () => {
    document.cookie = 'csrf_token=tok-123; path=/';
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await apiClient.post('/events', { title: 'x' });

    expect(lastHeaders()['X-CSRF-Token']).toBe('tok-123');
  });

  it('decodes a percent-encoded cookie value', async () => {
    document.cookie = `csrf_token=${encodeURIComponent('a+b/c=')}; path=/`;
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await apiClient.patch('/events/1', { title: 'x' });

    expect(lastHeaders()['X-CSRF-Token']).toBe('a+b/c=');
  });

  it('omits the header on reads', async () => {
    document.cookie = 'csrf_token=tok-123; path=/';
    fetchMock.mockResolvedValue(jsonResponse([]));

    await apiClient.get('/events');

    expect(lastHeaders()['X-CSRF-Token']).toBeUndefined();
  });

  it('omits the header when no cookie is present', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await apiClient.post('/events', { title: 'x' });

    expect(lastHeaders()['X-CSRF-Token']).toBeUndefined();
  });

  it('sends credentials so the session cookie travels with the request', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));

    await apiClient.get('/events');

    expect(lastRequestInit().credentials).toBe('include');
  });
});

// ─── Connectivity ───────────────────────────────────────────────────

describe('connectivity failures', () => {
  it('fails fast when the browser reports being offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    await expect(apiClient.get('/events')).rejects.toMatchObject({
      error: { code: 'NETWORK_OFFLINE' },
    });
    // No point spending a round trip we know cannot leave the machine.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalled();
  });

  it('wraps a transport failure as a NETWORK_ERROR', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiClient.get('/events')).rejects.toMatchObject({
      status: 0,
      error: { code: 'NETWORK_ERROR' },
    });
    expect(toastMock.error).toHaveBeenCalled();
  });
});

// ─── 401 disambiguation ─────────────────────────────────────────────

/**
 * Both an expired session and a rejected credential arrive as a bare 401. Only
 * the first should bounce the user to /login — doing it for the second replaces
 * the form's inline "wrong password" with a misleading "session expired".
 */
describe('401 handling', () => {
  it('redirects when a session expires mid-flight', async () => {
    fetchMock.mockResolvedValue(errorResponse(401, 'UNAUTHORIZED'));

    await expect(apiClient.get('/events')).rejects.toBeInstanceOf(ApiError);

    expect(window.location.href).toBe('/login');
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringContaining('session has expired'));
  });

  it('leaves a pre-session endpoint to render its own error', async () => {
    fetchMock.mockResolvedValue(errorResponse(401, 'UNAUTHORIZED'));

    await expect(apiClient.post('/auth/login', {})).rejects.toMatchObject({ status: 401 });

    expect(window.location.href).toBe('');
  });

  it('treats a rejected credential on an authenticated endpoint as inline', async () => {
    fetchMock.mockResolvedValue(errorResponse(401, 'INVALID_CREDENTIALS'));

    const err = await apiClient.patch('/auth/me/password', {}).catch((e: unknown) => e);

    expect(isInvalidCredentials(err)).toBe(true);
    expect(window.location.href).toBe('');
  });

  it('does not treat other errors as credential rejections', () => {
    expect(isInvalidCredentials(new ApiError(404, { code: 'NOT_FOUND', message: 'x' }))).toBe(
      false,
    );
    expect(isInvalidCredentials(new Error('boom'))).toBe(false);
  });

  it('redirects when a 401 body cannot be parsed', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 401 }));

    await expect(apiClient.get('/events')).rejects.toBeInstanceOf(ApiError);

    expect(window.location.href).toBe('/login');
  });
});

// ─── Rate limiting ──────────────────────────────────────────────────

describe('429 handling', () => {
  it('reports the Retry-After delay when the server supplies one', async () => {
    fetchMock.mockResolvedValue(errorResponse(429, 'RATE_LIMITED', { 'Retry-After': '42' }));

    await expect(apiClient.get('/events')).rejects.toMatchObject({ status: 429 });

    expect(toastMock.warning).toHaveBeenCalledWith(expect.stringContaining('42 seconds'));
  });

  it('falls back to a generic message when Retry-After is missing', async () => {
    fetchMock.mockResolvedValue(errorResponse(429, 'RATE_LIMITED'));

    await expect(apiClient.get('/events')).rejects.toMatchObject({ status: 429 });

    expect(toastMock.warning).toHaveBeenCalledWith(expect.stringContaining('try again later'));
  });

  it('falls back when Retry-After is not a number', async () => {
    fetchMock.mockResolvedValue(
      errorResponse(429, 'RATE_LIMITED', { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' }),
    );

    await expect(apiClient.get('/events')).rejects.toMatchObject({ status: 429 });

    expect(toastMock.warning).toHaveBeenCalledWith(expect.stringContaining('try again later'));
  });
});

// ─── Responses ──────────────────────────────────────────────────────

describe('response handling', () => {
  it('parses a JSON body', async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ id: 'a' }]));

    await expect(apiClient.get('/events')).resolves.toEqual([{ id: 'a' }]);
  });

  it('returns undefined for 204 No Content', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(apiClient.delete('/events/1')).resolves.toBeUndefined();
  });

  it('surfaces the structured error body', async () => {
    fetchMock.mockResolvedValue(errorResponse(422, 'INVALID_RRULE'));

    await expect(apiClient.get('/events')).rejects.toMatchObject({
      status: 422,
      error: { code: 'INVALID_RRULE' },
    });
  });

  it('falls back to UNKNOWN when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>502</html>', { status: 502 }));

    await expect(apiClient.get('/events')).rejects.toMatchObject({
      status: 502,
      error: { code: 'UNKNOWN' },
    });
  });

  it('omits a body when a POST is sent without one', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await apiClient.post('/events/1/duplicate');

    expect(lastRequestInit().body).toBeUndefined();
  });

  it('serialises a DELETE body when one is supplied', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await apiClient.delete('/tasks', { ids: ['a'] });

    expect(lastRequestInit().body).toBe(JSON.stringify({ ids: ['a'] }));
  });
});
