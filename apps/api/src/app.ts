import { Hono } from 'hono';

import { loginSchema } from '@calley/shared';

export const app = new Hono();

app.get('/', (c) => {
  // Quick schema verification — confirms @calley/shared imports work
  const schemaKeys = Object.keys(loginSchema.shape);
  return c.json({ message: 'Calley API is running', schemaFields: schemaKeys.length });
});

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});
