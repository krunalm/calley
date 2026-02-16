import { createFileRoute } from '@tanstack/react-router';

import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { SettingsLayout } from '@/components/settings/SettingsLayout';

export const Route = createFileRoute('/_app/settings/notifications')({
  component: NotificationsPage,
});

function NotificationsPage() {
  return (
    <SettingsLayout>
      <NotificationSettings />
    </SettingsLayout>
  );
}
