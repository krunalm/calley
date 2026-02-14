import { createHash } from 'node:crypto';

import { db } from '../db';
import { auditLogs } from '../db/schema';
import { logger } from '../lib/logger';

// ─── Types ──────────────────────────────────────────────────────────

interface AuditLogEntry {
  action: string;
  userId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Hash an IP address with SHA-256 before storage.
 * Returns the first 16 hex characters for a privacy-preserving fingerprint.
 */
function hashIpAddress(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

/**
 * Strip any PII from metadata before storing in audit log.
 * Removes known PII fields to ensure compliance with spec §1.9.
 */
function sanitizeMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!metadata) return null;

  const piiFields = new Set([
    'password',
    'passwordHash',
    'currentPassword',
    'newPassword',
    'token',
    'tokenHash',
    'email',
    'name',
    'avatarUrl',
    'secret',
    'sessionId',
  ]);

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!piiFields.has(key)) {
      sanitized[key] = value;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

// ─── Service ────────────────────────────────────────────────────────

export class AuditService {
  /**
   * Log an audit event.
   *
   * This is intentionally fire-and-forget: audit logging should never
   * block or fail the primary operation. Errors are logged but swallowed.
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await db.insert(auditLogs).values({
        action: entry.action,
        userId: entry.userId ?? null,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        metadata: sanitizeMetadata(entry.metadata),
        ipAddress: entry.ipAddress ? hashIpAddress(entry.ipAddress) : null,
        userAgent: entry.userAgent ?? null,
      });
    } catch (err) {
      // Audit logging must never break the main flow
      logger.error({ err, action: entry.action }, 'Failed to write audit log');
    }
  }
}

export const auditService = new AuditService();
