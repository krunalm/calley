import { and, eq } from 'drizzle-orm';
import webpush from 'web-push';

import { db } from '../db';
import { userPushSubscriptions } from '../db/schema';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

import type { CreatePushSubscriptionInput } from '@calley/shared';

// ─── VAPID Configuration ────────────────────────────────────────────

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:noreply@calley.app';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  logger.info('VAPID keys configured for Web Push');
} else {
  logger.warn('VAPID keys not configured — Web Push notifications will be disabled');
}

// ─── Types ──────────────────────────────────────────────────────────

interface PushSubscriptionRow {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: Date;
}

interface PushSubscriptionResponse {
  id: string;
  userId: string;
  endpoint: string;
  userAgent: string | null;
  createdAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function toResponse(row: PushSubscriptionRow): PushSubscriptionResponse {
  return {
    id: row.id,
    userId: row.userId,
    endpoint: row.endpoint,
    userAgent: row.userAgent,
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── Service ────────────────────────────────────────────────────────

export class PushSubscriptionService {
  /**
   * Register a new push subscription for a user.
   * If a subscription with the same endpoint already exists, update it.
   */
  async subscribe(
    userId: string,
    data: CreatePushSubscriptionInput,
  ): Promise<PushSubscriptionResponse> {
    // Check if endpoint already exists for this user
    const existing = await db.query.userPushSubscriptions.findFirst({
      where: and(
        eq(userPushSubscriptions.userId, userId),
        eq(userPushSubscriptions.endpoint, data.endpoint),
      ),
    });

    if (existing) {
      // Update the keys (they may have been rotated)
      const [updated] = await db
        .update(userPushSubscriptions)
        .set({
          p256dh: data.p256dh,
          auth: data.auth,
          userAgent: data.userAgent ?? null,
        })
        .where(eq(userPushSubscriptions.id, existing.id))
        .returning();

      logger.info({ userId, subscriptionId: updated.id }, 'Push subscription updated');
      return toResponse(updated as PushSubscriptionRow);
    }

    const [created] = await db
      .insert(userPushSubscriptions)
      .values({
        userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        userAgent: data.userAgent ?? null,
      })
      .returning();

    logger.info({ userId, subscriptionId: created.id }, 'Push subscription created');
    return toResponse(created as PushSubscriptionRow);
  }

  /**
   * Remove a push subscription by ID with ownership check.
   */
  async unsubscribe(userId: string, subscriptionId: string): Promise<void> {
    const subscription = await db.query.userPushSubscriptions.findFirst({
      where: and(
        eq(userPushSubscriptions.id, subscriptionId),
        eq(userPushSubscriptions.userId, userId),
      ),
    });

    if (!subscription) {
      throw new AppError(404, 'NOT_FOUND', 'Push subscription not found');
    }

    await db
      .delete(userPushSubscriptions)
      .where(
        and(eq(userPushSubscriptions.id, subscriptionId), eq(userPushSubscriptions.userId, userId)),
      );

    logger.info({ userId, subscriptionId }, 'Push subscription deleted');
  }

  /**
   * List all push subscriptions for a user.
   */
  async listSubscriptions(userId: string): Promise<PushSubscriptionResponse[]> {
    const rows = await db.query.userPushSubscriptions.findMany({
      where: eq(userPushSubscriptions.userId, userId),
      orderBy: (s, { desc }) => [desc(s.createdAt)],
    });

    return rows.map((r) => toResponse(r as PushSubscriptionRow));
  }

  /**
   * Send a push notification to all subscriptions for a user.
   * Removes expired/invalid subscriptions automatically.
   */
  async sendPushToUser(
    userId: string,
    payload: { title: string; body: string; icon?: string; url?: string },
  ): Promise<void> {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      logger.debug({ userId }, 'Web Push disabled — VAPID keys not configured');
      return;
    }

    const subscriptions = await db.query.userPushSubscriptions.findMany({
      where: eq(userPushSubscriptions.userId, userId),
    });

    if (subscriptions.length === 0) return;

    const payloadStr = JSON.stringify(payload);
    const expired: string[] = [];

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            payloadStr,
          );
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            // Subscription expired or unsubscribed — mark for removal
            expired.push(sub.id);
            logger.info({ subscriptionId: sub.id }, 'Push subscription expired, removing');
          } else {
            logger.warn({ err, subscriptionId: sub.id }, 'Failed to send push notification');
          }
        }
      }),
    );

    // Clean up expired subscriptions
    if (expired.length > 0) {
      for (const id of expired) {
        await db
          .delete(userPushSubscriptions)
          .where(eq(userPushSubscriptions.id, id))
          .catch(() => {});
      }
    }
  }

  /**
   * Get the public VAPID key for the frontend to use when subscribing.
   */
  getVapidPublicKey(): string {
    return VAPID_PUBLIC_KEY;
  }
}

export const pushSubscriptionService = new PushSubscriptionService();
