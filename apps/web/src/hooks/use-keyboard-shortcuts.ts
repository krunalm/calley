import { useEffect } from 'react';

import { announce } from '@/components/ui/aria-live-region';
import { isTypingInInput } from '@/lib/keyboard-utils';
import { useCalendarStore } from '@/stores/calendar-store';
import { useUIStore } from '@/stores/ui-store';

import type { CalendarView } from '@/stores/calendar-store';

export interface KeyboardShortcutsState {
  shortcutsHelpOpen: boolean;
}

/**
 * Global keyboard shortcuts hook.
 *
 * Attaches a keydown listener on mount and cleans up on unmount.
 * Shortcuts are disabled when the user is focused in a text input.
 *
 * Shortcuts:
 * - Cmd/Ctrl+K → toggle search
 * - C → quick create event on current date
 * - T → toggle task panel
 * - M → month view
 * - W → week view
 * - D → day view
 * - A → agenda view
 * - ← / → → navigate prev/next
 * - . or Home → go to today
 * - Escape → close any open modal/drawer/popover
 * - ? → show keyboard shortcuts help
 */
export function useKeyboardShortcuts(onToggleShortcutsHelp: () => void) {
  const { setView, navigate, toggleTaskPanel } = useCalendarStore();
  const { toggleSearch, openEventDrawer, closeAll, searchOpen } = useUIStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMeta = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl+K → search (always active, even when typing)
      if (isMeta && e.key === 'k') {
        e.preventDefault();
        toggleSearch();
        return;
      }

      // Escape → close everything (always active)
      if (e.key === 'Escape') {
        // Don't prevent default — let modals/dialogs handle their own close
        // But close any open UI state
        if (searchOpen) {
          toggleSearch();
          return;
        }
        closeAll();
        return;
      }

      // Skip all other shortcuts when typing in an input
      if (isTypingInInput()) return;

      // Skip if any modifier key is held (except for shortcuts that need it)
      if (isMeta || e.altKey) return;

      switch (e.key) {
        case 'c':
        case 'C':
          e.preventDefault();
          openEventDrawer({ defaultDate: useCalendarStore.getState().currentDate });
          break;

        case 't':
        case 'T':
          e.preventDefault();
          toggleTaskPanel();
          break;

        case 'm':
        case 'M':
          e.preventDefault();
          setView('month' as CalendarView);
          announce('Switched to month view');
          break;

        case 'w':
        case 'W':
          e.preventDefault();
          setView('week' as CalendarView);
          announce('Switched to week view');
          break;

        case 'd':
        case 'D':
          e.preventDefault();
          setView('day' as CalendarView);
          announce('Switched to day view');
          break;

        case 'a':
        case 'A':
          e.preventDefault();
          setView('agenda' as CalendarView);
          announce('Switched to agenda view');
          break;

        case 'ArrowLeft':
          e.preventDefault();
          navigate('prev');
          announce('Navigated to previous period');
          break;

        case 'ArrowRight':
          e.preventDefault();
          navigate('next');
          announce('Navigated to next period');
          break;

        case '.':
        case 'Home':
          e.preventDefault();
          navigate('today');
          announce('Navigated to today');
          break;

        case '?':
          e.preventDefault();
          onToggleShortcutsHelp();
          break;

        default:
          break;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    setView,
    navigate,
    toggleTaskPanel,
    toggleSearch,
    openEventDrawer,
    closeAll,
    searchOpen,
    onToggleShortcutsHelp,
  ]);
}
