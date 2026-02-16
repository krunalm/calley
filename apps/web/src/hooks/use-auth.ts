import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiClient, ApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

import type { User } from '@calley/shared';
import type {
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
  SignupInput,
} from '@calley/shared';

export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.user.me,
    queryFn: () => apiClient.get<User>('/auth/me'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: LoginInput) => apiClient.post<User>('/auth/login', data),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.user.me });
      const previous = queryClient.getQueryData<User>(queryKeys.user.me);
      return { previous };
    },
    onSuccess: (user) => {
      queryClient.setQueryData(queryKeys.user.me, user);
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.user.me, context.previous);
      }
      // Rate-limit toast is already shown by api-client; skip duplicate
      if (err instanceof ApiError && err.status === 429) return;
      toast.error('Invalid email or password');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.me });
    },
  });
}

export function useSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SignupInput) => apiClient.post<User>('/auth/signup', data),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.user.me });
      const previous = queryClient.getQueryData<User>(queryKeys.user.me);
      return { previous };
    },
    onSuccess: (user) => {
      queryClient.setQueryData(queryKeys.user.me, user);
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.user.me, context.previous);
      }
      if (err instanceof ApiError && err.status === 429) return;
      const message =
        err instanceof ApiError && err.error.code === 'CONFLICT'
          ? 'An account with this email already exists'
          : 'Failed to create account';
      toast.error(message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.me });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post('/auth/logout'),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.user.me });
      const previous = queryClient.getQueryData<User>(queryKeys.user.me);
      queryClient.setQueryData(queryKeys.user.me, null);
      return { previous };
    },
    onSuccess: () => {
      queryClient.clear();
      window.location.href = '/login';
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.user.me, context.previous);
      }
      if (err instanceof ApiError && err.status === 429) return;
      toast.error('Failed to log out');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.me });
    },
  });
}

export function useForgotPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ForgotPasswordInput) => apiClient.post('/auth/forgot-password', data),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.user.me });
      const previous = queryClient.getQueryData<User>(queryKeys.user.me);
      return { previous };
    },
    onSuccess: () => {
      toast.success('If that email exists, we sent a reset link');
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.user.me, context.previous);
      }
      if (err instanceof ApiError && err.status === 429) return;
      toast.error('Failed to send reset email. Please try again.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.me });
    },
  });
}

export function useResetPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ResetPasswordInput) => apiClient.post('/auth/reset-password', data),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.user.me });
      const previous = queryClient.getQueryData<User>(queryKeys.user.me);
      return { previous };
    },
    onSuccess: () => {
      toast.success('Password reset successfully. Please log in.');
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.user.me, context.previous);
      }
      if (err instanceof ApiError && err.status === 429) return;
      const message = err instanceof ApiError ? err.error.message : 'Failed to reset password';
      toast.error(message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.me });
    },
  });
}
