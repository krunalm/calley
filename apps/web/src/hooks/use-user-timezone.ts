import { useCurrentUser } from '@/hooks/use-auth';

/**
 * Returns the authenticated user's timezone from their profile,
 * falling back to the browser's detected timezone.
 */
export function useUserTimezone(): string {
  const { data: user } = useCurrentUser();
  return user?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}
