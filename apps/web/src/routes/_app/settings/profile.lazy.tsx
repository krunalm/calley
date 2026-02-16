import { createLazyFileRoute } from '@tanstack/react-router';

import { ProfileSettings } from '@/components/settings/ProfileSettings';
import { SettingsLayout } from '@/components/settings/SettingsLayout';

export const Route = createLazyFileRoute('/_app/settings/profile')({
  component: ProfilePage,
});

export default function ProfilePage() {
  return (
    <SettingsLayout>
      <ProfileSettings />
    </SettingsLayout>
  );
}
