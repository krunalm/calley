import { memo } from 'react';

interface MoreIndicatorProps {
  count: number;
  onClick?: () => void;
}

export const MoreIndicator = memo(function MoreIndicator({ count, onClick }: MoreIndicatorProps) {
  if (count <= 0) return null;

  return (
    <button
      className="w-full rounded-[var(--radius-sm)] px-1.5 py-0.5 text-left text-[11px] font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent-ui)] hover:text-[var(--foreground)]"
      onClick={onClick}
      aria-label={`${count} more item${count === 1 ? '' : 's'}`}
    >
      +{count} more
    </button>
  );
});
