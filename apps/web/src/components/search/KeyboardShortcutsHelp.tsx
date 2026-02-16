import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface KeyboardShortcutsHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShortcutEntry {
  keys: string[];
  description: string;
}

const SHORTCUT_GROUPS: { title: string; shortcuts: ShortcutEntry[] }[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['←'], description: 'Previous period' },
      { keys: ['→'], description: 'Next period' },
      { keys: ['.', 'Home'], description: 'Go to today' },
    ],
  },
  {
    title: 'Views',
    shortcuts: [
      { keys: ['M'], description: 'Month view' },
      { keys: ['W'], description: 'Week view' },
      { keys: ['D'], description: 'Day view' },
      { keys: ['A'], description: 'Agenda view' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Open search' },
      { keys: ['C'], description: 'Create new event' },
      { keys: ['T'], description: 'Toggle task panel' },
      { keys: ['Esc'], description: 'Close modal / drawer' },
      { keys: ['⇧', 'Enter'], description: 'Pick up focused event (keyboard move)' },
    ],
  },
  {
    title: 'Help',
    shortcuts: [{ keys: ['?'], description: 'Show this help' }],
  },
];

function ShortcutKey({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 font-mono text-xs text-[var(--text-muted)]">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsHelp({ open, onOpenChange }: KeyboardShortcutsHelpProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Navigate and interact with Calley using keyboard shortcuts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <span key={key} className="flex items-center gap-1">
                          {i > 0 && (
                            <span className="text-xs text-[var(--muted-foreground)]">+</span>
                          )}
                          <ShortcutKey>{key}</ShortcutKey>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
