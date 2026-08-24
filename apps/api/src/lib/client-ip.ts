import { getConnInfo } from '@hono/node-server/conninfo';

import type { Context } from 'hono';

/**
 * Resolve the client IP for a request.
 *
 * Proxy headers (`X-Forwarded-For`, `X-Real-IP`) are attacker-controlled unless
 * the deployment terminates them at a reverse proxy, so they are only consulted
 * when `TRUSTED_PROXIES` is set. Otherwise the address is read straight off the
 * TCP socket, which the client cannot forge.
 *
 * Returns null only when neither source is available — a non-Node runtime, or a
 * unit test driving `app.request()` without a socket behind it.
 */
export function getClientIp(c: Context): string | null {
  if (process.env.TRUSTED_PROXIES) {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return forwarded;

    const realIp = c.req.header('x-real-ip')?.trim();
    if (realIp) return realIp;
  }

  try {
    const address = getConnInfo(c).remote.address;
    if (address) return normalizeIp(address);
  } catch {
    // No Node socket behind this request (unit tests, other runtimes).
  }

  return null;
}

/**
 * Collapse IPv4-mapped IPv6 addresses (`::ffff:203.0.113.4`) onto their IPv4
 * form so the same client cannot occupy two rate-limit buckets depending on
 * whether it connected over a dual-stack listener.
 */
function normalizeIp(address: string): string {
  return address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
}
