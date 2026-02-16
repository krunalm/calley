import { createLazyFileRoute } from '@tanstack/react-router';

import { CalendarSettings } from '@/components/settings/CalendarSettings';
import { SettingsLayout } from '@/components/settings/SettingsLayout';

export const Route = createLazyFileRoute('/_app/settings/calendars')({
  component: CalendarsPage,
});

function CalendarsPage() {
  return (
    <SettingsLayout>
      <CalendarSettings />
    </SettingsLayout>
  );
}
