import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { apiClient } from '@/lib/api-client';

import type { PushSubscription as PushSub } from '@calley/shared';

// ─── Helpers ────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ─── Query Keys ─────────────────────────────────────────────────────

const pushQueryKeys = {
  vapidKey: ['push', 'vapid-key'] as const,
  subscriptions: ['push', 'subscriptions'] as const,
};

// ─── Hook ───────────────────────────────────────────────────────────

/**
 * Hook for managing Web Push notification subscriptions.
 *
 * Provides:
 * - `isSupported` — whether the browser supports push notifications
 * - `permission` — current notification permission state
 * - `isSubscribed` — whether the user has an active push subscription
 * - `subscribe()` — request permission and subscribe to push
 * - `unsubscribe()` — remove push subscription
 * - `subscriptions` — list of all push subscriptions for the user
 */
export function usePushNotifications() {
  const queryClient = useQueryClient();
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  );

  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  // ─── Fetch VAPID key ──────────────────────────────────────────

  const { data: vapidData } = useQuery({
    queryKey: pushQueryKeys.vapidKey,
    queryFn: () => apiClient.get<{ vapidPublicKey: string }>('/push-subscriptions/vapid-key'),
    enabled: isSupported,
    staleTime: Infinity,
  });

  // ─── Fetch current subscriptions ──────────────────────────────

  const { data: subscriptions = [] } = useQuery({
    queryKey: pushQueryKeys.subscriptions,
    queryFn: () => apiClient.get<PushSub[]>('/push-subscriptions'),
    enabled: isSupported,
  });

  // ─── Register service worker ──────────────────────────────────

  useEffect(() => {
    if (!isSupported) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration failed — push won't work
    });
  }, [isSupported]);

  // ─── Subscribe mutation ───────────────────────────────────────

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      if (!vapidData?.vapidPublicKey) {
        throw new Error('VAPID key not available');
      }

      // Request notification permission
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        throw new Error('Notification permission denied');
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidData.vapidPublicKey).buffer as ArrayBuffer,
      });

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error('Invalid push subscription');
      }

      // Register with backend
      return apiClient.post<PushSub>('/push-subscriptions', {
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pushQueryKeys.subscriptions });
      toast.success('Push notifications enabled');
    },
    onError: (err) => {
      if (err.message === 'Notification permission denied') {
        toast.error('Notification permission was denied');
      } else {
        toast.error('Failed to enable push notifications');
      }
    },
  });

  // ─── Unsubscribe mutation ─────────────────────────────────────

  const unsubscribeMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      // Find the server-side subscription to get its endpoint
      const serverSub = subscriptions.find((s) => s.id === subscriptionId);

      // Always remove the server record
      await apiClient.delete(`/push-subscriptions/${subscriptionId}`);

      // Only unsubscribe the browser push if this device's subscription
      // matches the one being removed (avoid removing a different device's sub)
      const registration = await navigator.serviceWorker.ready;
      const browserSub = await registration.pushManager.getSubscription();
      if (browserSub && serverSub && browserSub.endpoint === serverSub.endpoint) {
        await browserSub.unsubscribe();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pushQueryKeys.subscriptions });
      toast.success('Push notifications disabled');
    },
    onError: () => {
      toast.error('Failed to disable push notifications');
    },
  });

  const subscribe = useCallback(() => {
    subscribeMutation.mutate();
  }, [subscribeMutation]);

  const unsubscribe = useCallback(
    (subscriptionId: string) => {
      unsubscribeMutation.mutate(subscriptionId);
    },
    [unsubscribeMutation],
  );

  return {
    isSupported,
    permission,
    isSubscribed: subscriptions.length > 0,
    subscriptions,
    subscribe,
    unsubscribe,
    isSubscribing: subscribeMutation.isPending,
    isUnsubscribing: unsubscribeMutation.isPending,
  };
}
