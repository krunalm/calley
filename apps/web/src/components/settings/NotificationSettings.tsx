import { Bell, BellOff, CheckCircle2, Mail, XCircle } from 'lucide-react';
import { memo, useCallback } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { useNotificationPreferences } from '@/stores/notification-preferences';

// ─── Default Reminder Preferences ───────────────────────────────────

const REMINDER_TIME_OPTIONS = [
  { value: '0', label: 'At time of event' },
  { value: '5', label: '5 minutes before' },
  { value: '15', label: '15 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '1440', label: '1 day before' },
  { value: 'none', label: 'No reminder' },
];

const REMINDER_METHOD_OPTIONS = [
  { value: 'push', label: 'Push notification' },
  { value: 'email', label: 'Email' },
  { value: 'both', label: 'Push + Email' },
  { value: 'none', label: 'None' },
];

export const NotificationSettings = memo(function NotificationSettings() {
  const {
    isSupported,
    permission,
    isSubscribed,
    subscriptions,
    subscribe,
    unsubscribe,
    isSubscribing,
  } = usePushNotifications();

  const {
    defaultReminderMinutes,
    defaultReminderMethod,
    emailNotifications,
    setDefaultReminderMinutes,
    setDefaultReminderMethod,
    setEmailNotifications,
  } = useNotificationPreferences();

  const handleTogglePush = useCallback(async () => {
    if (isSubscribed && subscriptions.length > 0) {
      // Find the subscription matching this device's browser push endpoint
      try {
        const registration = await navigator.serviceWorker.ready;
        const browserSub = await registration.pushManager.getSubscription();
        if (browserSub) {
          const matching = subscriptions.find((s) => s.endpoint === browserSub.endpoint);
          if (matching) {
            await unsubscribe(matching.id);
            return;
          }
        }
        // No browser subscription found — can't determine which server subscription to revoke
        toast.error('Could not identify the push subscription for this device');
      } catch (err) {
        toast.error('Failed to toggle push notifications');
        console.error('handleTogglePush error:', err);
      }
    } else {
      try {
        await subscribe();
      } catch (err) {
        toast.error('Failed to enable push notifications');
        console.error('handleTogglePush subscribe error:', err);
      }
    }
  }, [isSubscribed, subscriptions, subscribe, unsubscribe]);

  const permissionStatus = () => {
    if (!isSupported) {
      return (
        <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
          <XCircle className="h-4 w-4" />
          Push notifications are not supported in this browser
        </div>
      );
    }

    if (permission === 'denied') {
      return (
        <div className="flex items-center gap-2 text-sm text-[var(--color-danger)]">
          <BellOff className="h-4 w-4" />
          Push notifications are blocked. Please enable them in your browser settings.
        </div>
      );
    }

    if (isSubscribed) {
      return (
        <div className="flex items-center gap-2 text-sm text-[var(--color-success)]">
          <CheckCircle2 className="h-4 w-4" />
          Push notifications are enabled
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
        <Bell className="h-4 w-4" />
        Push notifications are not enabled
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Notifications</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Configure how you receive reminders and notifications
        </p>
      </div>

      <Separator />

      {/* Default Reminder Preferences */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Default Reminder</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          These defaults apply when creating new events
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="default-reminder-time">
              Remind me
            </label>
            <Select value={defaultReminderMinutes} onValueChange={setDefaultReminderMinutes}>
              <SelectTrigger id="default-reminder-time">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REMINDER_TIME_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="default-reminder-method">
              Notification method
            </label>
            <Select value={defaultReminderMethod} onValueChange={setDefaultReminderMethod}>
              <SelectTrigger id="default-reminder-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REMINDER_METHOD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Separator />

      {/* Push Notifications */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Push Notifications</h3>
        {permissionStatus()}

        <Button
          variant={isSubscribed ? 'outline' : 'default'}
          size="sm"
          onClick={handleTogglePush}
          disabled={!isSupported || permission === 'denied' || isSubscribing}
        >
          {isSubscribing ? (
            'Enabling...'
          ) : isSubscribed ? (
            <>
              <BellOff className="mr-1 h-4 w-4" />
              Disable push notifications
            </>
          ) : (
            <>
              <Bell className="mr-1 h-4 w-4" />
              Enable push notifications
            </>
          )}
        </Button>
      </div>

      <Separator />

      {/* Email Notifications */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Email Notifications</h3>
        <div className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-3">
            <Mail className="h-4 w-4 text-[var(--muted-foreground)]" />
            <div>
              <p className="text-sm font-medium">Email reminders</p>
              <p className="text-xs text-[var(--muted-foreground)]">
                Receive reminder emails for events and tasks
              </p>
            </div>
          </div>
          <Button
            variant={emailNotifications ? 'outline' : 'default'}
            size="sm"
            onClick={() => setEmailNotifications(!emailNotifications)}
          >
            {emailNotifications ? 'Disable' : 'Enable'}
          </Button>
        </div>
      </div>
    </div>
  );
});
