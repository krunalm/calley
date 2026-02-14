import { useMemo } from 'react';
import zxcvbn from 'zxcvbn';

import { cn } from '@/lib/utils';

interface PasswordStrengthMeterProps {
  password: string;
}

const strengthLabels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
const strengthColors = [
  'bg-[var(--color-danger)]',
  'bg-[var(--color-danger)]',
  'bg-[var(--color-warning)]',
  'bg-[var(--color-success)]',
  'bg-[var(--color-success)]',
];

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const result = useMemo(() => (password ? zxcvbn(password) : null), [password]);

  if (!password) return null;

  const score = result?.score ?? 0;

  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              i <= score ? strengthColors[score] : 'bg-[var(--muted)]',
            )}
          />
        ))}
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">{strengthLabels[score]}</p>
    </div>
  );
}
