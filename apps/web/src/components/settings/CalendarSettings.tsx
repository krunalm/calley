import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { lazy, memo, Suspense, useCallback, useState } from 'react';

import { DEFAULT_CATEGORY_COLOR } from '@calley/shared';

const ColorPicker = lazy(() =>
  import('@/components/calendar/ColorPicker').then((m) => ({ default: m.ColorPicker })),
);
import { Button } from '@/components/ui/button';
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
import { Separator } from '@/components/ui/separator';
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '@/hooks/use-categories';

import type { CalendarCategory } from '@calley/shared';

export const CalendarSettings = memo(function CalendarSettings() {
  const { data: categories = [] } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  // Add dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_CATEGORY_COLOR);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<CalendarCategory | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  // Delete dialog state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<CalendarCategory | null>(null);

  const handleCreate = useCallback(() => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    createCategory.mutate({ name: trimmed, color: newColor });
    setNewName('');
    setNewColor(DEFAULT_CATEGORY_COLOR);
    setAddOpen(false);
  }, [newName, newColor, createCategory]);

  const handleStartEdit = useCallback((cat: CalendarCategory) => {
    setEditCategory(cat);
    setEditName(cat.name);
    setEditColor(cat.color);
    setEditOpen(true);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editCategory) return;
    const trimmed = editName.trim();
    if (!trimmed) return;

    const updates: { name?: string; color?: string } = {};
    if (trimmed !== editCategory.name) updates.name = trimmed;
    if (editColor !== editCategory.color) updates.color = editColor;

    if (Object.keys(updates).length > 0) {
      updateCategory.mutate({ categoryId: editCategory.id, data: updates });
    }
    setEditOpen(false);
    setEditCategory(null);
  }, [editCategory, editName, editColor, updateCategory]);

  const handleRequestDelete = useCallback((cat: CalendarCategory) => {
    setCategoryToDelete(cat);
    setDeleteOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (categoryToDelete) {
      deleteCategory.mutate(categoryToDelete.id);
    }
    setDeleteOpen(false);
    setCategoryToDelete(null);
  }, [categoryToDelete, deleteCategory]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Calendars</h2>
          <p className="text-sm text-[var(--muted-foreground)]">Manage your calendar categories</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          New calendar
        </Button>
      </div>

      <Separator />

      {/* Category List */}
      <ul className="space-y-2">
        {categories.map((cat) => (
          <li
            key={cat.id}
            className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--border)] px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <GripVertical className="h-4 w-4 cursor-grab text-[var(--muted-foreground)]" />
              <span
                className="h-4 w-4 shrink-0 rounded-sm"
                style={{ backgroundColor: cat.color }}
                aria-hidden="true"
              />
              <div>
                <span className="text-sm font-medium">{cat.name}</span>
                {cat.isDefault && (
                  <span className="ml-2 text-xs text-[var(--muted-foreground)]">(Default)</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleStartEdit(cat)}
                aria-label={`Edit ${cat.name}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              {!cat.isDefault && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-[var(--color-danger)]"
                  onClick={() => handleRequestDelete(cat)}
                  aria-label={`Delete ${cat.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {categories.length >= 20 && (
        <p className="text-sm text-[var(--muted-foreground)]">Maximum of 20 calendars reached</p>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>New Calendar</DialogTitle>
            <DialogDescription>
              Create a new calendar to organize your events and tasks.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-cat-name">Name</Label>
              <Input
                id="new-cat-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Work, Health, Personal"
                maxLength={50}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <Suspense
                fallback={<div className="h-20 w-40 animate-pulse rounded bg-[var(--muted)]" />}
              >
                <ColorPicker value={newColor} onChange={setNewColor} />
              </Suspense>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Edit Calendar</DialogTitle>
            <DialogDescription>Update the calendar name and color.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-cat-name">Name</Label>
              <Input
                id="edit-cat-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={50}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveEdit();
                  }
                }}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <Suspense
                fallback={<div className="h-20 w-40 animate-pulse rounded bg-[var(--muted)]" />}
              >
                <ColorPicker value={editColor} onChange={setEditColor} />
              </Suspense>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={!editName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Delete Calendar</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{categoryToDelete?.name}&rdquo;? All events and
              tasks in this calendar will be moved to your default calendar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
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
