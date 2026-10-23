import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import { getClientIp } from '../client-ip';

/**
 * Forwarded headers are attacker-controlled unless a reverse proxy overwrites
 * them, so honouring them unconditionally lets any caller choose which
 * rate-limit bucket to land in and whose address to stamp on an audit entry.
 *
 * When proxies ARE configured, the chain is read from the right (the side our
 * own proxy appends to), never from the left (the side a client can forge).
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

  it('takes the right-most xff entry behind a wildcard proxy', async () => {
    process.env.TRUSTED_PROXIES = '*';

    // The proxy appended the address it saw; the left-most value is the one a
    // client could have forged, so it must NOT be used.
    const { ip } = await resolve(
      { 'x-forwarded-for': '1.2.3.4, 203.0.113.9' },
      { socket: '10.0.0.1' },
    );

    expect(ip).toBe('203.0.113.9');
  });

  it('uses the single entry a one-hop proxy appends', async () => {
    process.env.TRUSTED_PROXIES = '*';

    // With no incoming header, nginx sets X-Forwarded-For to just the address
    // it observed — the real client.
    const { ip } = await resolve({ 'x-forwarded-for': '198.51.100.7' }, { socket: '10.0.0.1' });

    expect(ip).toBe('198.51.100.7');
  });

  it('peels configured proxy addresses from the right', async () => {
    process.env.TRUSTED_PROXIES = '10.0.0.1, 10.0.0.2';

    // Chain as our proxies would build it: client, then each proxy hop.
    const { ip } = await resolve(
      { 'x-forwarded-for': '203.0.113.9, 10.0.0.2' },
      { socket: '10.0.0.1' },
    );

    expect(ip).toBe('203.0.113.9');
  });

  it('supports CIDR ranges in the proxy list', async () => {
    process.env.TRUSTED_PROXIES = '172.16.0.0/12';

    const { ip } = await resolve(
      { 'x-forwarded-for': '203.0.113.9, 172.17.0.5' },
      { socket: '172.18.0.2' },
    );

    expect(ip).toBe('203.0.113.9');
  });

  it('ignores the forwarded header when the peer is not a configured proxy', async () => {
    process.env.TRUSTED_PROXIES = '10.0.0.1';

    // The request arrives from some other address; its XFF is its own forgery.
    const { ip } = await resolve({ 'x-forwarded-for': '1.2.3.4' }, { socket: '198.51.100.7' });

    expect(ip).toBe('198.51.100.7');
  });

  it('falls back to x-real-ip behind a configured proxy', async () => {
    process.env.TRUSTED_PROXIES = '*';

    const { ip } = await resolve({ 'x-real-ip': ' 203.0.113.9 ' }, { socket: '10.0.0.1' });

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
