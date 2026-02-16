import { zodResolver } from '@hookform/resolvers/zod';
import { parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { Github, Link2Off, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

import { changePasswordSchema, updateProfileSchema } from '@calley/shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useCurrentUser } from '@/hooks/use-auth';
import {
  useChangePassword,
  useDeleteAccount,
  useOAuthAccounts,
  useUnlinkOAuthAccount,
  useUpdateProfile,
} from '@/hooks/use-settings';
import { ApiError } from '@/lib/api-client';

import type { ChangePasswordInput, UpdateProfileInput } from '@calley/shared';

// ─── Timezone list ──────────────────────────────────────────────────

function getTimezoneList(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf(
      'timeZone',
    );
  } catch {
    // Fallback for older browsers
    return [
      'UTC',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Anchorage',
      'Pacific/Honolulu',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Asia/Tokyo',
      'Asia/Shanghai',
      'Asia/Kolkata',
      'Australia/Sydney',
    ];
  }
}

// ─── Profile Form ───────────────────────────────────────────────────

function ProfileForm() {
  const { data: user } = useCurrentUser();
  const updateProfile = useUpdateProfile();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: user
      ? {
          name: user.name,
          timezone: user.timezone,
          weekStart: user.weekStart,
          timeFormat: user.timeFormat,
        }
      : undefined,
  });

  // Sync form defaults when user data updates (e.g. after timezone/weekStart/timeFormat
  // mutations) without overwriting dirty fields like an in-progress name edit.
  useEffect(() => {
    if (user) {
      reset(
        {
          name: user.name,
          timezone: user.timezone,
          weekStart: user.weekStart,
          timeFormat: user.timeFormat,
        },
        { keepDirtyValues: true },
      );
    }
  }, [user, reset]);

  const timezones = useMemo(() => getTimezoneList(), []);
  const [timezoneSearch, setTimezoneSearch] = useState('');
  const filteredTimezones = useMemo(() => {
    if (!timezoneSearch) return timezones;
    const lower = timezoneSearch.toLowerCase();
    return timezones.filter((tz) => tz.toLowerCase().includes(lower));
  }, [timezones, timezoneSearch]);

  const onSubmit = async (data: UpdateProfileInput) => {
    await updateProfile.mutateAsync(data);
  };

  if (!user) return null;

  // Gravatar fallback URL
  const avatarUrl = user.avatarUrl;

  const initials = user.name
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Profile</h2>
        <p className="text-sm text-[var(--muted-foreground)]">Manage your personal information</p>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-4">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary)] text-lg font-medium text-[var(--primary-foreground)]">
            {initials}
          </span>
        )}
        <div>
          <p className="font-medium">{user.name}</p>
          <p className="text-sm text-[var(--muted-foreground)]">{user.email}</p>
        </div>
      </div>

      <Separator />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" {...register('name')} maxLength={100} />
          {errors.name && (
            <p className="text-sm text-[var(--color-danger)]" role="alert">
              {errors.name.message}
            </p>
          )}
        </div>

        {/* Email (read-only) */}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={user.email} disabled className="bg-[var(--muted)]" />
          <p className="text-xs text-[var(--muted-foreground)]">Email cannot be changed</p>
        </div>

        {/* Timezone */}
        <div className="space-y-2">
          <Label htmlFor="timezone">Timezone</Label>
          <Select
            value={user.timezone}
            onValueChange={(val) => {
              updateProfile.mutate({ timezone: val });
            }}
          >
            <SelectTrigger id="timezone">
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              <div className="px-2 pb-2">
                <Input
                  placeholder="Search timezones..."
                  value={timezoneSearch}
                  onChange={(e) => setTimezoneSearch(e.target.value)}
                  className="h-8"
                />
              </div>
              {filteredTimezones.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Week Start */}
        <div className="space-y-2">
          <Label htmlFor="weekStart">Week starts on</Label>
          <Select
            value={String(user.weekStart)}
            onValueChange={(val) => {
              updateProfile.mutate({ weekStart: Number(val) as 0 | 1 });
            }}
          >
            <SelectTrigger id="weekStart">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Sunday</SelectItem>
              <SelectItem value="1">Monday</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Time Format */}
        <div className="space-y-2">
          <Label htmlFor="timeFormat">Time format</Label>
          <Select
            value={user.timeFormat}
            onValueChange={(val) => {
              updateProfile.mutate({ timeFormat: val as '12h' | '24h' });
            }}
          >
            <SelectTrigger id="timeFormat">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="12h">12-hour (1:00 PM)</SelectItem>
              <SelectItem value="24h">24-hour (13:00)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Save button for name changes */}
        {isDirty && (
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save changes'}
          </Button>
        )}
      </form>
    </div>
  );
}

// ─── Change Password Form ───────────────────────────────────────────

function ChangePasswordForm() {
  const { data: user } = useCurrentUser();
  const changePassword = useChangePassword();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
  });

  const onSubmit = async (data: ChangePasswordInput) => {
    try {
      await changePassword.mutateAsync(data);
      reset();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('currentPassword', { message: 'Current password is incorrect' });
      }
    }
  };

  // Don't show for OAuth-only users (no password set)
  // We check if user has no avatar and no password - but we can't check password from frontend.
  // The backend will return an error if they try. For UX, we'll still show it but the
  // backend handles the "no password" case.
  if (!user) return null;

  return (
    <div className="space-y-6">
      <Separator />
      <div>
        <h2 className="text-lg font-semibold">Change Password</h2>
        <p className="text-sm text-[var(--muted-foreground)]">Update your password</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="currentPassword">Current password</Label>
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            {...register('currentPassword')}
          />
          {errors.currentPassword && (
            <p className="text-sm text-[var(--color-danger)]" role="alert">
              {errors.currentPassword.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="newPassword">New password</Label>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            {...register('newPassword')}
          />
          {errors.newPassword && (
            <p className="text-sm text-[var(--color-danger)]" role="alert">
              {errors.newPassword.message}
            </p>
          )}
        </div>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Changing...' : 'Change password'}
        </Button>
      </form>
    </div>
  );
}

// ─── Connected Accounts ─────────────────────────────────────────────

function ConnectedAccounts() {
  const { data: user } = useCurrentUser();
  const { data: accounts = [], isLoading } = useOAuthAccounts();
  const unlinkAccount = useUnlinkOAuthAccount();
  const timezone = user?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (isLoading) return null;

  const providerIcon = (provider: string) => {
    switch (provider) {
      case 'google':
        return (
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
        );
      case 'github':
        return <Github className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const providerLabel = (provider: string) => {
    switch (provider) {
      case 'google':
        return 'Google';
      case 'github':
        return 'GitHub';
      default:
        return provider;
    }
  };

  return (
    <div className="space-y-6">
      <Separator />
      <div>
        <h2 className="text-lg font-semibold">Connected Accounts</h2>
        <p className="text-sm text-[var(--muted-foreground)]">Manage your linked login providers</p>
      </div>

      {accounts.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No connected accounts</p>
      ) : (
        <ul className="space-y-3">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--border)] px-4 py-3"
            >
              <div className="flex items-center gap-3">
                {providerIcon(account.provider)}
                <div>
                  <p className="text-sm font-medium">{providerLabel(account.provider)}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Connected {formatInTimeZone(parseISO(account.createdAt), timezone, 'PPP')}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => unlinkAccount.mutate(account.id)}
                disabled={unlinkAccount.isPending}
              >
                <Link2Off className="mr-1 h-3.5 w-3.5" />
                Unlink
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Delete Account ─────────────────────────────────────────────────

function DeleteAccountSection() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [password, setPassword] = useState('');
  const deleteAccount = useDeleteAccount();

  const handleDelete = useCallback(async () => {
    await deleteAccount.mutateAsync({ password });
  }, [deleteAccount, password]);

  return (
    <div className="space-y-6">
      <Separator />
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-danger)]">Danger Zone</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Permanently delete your account and all data
        </p>
      </div>

      <Button variant="destructive" onClick={() => setDialogOpen(true)}>
        Delete account
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>
              This action is permanent and cannot be undone. All your events, tasks, and settings
              will be deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="delete-password">Enter your password to confirm</Label>
            <Input
              id="delete-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!password || deleteAccount.isPending}
            >
              {deleteAccount.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete my account'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export function ProfileSettings() {
  return (
    <div className="space-y-0">
      <ProfileForm />
      <ChangePasswordForm />
      <ConnectedAccounts />
      <DeleteAccountSection />
    </div>
  );
}
