import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from '../lib/api';
import { useAuthStore, User } from '../stores/authStore';

const PROFILE_KEY = ['profile'] as const;

async function fetchProfile(): Promise<User> {
  const res = await api.get('/auth/profile');
  return res.data.user;
}

/**
 * Fetches the authenticated user's full profile (provider, phone,
 * verification status, etc — fields /login and /signup don't return)
 * and keeps authStore's user in sync so the rest of the app sees it too.
 */
export function useProfile() {
  const token = useAuthStore((s) => s.token);
  const fallbackUser = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const query = useQuery({
    queryKey: PROFILE_KEY,
    queryFn: fetchProfile,
    enabled: !!token,
    staleTime: 1000 * 60,
    retry: 1,
  });

  useEffect(() => {
    if (query.data) updateUser(query.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  return {
    profile: query.data ?? fallbackUser ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

interface UpdateProfilePayload {
  name?: string;
  email?: string;
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const updateUser = useAuthStore((s) => s.updateUser);

  return useMutation({
    mutationFn: async (payload: UpdateProfilePayload) => {
      if (!userId) throw new Error('Not authenticated');
      const res = await api.put(`/auth/profile/${userId}`, payload);
      return res.data.user as User;
    },
    onSuccess: (user) => {
      updateUser(user);
      queryClient.invalidateQueries({ queryKey: PROFILE_KEY });
    },
  });
}

interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (payload: ChangePasswordPayload) => {
      const res = await api.put('/auth/change-password', payload);
      return res.data;
    },
  });
}

export function useSendPhoneOtp() {
  return useMutation({
    mutationFn: async (phone: string) => {
      const res = await api.post('/auth/phone/send-otp', { phone });
      return res.data;
    },
  });
}

export function useVerifyPhoneOtp() {
  const queryClient = useQueryClient();
  const updateUser = useAuthStore((s) => s.updateUser);

  return useMutation({
    mutationFn: async (payload: { phone: string; otp: string }) => {
      const res = await api.post('/auth/phone/verify', payload);
      return res.data;
    },
    onSuccess: (_data, variables) => {
      updateUser({ phoneNumber: variables.phone, phoneVerified: true });
      queryClient.invalidateQueries({ queryKey: PROFILE_KEY });
    },
  });
}

export function useLogout() {
  const clearAuth = useAuthStore((s) => s.clearAuth);

  return useMutation({
    mutationFn: async () => {
      // Best-effort — logout is JWT-only server-side today (nothing to
      // revoke), so we don't block local logout on this call succeeding.
      try {
        await api.post('/auth/logout');
      } catch {
        // ignore — we log out locally regardless
      }
    },
    onSettled: () => {
      clearAuth();
      router.replace('/(auth)/login');
    },
  });
}