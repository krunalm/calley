import { Hono } from 'hono';

import { createPushSubscriptionSchema, pushSubscriptionIdParamSchema } from '@calley/shared';

import { authMiddleware } from '../middleware/auth.middleware';
import { doubleSubmitCsrf } from '../middleware/csrf.middleware';
import { rateLimit } from '../middleware/rate-limit.middleware';
import { validate } from '../middleware/validate.middleware';
import { pushSubscriptionService } from '../services/push-subscription.service';

import type { AppVariables } from '../types/hono';

const pushSubscriptions = new Hono<{ Variables: AppVariables }>();

// All routes require authentication
pushSubscriptions.use('/*', authMiddleware);

// Rate limit: 20 requests per minute per user
pushSubscriptions.use(
  '/*',
  rateLimit({
    limit: 20,
    windowSeconds: 60,
    keyPrefix: 'push-subs',
  }),
);

/**
 * GET /push-subscriptions/vapid-key
 * Returns the VAPID public key for the frontend to use when subscribing.
 */
pushSubscriptions.get('/vapid-key', (c) => {
  const key = pushSubscriptionService.getVapidPublicKey();
  return c.json({ vapidPublicKey: key });
});

/**
 * GET /push-subscriptions
 * List all push subscriptions for the authenticated user.
 */
pushSubscriptions.get('/', async (c) => {
  const userId = c.get('userId')!;
  const subscriptions = await pushSubscriptionService.listSubscriptions(userId);
  return c.json(subscriptions);
});

/**
 * POST /push-subscriptions
 * Register a new push subscription for the authenticated user.
 */
pushSubscriptions.post(
  '/',
  doubleSubmitCsrf,
  validate('json', createPushSubscriptionSchema),
  async (c) => {
    const userId = c.get('userId')!;
    const data = c.get('validatedBody') as {
      endpoint: string;
      p256dh: string;
      auth: string;
      userAgent?: string;
    };
    const subscription = await pushSubscriptionService.subscribe(userId, data);
    return c.json(subscription, 201);
  },
);

/**
 * DELETE /push-subscriptions/:id
 * Remove a push subscription by ID.
 */
pushSubscriptions.delete(
  '/:id',
  doubleSubmitCsrf,
  validate('param', pushSubscriptionIdParamSchema),
  async (c) => {
    const userId = c.get('userId')!;
    const { id } = c.get('validatedParam') as { id: string };
    await pushSubscriptionService.unsubscribe(userId, id);
    return c.body(null, 204);
  },
);

export default pushSubscriptions;
