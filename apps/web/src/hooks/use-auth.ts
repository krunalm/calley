import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiClient } from '@/lib/api-client';
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
    onSuccess: (user) => {
      queryClient.setQueryData(queryKeys.user.me, user);
    },
    onError: () => {
      toast.error('Invalid email or password');
    },
  });
}

export function useSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SignupInput) => apiClient.post<User>('/auth/signup', data),
    onSuccess: (user) => {
      queryClient.setQueryData(queryKeys.user.me, user);
    },
    onError: () => {
      toast.error('Failed to create account');
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post('/auth/logout'),
    onSuccess: () => {
      queryClient.clear();
      window.location.href = '/login';
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (data: ForgotPasswordInput) => apiClient.post('/auth/forgot-password', data),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (data: ResetPasswordInput) => apiClient.post('/auth/reset-password', data),
  });
}
