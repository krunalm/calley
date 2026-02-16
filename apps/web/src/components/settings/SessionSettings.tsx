import { formatDistanceToNow } from 'date-fns';
import { Laptop, LogOut, Monitor, Smartphone } from 'lucide-react';
import { memo, useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/Skeleton';
import { useRevokeAllOtherSessions, useRevokeSession, useSessions } from '@/hooks/use-settings';

import type { Session } from '@calley/shared';

// ─── Helpers ────────────────────────────────────────────────────────

function parseUserAgent(ua: string | null): {
  browser: string;
  os: string;
  device: 'desktop' | 'mobile' | 'tablet';
} {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', device: 'desktop' };

  let browser = 'Unknown';
  let os = 'Unknown';
  let device: 'desktop' | 'mobile' | 'tablet' = 'desktop';

  // OS detection
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS X') || ua.includes('Macintosh')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) {
    os = 'Android';
    device = 'mobile';
  } else if (ua.includes('iPhone')) {
    os = 'iOS';
    device = 'mobile';
  } else if (ua.includes('iPad')) {
    os = 'iPadOS';
    device = 'tablet';
  }

  // Browser detection
  if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';

  return { browser, os, device };
}

function DeviceIcon({ device }: { device: 'desktop' | 'mobile' | 'tablet' }) {
  switch (device) {
    case 'mobile':
      return <Smartphone className="h-5 w-5 text-[var(--muted-foreground)]" />;
    case 'tablet':
      return <Laptop className="h-5 w-5 text-[var(--muted-foreground)]" />;
    default:
      return <Monitor className="h-5 w-5 text-[var(--muted-foreground)]" />;
  }
}

// ─── Session Item ───────────────────────────────────────────────────

interface SessionItemProps {
  session: Session;
  onRevoke: (id: string) => void;
  isRevoking: boolean;
}

const SessionItem = memo(function SessionItem({ session, onRevoke, isRevoking }: SessionItemProps) {
  const { browser, os, device } = parseUserAgent(session.userAgent);
  const lastActive = formatDistanceToNow(new Date(session.lastActiveAt), { addSuffix: true });

  return (
    <div className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--border)] px-4 py-3">
      <div className="flex items-center gap-3">
        <DeviceIcon device={device} />
        <div>
          <p className="text-sm font-medium">
            {browser} on {os}
            {session.isCurrent && (
              <span className="ml-2 rounded-full bg-[var(--primary)] px-2 py-0.5 text-xs text-[var(--primary-foreground)]">
                Current
              </span>
            )}
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">Last active {lastActive}</p>
        </div>
      </div>
      {!session.isCurrent && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRevoke(session.id)}
          disabled={isRevoking}
          className="text-[var(--color-danger)]"
        >
          <LogOut className="mr-1 h-3.5 w-3.5" />
          Revoke
        </Button>
      )}
    </div>
  );
});

// ─── Main Component ─────────────────────────────────────────────────

export const SessionSettings = memo(function SessionSettings() {
  const { data: sessions, isLoading } = useSessions();
  const revokeSession = useRevokeSession();
  const revokeAll = useRevokeAllOtherSessions();
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);

  const handleRevoke = useCallback(
    (sessionId: string) => {
      revokeSession.mutate(sessionId);
    },
    [revokeSession],
  );

  const handleRevokeAll = useCallback(() => {
    revokeAll.mutate();
    setRevokeAllOpen(false);
  }, [revokeAll]);

  const otherSessionCount = sessions?.filter((s) => !s.isCurrent).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Sessions</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Manage your active sessions across devices
          </p>
        </div>
        {otherSessionCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRevokeAllOpen(true)}
            className="text-[var(--color-danger)]"
          >
            Sign out all other devices
          </Button>
        )}
      </div>

      <Separator />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-[var(--radius)]" />
          ))}
        </div>
      ) : sessions && sessions.length > 0 ? (
        <div className="space-y-3">
          {/* Show current session first */}
          {sessions
            .sort((a, b) => (a.isCurrent ? -1 : b.isCurrent ? 1 : 0))
            .map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                onRevoke={handleRevoke}
                isRevoking={revokeSession.isPending}
              />
            ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--muted-foreground)]">No active sessions</p>
      )}

      {/* Revoke All Confirmation */}
      <Dialog open={revokeAllOpen} onOpenChange={setRevokeAllOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Sign out all other devices</DialogTitle>
            <DialogDescription>
              This will revoke {otherSessionCount} session{otherSessionCount !== 1 ? 's' : ''} on
              other devices. You will remain signed in on this device.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeAllOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevokeAll} disabled={revokeAll.isPending}>
              {revokeAll.isPending ? 'Revoking...' : 'Sign out all others'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
