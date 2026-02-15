import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import type { EditScope } from '@calley/shared';

interface RecurrenceScopeDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (scope: EditScope) => void;
  action: 'edit' | 'delete';
}

const SCOPE_OPTIONS: { value: EditScope; label: string; description: string }[] = [
  {
    value: 'instance',
    label: 'This event',
    description: 'Only this occurrence will be affected',
  },
  {
    value: 'following',
    label: 'This and following events',
    description: 'This and all future occurrences will be affected',
  },
  {
    value: 'all',
    label: 'All events',
    description: 'Every occurrence in the series will be affected',
  },
];

/**
 * Inner content that mounts fresh each time the dialog opens,
 * ensuring selected scope always resets to 'instance'.
 */
function ScopeDialogBody({ onClose, onConfirm, action }: Omit<RecurrenceScopeDialogProps, 'open'>) {
  const [selected, setSelected] = useState<EditScope>('instance');

  const handleConfirm = () => {
    onConfirm(selected);
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>
          {action === 'edit' ? 'Edit recurring event' : 'Delete recurring event'}
        </DialogTitle>
        <DialogDescription>
          This is a recurring event. Which events do you want to {action}?
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2 py-2">
        {SCOPE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-start gap-3 rounded-[var(--radius)] border border-[var(--border)] p-3 transition-colors hover:bg-[var(--accent-ui)] has-[:checked]:border-[var(--primary)] has-[:checked]:bg-[color-mix(in_srgb,var(--primary)_5%,transparent)]"
          >
            <input
              type="radio"
              name="recurrence-scope"
              value={option.value}
              checked={selected === option.value}
              onChange={() => setSelected(option.value)}
              className="mt-0.5 accent-[var(--primary)]"
            />
            <div>
              <div className="text-sm font-medium">{option.label}</div>
              <div className="text-xs text-[var(--muted-foreground)]">{option.description}</div>
            </div>
          </label>
        ))}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button variant={action === 'delete' ? 'destructive' : 'default'} onClick={handleConfirm}>
          {action === 'edit' ? 'Save' : 'Delete'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function RecurrenceScopeDialog({
  open,
  onClose,
  onConfirm,
  action,
}: RecurrenceScopeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      {open && <ScopeDialogBody onClose={onClose} onConfirm={onConfirm} action={action} />}
    </Dialog>
  );
}
