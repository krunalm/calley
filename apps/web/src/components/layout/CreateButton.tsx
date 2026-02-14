import { CalendarPlus, ListPlus, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUIStore } from '@/stores/ui-store';

export function CreateButton() {
  const { openEventDrawer, openTaskDrawer } = useUIStore();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="h-8 gap-1.5" aria-label="Create new">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => openEventDrawer()}>
          <CalendarPlus className="mr-2 h-4 w-4" />
          New Event
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openTaskDrawer()}>
          <ListPlus className="mr-2 h-4 w-4" />
          New Task
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
