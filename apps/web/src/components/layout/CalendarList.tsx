import { Eye, EyeOff, Plus } from 'lucide-react';
import { memo, useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import type { CalendarCategory } from '@calley/shared';

interface CalendarListProps {
  categories: CalendarCategory[];
  onToggleVisibility?: (categoryId: string, visible: boolean) => void;
  onAddCategory?: () => void;
}

export const CalendarList = memo(function CalendarList({
  categories,
  onToggleVisibility,
  onAddCategory,
}: CalendarListProps) {
  // Local visibility overrides (client-side only per spec)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const toggleVisibility = useCallback(
    (categoryId: string) => {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        const willBeHidden = !next.has(categoryId);
        if (willBeHidden) {
          next.add(categoryId);
        } else {
          next.delete(categoryId);
        }
        onToggleVisibility?.(categoryId, !willBeHidden);
        return next;
      });
    },
    [onToggleVisibility],
  );

  return (
    <div className="px-2 py-2">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          Calendars
        </span>
        {onAddCategory && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={onAddCategory}
            aria-label="Add calendar"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <ul className="space-y-0.5">
        {categories.map((cat) => {
          const isHidden = hiddenIds.has(cat.id);
          return (
            <li key={cat.id}>
              <button
                className={cn(
                  'group flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-left text-sm transition-colors hover:bg-[var(--accent-ui)]',
                  isHidden && 'opacity-50',
                )}
                onClick={() => toggleVisibility(cat.id)}
                aria-label={`${isHidden ? 'Show' : 'Hide'} ${cat.name} calendar`}
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-sm"
                  style={{ backgroundColor: cat.color }}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate">{cat.name}</span>
                <span className="opacity-0 transition-opacity group-hover:opacity-100">
                  {isHidden ? (
                    <EyeOff className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                  ) : (
                    <Eye className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
});
