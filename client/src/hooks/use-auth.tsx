import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { useLocation } from "wouter";
import { fetchAuthMe, signInAndLoadProfile, type AuthProfile } from "@/lib/auth-api";

type AuthUser = AuthProfile;

type AuthContextType = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!sessionReady) {
        console.warn("[auth] Supabase session check timed out — continuing without session");
        setSessionReady(true);
      }
    }, 6000);

    supabase.auth.getSession().then(() => {
      clearTimeout(timeout);
      setSessionReady(true);
    }).catch(() => {
      clearTimeout(timeout);
      setSessionReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        queryClient.setQueryData(["/api/auth/me"], null);
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      }
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const { data: user, isLoading: queryLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
        const result = await Promise.race([sessionPromise, timeoutPromise]);
        if (!result || !("data" in result) || !result.data.session?.access_token) return null;
        return await fetchAuthMe(result.data.session.access_token);
      } catch (err) {
        console.warn("[auth] /api/auth/me falhou ao restaurar sessão:", err);
        return null;
      }
    },
    enabled: sessionReady,
    staleTime: Infinity,
    retry: false,
  });

  const isLoading = !sessionReady || queryLoading;

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      signInAndLoadProfile(supabase, email, password),
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/me"], data);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await supabase.auth.signOut();
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.clear();
      setLocation("/admin");
    },
  });

  const login = useCallback(async (email: string, password: string) => {
    return await loginMutation.mutateAsync({ email, password });
  }, [loginMutation]);

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
