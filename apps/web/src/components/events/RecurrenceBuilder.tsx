import { format, parseISO, set as setDateFields } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { useCallback, useMemo, useState } from 'react';
import { RRule, Weekday } from 'rrule';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUserTimezone } from '@/hooks/use-user-timezone';

// ─── Types ─────────────────────────────────────────────────────────

type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
type EndType = 'never' | 'count' | 'until';
type MonthlyMode = 'dayOfMonth' | 'nthWeekday';

interface RecurrenceState {
  frequency: Frequency;
  interval: number;
  weekdays: number[]; // 0=Mon..6=Sun (rrule.js weekday order)
  monthlyMode: MonthlyMode;
  endType: EndType;
  count: number;
  until: string; // YYYY-MM-DD
}

interface RecurrenceBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRrule?: string | null;
  startDate?: string; // YYYY-MM-DD — used for monthly "Nth weekday" and preview
  onSave: (rrule: string) => void;
}

// ─── Constants ─────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const FREQUENCY_LABELS: Record<Frequency, string> = {
  DAILY: 'day',
  WEEKLY: 'week',
  MONTHLY: 'month',
  YEARLY: 'year',
};

const FREQUENCY_LABELS_PLURAL: Record<Frequency, string> = {
  DAILY: 'days',
  WEEKLY: 'weeks',
  MONTHLY: 'months',
  YEARLY: 'years',
};

const ORDINAL_LABELS = ['first', 'second', 'third', 'fourth', 'last'];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─── Helpers ───────────────────────────────────────────────────────

function parseExistingRrule(rruleStr: string): Partial<RecurrenceState> {
  try {
    const rule = RRule.fromString(`RRULE:${rruleStr}`);
    const options = rule.origOptions;

    const freqMap: Record<number, Frequency> = {
      [RRule.DAILY]: 'DAILY',
      [RRule.WEEKLY]: 'WEEKLY',
      [RRule.MONTHLY]: 'MONTHLY',
      [RRule.YEARLY]: 'YEARLY',
    };

    const result: Partial<RecurrenceState> = {
      frequency: freqMap[options.freq ?? RRule.WEEKLY] ?? 'WEEKLY',
      interval: options.interval ?? 1,
    };

    // Parse weekdays for weekly
    if (options.byweekday) {
      const bywd = Array.isArray(options.byweekday) ? options.byweekday : [options.byweekday];
      result.weekdays = bywd.map((wd) => {
        if (typeof wd === 'number') return wd;
        if (wd instanceof Weekday) return wd.weekday;
        // WeekdayStr like 'MO', 'TU', etc.
        const strMap: Record<string, number> = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };
        return strMap[wd] ?? 0;
      });
    }

    // Parse monthly mode
    if (result.frequency === 'MONTHLY' && options.byweekday) {
      const bywd = Array.isArray(options.byweekday) ? options.byweekday : [options.byweekday];
      const first = bywd[0];
      if (first instanceof Weekday && first.n) {
        result.monthlyMode = 'nthWeekday';
      }
    }

    // Parse end condition
    if (options.count) {
      result.endType = 'count';
      result.count = options.count;
    } else if (options.until) {
      result.endType = 'until';
      result.until = format(options.until, 'yyyy-MM-dd');
    } else {
      result.endType = 'never';
    }

    return result;
  } catch {
    return {};
  }
}

function getNthWeekdayInfo(dateStr: string): { n: number; weekday: number } {
  const date = parseISO(dateStr);
  const dayOfMonth = date.getDate();
  const weekday = date.getDay(); // 0=Sun..6=Sat
  const n = Math.ceil(dayOfMonth / 7);

  // Check if this is the last occurrence of this weekday in the month.
  // If dayOfMonth + 7 exceeds the number of days in the month, it's the last.
  const year = date.getFullYear();
  const month = date.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const isLast = dayOfMonth + 7 > daysInMonth;

  // Use -1 for "last" per iCalendar BYDAY semantics (e.g. -1MO = last Monday)
  return { n: isLast && n >= 4 ? -1 : n, weekday };
}

function getOrdinalLabel(n: number): string {
  if (n === -1) return 'last';
  if (n <= 0 || n > 5) return `${n}th`;
  return ORDINAL_LABELS[n - 1];
}

// ─── Component ─────────────────────────────────────────────────────

export function RecurrenceBuilderModal({
  open,
  onOpenChange,
  initialRrule,
  startDate,
  onSave,
}: RecurrenceBuilderProps) {
  const userTimezone = useUserTimezone();

  const [state, setState] = useState<RecurrenceState>(() => ({
    frequency: 'WEEKLY',
    interval: 1,
    weekdays: [],
    monthlyMode: 'dayOfMonth',
    endType: 'never',
    count: 10,
    until: '',
  }));
  const [validationError, setValidationError] = useState<string | null>(null);

  // Re-key to force reinitialization on each open
  const [openKey, setOpenKey] = useState(0);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        // Initialize state when opening
        const defaults: RecurrenceState = {
          frequency: 'WEEKLY',
          interval: 1,
          weekdays: [],
          monthlyMode: 'dayOfMonth',
          endType: 'never',
          count: 10,
          until: '',
        };

        if (initialRrule) {
          const parsed = parseExistingRrule(initialRrule);
          setState({ ...defaults, ...parsed });
        } else {
          if (startDate) {
            const date = parseISO(startDate);
            const jsDay = date.getDay();
            const rruleDay = jsDay === 0 ? 6 : jsDay - 1;
            defaults.weekdays = [rruleDay];
          }
          setState(defaults);
        }
        setValidationError(null);
        setOpenKey((k) => k + 1);
      }
      onOpenChange(nextOpen);
    },
    [initialRrule, startDate, onOpenChange],
  );

  // ─── State updaters ──────────────────────────────────────────────

  const updateField = useCallback(
    <K extends keyof RecurrenceState>(key: K, value: RecurrenceState[K]) => {
      setState((prev) => ({ ...prev, [key]: value }));
      setValidationError(null);
    },
    [],
  );

  const toggleWeekday = useCallback((day: number) => {
    setState((prev) => {
      const weekdays = prev.weekdays.includes(day)
        ? prev.weekdays.filter((d) => d !== day)
        : [...prev.weekdays, day];
      return { ...prev, weekdays };
    });
    setValidationError(null);
  }, []);

  // ─── Build RRULE ─────────────────────────────────────────────────

  const buildRrule = useCallback((): string | null => {
    const parts: string[] = [];

    // Frequency
    parts.push(`FREQ=${state.frequency}`);

    // Interval
    if (state.interval > 1) {
      parts.push(`INTERVAL=${state.interval}`);
    }

    // Weekly: BYDAY
    if (state.frequency === 'WEEKLY' && state.weekdays.length > 0) {
      const dayMap = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
      const sorted = [...state.weekdays].sort();
      parts.push(`BYDAY=${sorted.map((d) => dayMap[d]).join(',')}`);
    }

    // Monthly
    if (state.frequency === 'MONTHLY' && state.monthlyMode === 'nthWeekday' && startDate) {
      const { n, weekday } = getNthWeekdayInfo(startDate);
      const dayMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
      parts.push(`BYDAY=${n}${dayMap[weekday]}`);
    }

    // End condition
    if (state.endType === 'count') {
      parts.push(`COUNT=${state.count}`);
    } else if (state.endType === 'until' && state.until) {
      // Convert end-of-day in user's timezone to true UTC
      const localEndOfDay = setDateFields(parseISO(state.until), {
        hours: 23,
        minutes: 59,
        seconds: 59,
      });
      const utcEndOfDay = fromZonedTime(localEndOfDay, userTimezone);
      const untilStr = formatInTimeZone(utcEndOfDay, 'UTC', "yyyyMMdd'T'HHmmss'Z'");
      parts.push(`UNTIL=${untilStr}`);
    }

    return parts.join(';');
  }, [state, startDate, userTimezone]);

  // ─── Preview (next 5 occurrences) ────────────────────────────────

  const previewDates = useMemo(() => {
    const rruleStr = buildRrule();
    if (!rruleStr || !startDate) return [];

    try {
      const dtstart = parseISO(startDate);
      const utcStart = fromZonedTime(dtstart, userTimezone);
      const dtstartStr = formatInTimeZone(utcStart, 'UTC', "yyyyMMdd'T'HHmmss'Z'");
      const rule = RRule.fromString(`DTSTART:${dtstartStr}\nRRULE:${rruleStr}`);
      const dates = rule.all((_, i) => i < 5);
      return dates.map((d) => format(d, 'EEE, MMM d, yyyy'));
    } catch {
      return [];
    }
  }, [buildRrule, startDate, userTimezone]);

  // ─── Validation & Submit ─────────────────────────────────────────

  const handleSave = useCallback(() => {
    // Validate weekly: at least one day
    if (state.frequency === 'WEEKLY' && state.weekdays.length === 0) {
      setValidationError('Select at least one day of the week');
      return;
    }

    // Validate end date
    if (state.endType === 'until') {
      if (!state.until) {
        setValidationError('End date is required');
        return;
      }
      if (startDate && state.until <= startDate) {
        setValidationError('End date must be after the start date');
        return;
      }
    }

    // Validate count
    if (state.endType === 'count' && (state.count < 1 || state.count > 999)) {
      setValidationError('Occurrences must be between 1 and 999');
      return;
    }

    // Validate interval
    if (state.interval < 1 || state.interval > 99) {
      setValidationError('Interval must be between 1 and 99');
      return;
    }

    const rrule = buildRrule();
    if (rrule) {
      onSave(rrule);
      onOpenChange(false);
    }
  }, [state, startDate, buildRrule, onSave, onOpenChange]);

  // ─── Monthly info based on start date ────────────────────────────

  const monthlyInfo = useMemo(() => {
    if (!startDate) return null;
    const date = parseISO(startDate);
    const dayOfMonth = date.getDate();
    const { n, weekday } = getNthWeekdayInfo(startDate);
    return {
      dayOfMonth,
      ordinal: getOrdinalLabel(n),
      dayName: DAY_NAMES[weekday],
    };
  }, [startDate]);

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent key={openKey} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Custom Recurrence</DialogTitle>
          <DialogDescription>Configure how often this event repeats.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Frequency + Interval */}
          <div className="space-y-1.5">
            <Label>Repeat every</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={99}
                value={state.interval}
                onChange={(e) =>
                  updateField('interval', Math.max(1, Math.min(99, Number(e.target.value) || 1)))
                }
                className="w-20"
                aria-label="Interval"
              />
              <Select
                value={state.frequency}
                onValueChange={(v) => updateField('frequency', v as Frequency)}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DAILY">
                    {state.interval > 1 ? FREQUENCY_LABELS_PLURAL.DAILY : FREQUENCY_LABELS.DAILY}
                  </SelectItem>
                  <SelectItem value="WEEKLY">
                    {state.interval > 1 ? FREQUENCY_LABELS_PLURAL.WEEKLY : FREQUENCY_LABELS.WEEKLY}
                  </SelectItem>
                  <SelectItem value="MONTHLY">
                    {state.interval > 1
                      ? FREQUENCY_LABELS_PLURAL.MONTHLY
                      : FREQUENCY_LABELS.MONTHLY}
                  </SelectItem>
                  <SelectItem value="YEARLY">
                    {state.interval > 1 ? FREQUENCY_LABELS_PLURAL.YEARLY : FREQUENCY_LABELS.YEARLY}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Weekly: Day-of-week checkboxes */}
          {state.frequency === 'WEEKLY' && (
            <div className="space-y-1.5">
              <Label>Repeat on</Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_LABELS.map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleWeekday(index)}
                    className={`flex h-9 w-11 items-center justify-center rounded-[var(--radius)] border text-xs font-medium transition-colors ${
                      state.weekdays.includes(index)
                        ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]'
                        : 'border-[var(--input)] bg-[var(--background)] hover:bg-[var(--accent-ui)]'
                    }`}
                    aria-label={label}
                    aria-pressed={state.weekdays.includes(index)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Monthly: day-of-month vs Nth weekday */}
          {state.frequency === 'MONTHLY' && monthlyInfo && (
            <div className="space-y-2">
              <Label>Repeat on</Label>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={state.monthlyMode === 'dayOfMonth'}
                    onCheckedChange={() => updateField('monthlyMode', 'dayOfMonth')}
                  />
                  <span className="text-sm">Day {monthlyInfo.dayOfMonth} of the month</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={state.monthlyMode === 'nthWeekday'}
                    onCheckedChange={() => updateField('monthlyMode', 'nthWeekday')}
                  />
                  <span className="text-sm">
                    The {monthlyInfo.ordinal} {monthlyInfo.dayName}
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* End condition */}
          <div className="space-y-2">
            <Label>Ends</Label>
            <div className="space-y-2.5">
              {/* Never */}
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={state.endType === 'never'}
                  onCheckedChange={() => updateField('endType', 'never')}
                />
                <span className="text-sm">Never</span>
              </label>

              {/* After N occurrences */}
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={state.endType === 'count'}
                  onCheckedChange={() => updateField('endType', 'count')}
                />
                <span className="text-sm">After</span>
                <Input
                  type="number"
                  min={1}
                  max={999}
                  value={state.endType === 'count' ? state.count : ''}
                  onChange={(e) => {
                    updateField('endType', 'count');
                    updateField('count', Math.max(1, Math.min(999, Number(e.target.value) || 1)));
                  }}
                  className="w-20"
                  aria-label="Number of occurrences"
                  disabled={state.endType !== 'count'}
                />
                <span className="text-sm">occurrences</span>
              </div>

              {/* On date */}
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={state.endType === 'until'}
                  onCheckedChange={() => updateField('endType', 'until')}
                />
                <span className="text-sm">On</span>
                <Input
                  type="date"
                  value={state.endType === 'until' ? state.until : ''}
                  onChange={(e) => {
                    updateField('endType', 'until');
                    updateField('until', e.target.value);
                  }}
                  className="w-40"
                  aria-label="End date"
                  disabled={state.endType !== 'until'}
                  min={startDate ?? undefined}
                />
              </div>
            </div>
          </div>

          {/* Preview */}
          {previewDates.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-[var(--muted-foreground)]">Next occurrences</Label>
              <ul className="space-y-0.5 text-xs text-[var(--muted-foreground)]">
                {previewDates.map((d, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Validation error */}
          {validationError && (
            <p className="text-xs text-[var(--destructive)]" role="alert">
              {validationError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
