import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z.string().min(2, 'Query must be at least 2 characters').max(100, 'Query too long'),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
