import type { Session, User } from 'lucia';
import type { Logger } from 'pino';

export type AppVariables = {
  requestId: string;
  log: Logger;
  userId: string | undefined;
  session: Session | undefined;
  user: User | undefined;
  validatedBody: unknown;
  validatedQuery: unknown;
  validatedParam: unknown;
};
