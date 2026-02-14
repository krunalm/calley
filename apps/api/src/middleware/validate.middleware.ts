import type { AppVariables } from '../types/hono';
import type { MiddlewareHandler } from 'hono';
import type { ZodSchema } from 'zod';

type ValidationTarget = 'json' | 'query' | 'param';

const targetToVariable: Record<ValidationTarget, keyof AppVariables> = {
  json: 'validatedBody',
  query: 'validatedQuery',
  param: 'validatedParam',
};

export function validate(
  target: ValidationTarget,
  schema: ZodSchema,
): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (c, next) => {
    let data: unknown;

    switch (target) {
      case 'json':
        try {
          data = await c.req.json();
        } catch {
          return c.json(
            {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid JSON',
                details: [{ path: [], message: 'Request body must be valid JSON' }],
              },
            },
            400,
          );
        }
        break;
      case 'query':
        data = c.req.query();
        break;
      case 'param':
        data = c.req.param();
        break;
    }

    const result = schema.safeParse(data);

    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: result.error.issues.map((issue) => ({
              path: issue.path,
              message: issue.message,
            })),
          },
        },
        400,
      );
    }

    c.set(targetToVariable[target], result.data);
    await next();
  };
}
