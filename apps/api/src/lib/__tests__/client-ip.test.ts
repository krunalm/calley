import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import { getClientIp } from '../client-ip';

/**
 * Forwarded headers are attacker-controlled unless a reverse proxy overwrites
 * them, so honouring them unconditionally lets any caller choose which
 * rate-limit bucket to land in and whose address to stamp on an audit entry.
 */
describe('getClientIp', () => {
  const previous = process.env.TRUSTED_PROXIES;

  afterEach(() => {
    if (previous === undefined) delete process.env.TRUSTED_PROXIES;
    else process.env.TRUSTED_PROXIES = previous;
  });

  async function resolve(
    headers: Record<string, string>,
    env?: { socket?: string },
  ): Promise<{ ip: string | null }> {
    const app = new Hono();
    app.get('/', (c) => c.json({ ip: getClientIp(c) }));

    // The third argument is the runtime bindings object. @hono/node-server puts
    // the raw socket there, which is what the socket fallback reads.
    const res = await app.request(
      '/',
      { headers },
      env?.socket
        ? { incoming: { socket: { remoteAddress: env.socket, remoteFamily: 'IPv4' } } }
        : undefined,
    );

    return (await res.json()) as { ip: string | null };
  }

  it('ignores forwarded headers when no proxy is configured', async () => {
    delete process.env.TRUSTED_PROXIES;

    const { ip } = await resolve({ 'x-forwarded-for': '203.0.113.9' });

    expect(ip).toBeNull();
  });

  it('ignores a spoofed x-real-ip when no proxy is configured', async () => {
    delete process.env.TRUSTED_PROXIES;

    const { ip } = await resolve({ 'x-real-ip': '203.0.113.9' });

    expect(ip).toBeNull();
  });

  it('honours x-forwarded-for behind a configured proxy', async () => {
    process.env.TRUSTED_PROXIES = '*';

    const { ip } = await resolve({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' });

    // The left-most entry is the original client; the rest are proxy hops.
    expect(ip).toBe('203.0.113.9');
  });

  it('falls back to x-real-ip behind a configured proxy', async () => {
    process.env.TRUSTED_PROXIES = '*';

    const { ip } = await resolve({ 'x-real-ip': ' 203.0.113.9 ' });

    expect(ip).toBe('203.0.113.9');
  });

  it('reads the socket address when no proxy is configured', async () => {
    delete process.env.TRUSTED_PROXIES;

    const { ip } = await resolve({}, { socket: '198.51.100.7' });

    expect(ip).toBe('198.51.100.7');
  });

  it('collapses an IPv4-mapped IPv6 address onto its IPv4 form', async () => {
    delete process.env.TRUSTED_PROXIES;

    // A dual-stack listener reports the same client either way; two spellings
    // would otherwise give one client two rate-limit buckets.
    const { ip } = await resolve({}, { socket: '::ffff:198.51.100.7' });

    expect(ip).toBe('198.51.100.7');
  });

  it('falls back to the socket when a configured proxy sends no headers', async () => {
    process.env.TRUSTED_PROXIES = '*';

    const { ip } = await resolve({}, { socket: '198.51.100.7' });

    expect(ip).toBe('198.51.100.7');
  });
});
