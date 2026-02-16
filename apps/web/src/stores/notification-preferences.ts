import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NotificationPreferences {
  defaultReminderMinutes: string; // '0' | '5' | '15' | '30' | '60' | '1440' | 'none'
  defaultReminderMethod: string; // 'push' | 'email' | 'both' | 'none'
  emailNotifications: boolean;

  setDefaultReminderMinutes: (value: string) => void;
  setDefaultReminderMethod: (value: string) => void;
  setEmailNotifications: (value: boolean) => void;
}

export const useNotificationPreferences = create<NotificationPreferences>()(
  persist(
    (set) => ({
      defaultReminderMinutes: '15',
      defaultReminderMethod: 'push',
      emailNotifications: true,

      setDefaultReminderMinutes: (value) => set({ defaultReminderMinutes: value }),
      setDefaultReminderMethod: (value) => set({ defaultReminderMethod: value }),
      setEmailNotifications: (value) => set({ emailNotifications: value }),
    }),
    {
      name: 'calley-notification-prefs',
    },
  ),
);
