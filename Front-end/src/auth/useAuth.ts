import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import * as authApi from "../api/auth";

const ME_KEY = ["me"] as const;

export function useAuth() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return (await authApi.fetchMe()).user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const login = useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      authApi.login(input.email, input.password),
    onSuccess: ({ user }) => queryClient.setQueryData(ME_KEY, user),
  });

  const logout = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      queryClient.clear();
      navigate("/login", { replace: true });
    },
  });

  return { user: me.data ?? null, isLoading: me.isPending, login, logout };
}