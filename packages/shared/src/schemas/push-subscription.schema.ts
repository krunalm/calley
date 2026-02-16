import { z } from 'zod';

import { cuid2Schema } from './common.schema';

// ─── Create Push Subscription ──────────────────────────────────────

export const createPushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  p256dh: z.string().min(1).max(512),
  auth: z.string().min(1).max(512),
  userAgent: z.string().max(500).optional(),
});

export type CreatePushSubscriptionInput = z.infer<typeof createPushSubscriptionSchema>;

// ─── Push Subscription ID Param ────────────────────────────────────

export const pushSubscriptionIdParamSchema = z.object({
  id: cuid2Schema,
});
