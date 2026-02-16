import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { toast } from 'sonner';

import { apiClient, ApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

import type {
  ChangePasswordInput,
  DeleteAccountInput,
  OAuthAccount,
  Session,
  UpdateProfileInput,
  User,
} from '@calley/shared';

// ─── Profile ──────────────────────────────────────────────────────────

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateProfileInput) => apiClient.patch<User>('/auth/me', data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.user.me });
      const previous = queryClient.getQueryData<User>(queryKeys.user.me);

      queryClient.setQueryData<User>(queryKeys.user.me, (old) =>
        old
          ? {
              ...old,
              ...data,
              updatedAt: formatInTimeZone(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ssXXX"),
            }
          : old,
      );

      return { previous };
    },
    onSuccess: (user) => {
      queryClient.setQueryData(queryKeys.user.me, user);
      toast.success('Profile updated');
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.user.me, context.previous);
      }
      if (err instanceof ApiError && err.status === 429) return;
      toast.error('Failed to update profile');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.me });
    },
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ChangePasswordInput) => apiClient.patch('/auth/me/password', data),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.user.me });
      const previous = queryClient.getQueryData<User>(queryKeys.user.me);
      return { previous };
    },
    onSuccess: () => {
      toast.success('Password changed successfully');
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.user.me, context.previous);
      }
      if (err instanceof ApiError && err.status === 429) return;
      const message =
        err instanceof ApiError && err.status === 401
          ? 'Current password is incorrect'
          : 'Failed to change password';
      toast.error(message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.me });
    },
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DeleteAccountInput) => apiClient.delete<void>('/auth/me', data),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.user.me });
      const previous = queryClient.getQueryData<User>(queryKeys.user.me);
      return { previous };
    },
    onSuccess: () => {
      window.location.href = '/login';
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.user.me, context.previous);
      }
      if (err instanceof ApiError && err.status === 429) return;
      const message =
        err instanceof ApiError && err.status === 401
          ? 'Password is incorrect'
          : 'Failed to delete account';
      toast.error(message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.me });
    },
  });
}

// ─── Sessions ─────────────────────────────────────────────────────────

export function useSessions() {
  return useQuery({
    queryKey: queryKeys.user.sessions,
    queryFn: () => apiClient.get<Session[]>('/auth/sessions'),
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => apiClient.delete(`/auth/sessions/${sessionId}`),
    onMutate: async (sessionId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.user.sessions });
      const previous = queryClient.getQueryData<Session[]>(queryKeys.user.sessions);

      queryClient.setQueryData<Session[]>(queryKeys.user.sessions, (old) =>
        old?.filter((s) => s.id !== sessionId),
      );

      return { previous };
    },
    onSuccess: () => {
      toast.success('Session revoked');
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.user.sessions, context.previous);
      }
      if (err instanceof ApiError && err.status === 429) return;
      toast.error('Failed to revoke session');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.sessions });
    },
  });
}

export function useRevokeAllOtherSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete<{ revokedCount: number }>('/auth/sessions'),
    onSuccess: (data) => {
      toast.success(`Revoked ${data.revokedCount} session(s)`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 429) return;
      toast.error('Failed to revoke sessions');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.sessions });
    },
  });
}

// ─── OAuth Accounts ───────────────────────────────────────────────────

const oauthQueryKeys = {
  accounts: ['oauth', 'accounts'] as const,
};

export function useOAuthAccounts() {
  return useQuery({
    queryKey: oauthQueryKeys.accounts,
    queryFn: () => apiClient.get<OAuthAccount[]>('/auth/oauth/accounts'),
  });
}

export function useUnlinkOAuthAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) => apiClient.delete(`/auth/oauth/accounts/${accountId}`),
    onMutate: async (accountId) => {
      await queryClient.cancelQueries({ queryKey: oauthQueryKeys.accounts });
      const previous = queryClient.getQueryData<OAuthAccount[]>(oauthQueryKeys.accounts);

      queryClient.setQueryData<OAuthAccount[]>(oauthQueryKeys.accounts, (old) =>
        old?.filter((a) => a.id !== accountId),
      );

      return { previous };
    },
    onSuccess: () => {
      toast.success('Account unlinked');
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(oauthQueryKeys.accounts, context.previous);
      }
      if (err instanceof ApiError && err.status === 429) return;
      const message = err instanceof ApiError ? err.error.message : 'Failed to unlink account';
      toast.error(message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: oauthQueryKeys.accounts });
    },
  });
}
