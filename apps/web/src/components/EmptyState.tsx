import { Calendar, CheckSquare, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';

import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Reusable empty state component for views with no data.
 * Displays an icon, title, optional description, and optional CTA button.
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--muted)]">
          {icon}
        </div>
      )}
      <h3 className="mb-1 text-base font-semibold text-[var(--foreground)]">{title}</h3>
      {description && (
        <p className="mb-4 max-w-xs text-sm text-[var(--muted-foreground)]">{description}</p>
      )}
      {action && (
        <Button variant="outline" onClick={action.onClick} className="mt-2">
          {action.label}
        </Button>
      )}
    </div>
  );
}

/** Empty state when there are no events for the visible period */
export function NoEventsEmptyState({ onCreateEvent }: { onCreateEvent: () => void }) {
  return (
    <EmptyState
      icon={<Calendar className="h-7 w-7 text-[var(--muted-foreground)]" />}
      title="No events"
      description="Your calendar is clear. Create an event to get started."
      action={{ label: 'Create your first event', onClick: onCreateEvent }}
    />
  );
}

/** Empty state when there are no tasks */
export function NoTasksEmptyState({ onCreateTask }: { onCreateTask: () => void }) {
  return (
    <EmptyState
      icon={<CheckSquare className="h-7 w-7 text-[var(--muted-foreground)]" />}
      title="No tasks"
      description="Stay organized by adding your first task."
      action={{ label: 'Add a task', onClick: onCreateTask }}
    />
  );
}

/** Empty state for search with no results */
export function NoSearchResultsEmptyState({ query }: { query: string }) {
  return (
    <EmptyState
      icon={<Search className="h-7 w-7 text-[var(--muted-foreground)]" />}
      title={`No results for "${query}"`}
      description="Try a different search term or check your spelling."
    />
  );
}
