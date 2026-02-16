import { createFileRoute } from '@tanstack/react-router';

import { CalendarSettings } from '@/components/settings/CalendarSettings';
import { SettingsLayout } from '@/components/settings/SettingsLayout';

export const Route = createFileRoute('/_app/settings/calendars')({
  component: CalendarsPage,
});

export default function CalendarsPage() {
  return (
    <SettingsLayout>
      <CalendarSettings />
    </SettingsLayout>
  );
}
