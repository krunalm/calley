import { isIP } from 'node:net';

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
 * When proxies ARE configured, the list is peeled from the right: proxies
 * append the address they saw to `X-Forwarded-For`, so the right-most entries
 * belong to our own infrastructure and the right-most *untrusted* entry is the
 * real client. Taking the left-most value instead would let any caller choose
 * their own rate-limit bucket and audit-trail address simply by sending a
 * forged header the proxy preserves.
 *
 * `TRUSTED_PROXIES` is a comma-separated list of IPs or IPv4 CIDR ranges
 * (e.g. `172.16.0.0/12`). The special value `*` trusts any immediate peer.
 *
 * Returns null only when neither source is available — a non-Node runtime, or a
 * unit test driving `app.request()` without a socket behind it.
 */
export function getClientIp(c: Context): string | null {
  const trusted = process.env.TRUSTED_PROXIES;

  if (trusted) {
    const socketAddress = getSocketAddress(c);

    // The header can only be believed when the connection itself comes from a
    // configured proxy; otherwise the client is talking to us directly and any
    // X-Forwarded-For it sends is its own forgery. `*` opts into trusting any
    // peer (single-hop deployments behind an unknown-but-controlled proxy).
    if (socketAddress && (trusted === '*' || isTrusted(socketAddress, trusted))) {
      const forwarded = c.req.header('x-forwarded-for');
      if (forwarded) {
        const client = rightmostUntrusted(forwarded.split(','), trusted);
        if (client) return client;
      }

      const realIp = c.req.header('x-real-ip')?.trim();
      if (realIp && isIP(realIp) !== 0) return realIp;
    }
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
 * Walk a forwarded chain from the right and return the first address that is
 * not a configured proxy — the client as observed by our own edge.
 *
 * `*` cannot know how many proxy hops exist, so it trusts exactly one: the
 * right-most entry is the address our single trusted proxy observed, and
 * everything to its left is unverified. Multi-hop deployments should list
 * their proxy addresses explicitly instead of using `*`.
 */
function rightmostUntrusted(entries: string[], trusted: string): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const candidate = entries[i]?.trim();
    if (!candidate || isIP(candidate) === 0) continue;
    if (trusted !== '*' && isTrusted(candidate, trusted)) continue;
    return candidate;
  }
  return null;
}

function getSocketAddress(c: Context): string | null {
  try {
    const address = getConnInfo(c).remote.address;
    return address ? normalizeIp(address) : null;
  } catch {
    return null;
  }
}

/**
 * Match an address against a comma-separated list of exact IPs and IPv4 CIDR
 * ranges. IPv4-mapped IPv6 forms are normalized first so `::ffff:10.0.0.1`
 * matches a `10.0.0.1` entry.
 */
function isTrusted(address: string, list: string): boolean {
  for (const entry of list
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)) {
    if (entry === address) return true;

    const slash = entry.indexOf('/');
    if (slash === -1) continue;

    const base = entry.slice(0, slash);
    const prefix = Number(entry.slice(slash + 1));
    if (isIP(base) !== 4 || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) continue;

    if (isIPv4InCidr(address, base, prefix)) return true;
  }
  return false;
}

function isIPv4InCidr(address: string, base: string, prefix: number): boolean {
  if (isIP(address) !== 4) return false;

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4ToLong(base) & mask) >>> 0 === (ipv4ToLong(address) & mask) >>> 0;
}

function ipv4ToLong(address: string): number {
  const parts = address.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/**
 * Collapse IPv4-mapped IPv6 addresses (`::ffff:203.0.113.4`) onto their IPv4
 * form so the same client cannot occupy two rate-limit buckets depending on
 * whether it connected over a dual-stack listener.
 */
function normalizeIp(address: string): string {
  return address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
}
