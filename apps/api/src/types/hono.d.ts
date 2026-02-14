import type { Logger } from 'pino';

export type AppVariables = {
  requestId: string;
  log: Logger;
  userId: string | undefined;
  validatedBody: unknown;
  validatedQuery: unknown;
  validatedParam: unknown;
};
