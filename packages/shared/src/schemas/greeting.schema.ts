import { z } from 'zod';

// Placeholder schema for verifying cross-package imports.
// Will be replaced with real schemas (event, task, auth, etc.) in Phase 1.
export const greetingSchema = z.object({
  message: z.string().min(1).max(200),
});

export type Greeting = z.infer<typeof greetingSchema>;
