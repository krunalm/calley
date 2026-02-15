import { Eye, EyeOff, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { memo, useCallback, useRef, useState } from 'react';

import { DEFAULT_CATEGORY_COLOR } from '@calley/shared';

import { ColorPicker } from '@/components/calendar/ColorPicker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { cn } from '@/lib/utils';

import type { CalendarCategory } from '@calley/shared';

interface CalendarListProps {
  categories: CalendarCategory[];
  hiddenCategoryIds: Set<string>;
  onToggleVisibility: (categoryId: string) => void;
  onCreateCategory: (data: { name: string; color: string }) => void;
  onUpdateCategory: (categoryId: string, data: { name?: string; color?: string }) => void;
  onDeleteCategory: (categoryId: string) => void;
}

export const CalendarList = memo(function CalendarList({
  categories,
  hiddenCategoryIds,
  onToggleVisibility,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
}: CalendarListProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<CalendarCategory | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // ─── Add Category Dialog State ─────────────────────────────────────
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_CATEGORY_COLOR);

  // ─── Inline Edit State ─────────────────────────────────────────────
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const handleAddSubmit = useCallback(() => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreateCategory({ name: trimmed, color: newColor });
    setNewName('');
    setNewColor(DEFAULT_CATEGORY_COLOR);
    setAddDialogOpen(false);
  }, [newName, newColor, onCreateCategory]);

  const handleStartEdit = useCallback((cat: CalendarCategory) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color);
    // Focus the input after render
    setTimeout(() => editInputRef.current?.focus(), 50);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingId) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    const updates: { name?: string; color?: string } = {};
    const cat = categories.find((c) => c.id === editingId);
    if (cat && trimmed !== cat.name) updates.name = trimmed;
    if (cat && editColor !== cat.color) updates.color = editColor;
    if (Object.keys(updates).length > 0) {
      onUpdateCategory(editingId, updates);
    }
    setEditingId(null);
  }, [editingId, editName, editColor, categories, onUpdateCategory]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (categoryToDelete) {
      onDeleteCategory(categoryToDelete.id);
    }
    setCategoryToDelete(null);
    setDeleteDialogOpen(false);
  }, [categoryToDelete, onDeleteCategory]);

  const handleRequestDelete = useCallback((cat: CalendarCategory) => {
    setCategoryToDelete(cat);
    setDeleteDialogOpen(true);
  }, []);

  return (
    <div className="px-2 py-2">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          Calendars
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={() => setAddDialogOpen(true)}
          aria-label="Add calendar"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ul className="space-y-0.5">
        {categories.map((cat) => {
          const isHidden = hiddenCategoryIds.has(cat.id);
          const isEditing = editingId === cat.id;

          if (isEditing) {
            return (
              <li key={cat.id} className="rounded-[var(--radius-sm)] bg-[var(--accent-ui)] p-1.5">
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="h-5 w-5 shrink-0 rounded-sm border border-[var(--border)]"
                        style={{ backgroundColor: editColor }}
                        aria-label="Change color"
                      />
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3" align="start">
                      <ColorPicker value={editColor} onChange={setEditColor} />
                    </PopoverContent>
                  </Popover>
                  <Input
                    ref={editInputRef}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-6 flex-1 px-1.5 text-sm"
                    maxLength={50}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveEdit();
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        handleCancelEdit();
                      }
                    }}
                    onBlur={handleSaveEdit}
                  />
                </div>
              </li>
            );
          }

          return (
            <li key={cat.id} className="group relative">
              <button
                className={cn(
                  'flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-left text-sm transition-colors hover:bg-[var(--accent-ui)]',
                  isHidden && 'opacity-50',
                )}
                onClick={() => onToggleVisibility(cat.id)}
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

              {/* Three-dot menu */}
              <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`${cat.name} options`}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem onClick={() => handleStartEdit(cat)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      Edit
                    </DropdownMenuItem>
                    {!cat.isDefault && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-[var(--color-danger,#c0392b)]"
                          onClick={() => handleRequestDelete(cat)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          );
        })}
      </ul>

      {/* ─── Add Calendar Dialog ──────────────────────────────────────── */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>New Calendar</DialogTitle>
            <DialogDescription>
              Create a new calendar to organize your events and tasks.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="category-name">Name</Label>
              <Input
                id="category-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Work, Health, Personal"
                maxLength={50}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSubmit();
                  }
                }}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <ColorPicker value={newColor} onChange={setNewColor} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddSubmit} disabled={!newName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation Dialog ───────────────────────────────── */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Delete Calendar</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{categoryToDelete?.name}&rdquo;? All events and
              tasks in this calendar will be moved to your default calendar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
