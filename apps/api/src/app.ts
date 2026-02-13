import { greetingSchema } from '@calley/shared';
import { Hono } from 'hono';

export const app = new Hono();

app.get('/', (c) => {
  const result = greetingSchema.safeParse({ message: 'Calley API is running' });
  return c.json({ message: result.success ? result.data.message : 'Error' });
});

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});
