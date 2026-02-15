import { Check } from 'lucide-react';
import { memo, useCallback, useState } from 'react';

import { CATEGORY_COLORS, hexColorPattern } from '@calley/shared';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export const ColorPicker = memo(function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [customInput, setCustomInput] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const handleCustomSubmit = useCallback(() => {
    const trimmed = customInput.trim();
    if (hexColorPattern.test(trimmed)) {
      onChange(trimmed);
      setShowCustom(false);
      setCustomInput('');
    }
  }, [customInput, onChange]);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-6 gap-1.5">
        {CATEGORY_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full border-2 transition-transform hover:scale-110',
              value === color ? 'border-[var(--foreground)]' : 'border-transparent',
            )}
            style={{ backgroundColor: color }}
            aria-label={`Select color ${color}`}
          >
            {value === color && <Check className="h-3.5 w-3.5 text-white" />}
          </button>
        ))}
      </div>

      {showCustom ? (
        <div className="flex items-center gap-2">
          <Input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="#000000"
            className="h-8 flex-1 font-mono text-xs"
            maxLength={7}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCustomSubmit();
              }
            }}
          />
          <button
            type="button"
            onClick={handleCustomSubmit}
            className="text-xs text-[var(--primary)] hover:underline"
          >
            Apply
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowCustom(true)}
          className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          Custom hex color...
        </button>
      )}
    </div>
  );
});
