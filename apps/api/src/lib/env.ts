import { logger } from './logger';

/**
 * Required environment variables for production.
 * These must be set before the API can start safely.
 */
const REQUIRED_VARS = [
  'DATABASE_URL',
  'REDIS_URL',
  'SESSION_SECRET',
  'CORS_ORIGIN',
  'COOKIE_DOMAIN',
] as const;

/**
 * Optional but recommended variables for production.
 * A warning is logged if these are missing.
 */
const RECOMMENDED_VARS = [
  'RESEND_API_KEY',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GITHUB_REDIRECT_URI',
] as const;

/**
 * Validates that all required environment variables are set in production.
 * In development, only warns about missing variables.
 * Returns true if validation passes, false otherwise.
 */
export function validateEnv(): boolean {
  const isProduction = process.env.NODE_ENV === 'production';
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const key of REQUIRED_VARS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  for (const key of RECOMMENDED_VARS) {
    if (!process.env[key]) {
      warnings.push(key);
    }
  }

  // Validate SESSION_SECRET strength
  const sessionSecret = process.env.SESSION_SECRET;
  if (sessionSecret && sessionSecret.length < 32) {
    if (isProduction) {
      missing.push('SESSION_SECRET (must be >= 32 characters)');
    } else {
      warnings.push('SESSION_SECRET is shorter than 32 characters');
    }
  }

  // Validate CORS_ORIGIN is not a wildcard in production
  if (isProduction && process.env.CORS_ORIGIN === '*') {
    missing.push('CORS_ORIGIN (must not be wildcard * in production)');
  }

  // Log warnings for recommended variables
  if (warnings.length > 0) {
    logger.warn(
      { variables: warnings },
      `Missing recommended environment variables — some features will be disabled`,
    );
  }

  // Log errors for required variables
  if (missing.length > 0) {
    logger.error(
      { variables: missing },
      `Missing required environment variables`,
    );

    if (isProduction) {
      logger.fatal('Cannot start in production with missing required environment variables');
      return false;
    }

    logger.warn('Continuing in development mode with missing variables');
  }

  return true;
}
