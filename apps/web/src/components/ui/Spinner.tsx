import { cn } from '@/lib/utils';

interface SpinnerProps {
  className?: string;
  /** Size in tailwind units. Defaults to 'sm' (h-4 w-4). */
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
} as const;

/**
 * Inline loading spinner for buttons and small UI elements.
 * Used to indicate a mutation or async operation is in progress.
 */
export function Spinner({ className, size = 'sm' }: SpinnerProps) {
  return (
    <svg
      className={cn('animate-spin', SIZES[size], className)}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Loading"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
