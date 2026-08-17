import { errorBody } from '../support/api';
import { expect, test } from '../support/fixtures';

/**
 * Health, service metadata and error-envelope contract.
 */

test.describe('API — health & error envelope', () => {
  test('GET /health returns ok with a timestamp', async ({ anonApi }) => {
    const res = await anonApi.get('/health');
    expect(res.status()).toBe(200);

    const body = (await res.json()) as { status: string; timestamp: string };
    expect(body.status).toBe('ok');
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  test('GET /health/ready reports dependency readiness', async ({ anonApi }) => {
    const res = await anonApi.get('/health/ready');
    expect([200, 503]).toContain(res.status());

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty('status');
  });

  test('health endpoint needs no authentication', async ({ anonApi }) => {
    const res = await anonApi.get('/health');
    expect(res.ok()).toBe(true);
  });

  test('unknown routes return 404', async ({ anonApi }) => {
    const res = await anonApi.get('/definitely-not-a-route');
    expect(res.status()).toBe(404);
  });

  test('protected routes return a structured UNAUTHORIZED envelope', async ({ anonApi }) => {
    const res = await anonApi.get('/events', {
      start: '2031-01-01T00:00:00.000Z',
      end: '2031-02-01T00:00:00.000Z',
    });
    expect(res.status()).toBe(401);

    const err = await errorBody(res);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(typeof err.message).toBe('string');
  });

  test('validation failures return VALIDATION_ERROR with field details', async ({ api }) => {
    const res = await api.get('/events', { start: 'not-a-date', end: 'also-not-a-date' });
    expect(res.status()).toBe(400);

    const err = await errorBody(res);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(err.details)).toBe(true);
  });
});
