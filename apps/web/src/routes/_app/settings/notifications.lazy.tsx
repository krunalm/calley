import { createLazyFileRoute } from '@tanstack/react-router';

import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { SettingsLayout } from '@/components/settings/SettingsLayout';

export const Route = createLazyFileRoute('/_app/settings/notifications')({
  component: NotificationsPage,
});

export default function NotificationsPage() {
  return (
    <SettingsLayout>
      <NotificationSettings />
    </SettingsLayout>
  );
}
