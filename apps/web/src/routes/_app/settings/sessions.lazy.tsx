import { createLazyFileRoute } from '@tanstack/react-router';

import { SessionSettings } from '@/components/settings/SessionSettings';
import { SettingsLayout } from '@/components/settings/SettingsLayout';

export const Route = createLazyFileRoute('/_app/settings/sessions')({
  component: SessionsPage,
});

export default function SessionsPage() {
  return (
    <SettingsLayout>
      <SessionSettings />
    </SettingsLayout>
  );
}
