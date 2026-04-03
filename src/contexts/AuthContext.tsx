import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logActivity } from '@/lib/activityLogger';
import type { Session, User } from '@supabase/supabase-js';

type AppRole = 'owner' | 'admin' | 'courier' | 'office';

interface AuthState {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  loading: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isCourier: boolean;
  isOffice: boolean;
  isOwnerOrAdmin: boolean;
  login: (password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const AUTH_DEBUG_STORAGE_KEY = 'black-horse-auth-debug';

function codeToEmail(code: string) {
  return code.replace(/@/g, '_at_').replace(/[^a-zA-Z0-9._-]/g, '_') + '@modex.ship';
}

function persistAuthDebug(event: string, details: Record<string, unknown> = {}) {
  const entry = {
    event,
    at: new Date().toISOString(),
    ...details,
  };

  try {
    const raw = window.localStorage.getItem(AUTH_DEBUG_STORAGE_KEY);
    const existing = raw ? JSON.parse(raw) : [];
    const next = [entry, ...(Array.isArray(existing) ? existing : [])].slice(0, 50);
    window.localStorage.setItem(AUTH_DEBUG_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore localStorage parsing issues
  }

  console.info('[auth-debug]', entry);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const roleRequestRef = useRef(0);
  const authEventVersionRef = useRef(0);
  const bootstrappedRef = useRef(false);

  const fetchRoles = async (userId: string): Promise<AppRole[]> => {
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);
      return (data?.map((r) => r.role as AppRole)) || [];
    } catch (error) {
      persistAuthDebug('roles_fetch_failed', {
        userId,
        message: error instanceof Error ? error.message : 'unknown_error',
      });
      return [];
    }
  };

  useEffect(() => {
    let mounted = true;

    const applySignedOutState = (source: string) => {
      roleRequestRef.current += 1;
      bootstrappedRef.current = true;
      persistAuthDebug('signed_out_state_applied', { source });
      setSession(null);
      setUser(null);
      setRoles([]);
      setLoading(false);
    };

    const syncRoles = (userId: string, source: string) => {
      const requestId = ++roleRequestRef.current;
      setLoading(true);
      persistAuthDebug('roles_sync_started', { userId, source, requestId });

      window.setTimeout(() => {
        void fetchRoles(userId)
          .then((userRoles) => {
            if (!mounted || roleRequestRef.current !== requestId) return;
            persistAuthDebug('roles_sync_completed', {
              userId,
              source,
              requestId,
              roles: userRoles,
            });
            setRoles(userRoles);
          })
          .finally(() => {
            if (!mounted || roleRequestRef.current !== requestId) return;
            bootstrappedRef.current = true;
            setLoading(false);
          });
      }, 0);
    };

    const handleSession = (sess: Session | null, shouldRefreshRoles = true, source = 'unknown') => {
      bootstrappedRef.current = true;
      persistAuthDebug('session_handled', {
        source,
        shouldRefreshRoles,
        hasSession: Boolean(sess),
        userId: sess?.user?.id ?? null,
      });
      setSession(sess);
      setUser(sess?.user ?? null);

      if (!sess?.user) {
        applySignedOutState(source);
        return;
      }

      if (shouldRefreshRoles) {
        syncRoles(sess.user.id, source);
      } else {
        setLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event !== 'INITIAL_SESSION') {
        authEventVersionRef.current += 1;
      }

      persistAuthDebug('auth_state_change', {
        event,
        version: authEventVersionRef.current,
        hasSession: Boolean(sess),
        userId: sess?.user?.id ?? null,
      });

      if (!mounted) return;

      if (event === 'SIGNED_OUT') {
        applySignedOutState(event);
        return;
      }

      if (event === 'TOKEN_REFRESHED') {
        handleSession(sess, false, event);
        return;
      }

      if (event === 'SIGNED_IN') {
        void logActivity('auth_signed_in', {
          user_id: sess?.user?.id ?? null,
          email: sess?.user?.email ?? null,
        });
      }

      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
        handleSession(sess, true, event);
      }
    });

    const initialVersion = authEventVersionRef.current;

    void supabase.auth.getSession()
      .then(({ data: { session: sess } }) => {
        if (!mounted) return;

        if (authEventVersionRef.current !== initialVersion) {
          persistAuthDebug('get_session_ignored_as_stale', {
            initialVersion,
            currentVersion: authEventVersionRef.current,
            hasSession: Boolean(sess),
            userId: sess?.user?.id ?? null,
          });
          return;
        }

        persistAuthDebug('get_session_resolved', {
          hasSession: Boolean(sess),
          userId: sess?.user?.id ?? null,
        });
        handleSession(sess ?? null, true, 'getSession');
      })
      .catch((error) => {
        if (!mounted) return;
        persistAuthDebug('get_session_failed', {
          message: error instanceof Error ? error.message : 'unknown_error',
        });
        applySignedOutState('getSessionError');
      });

    const timeout = window.setTimeout(() => {
      if (mounted && !bootstrappedRef.current) {
        persistAuthDebug('auth_bootstrap_timeout');
        setLoading(false);
      }
    }, 8000);

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const login = async (password: string): Promise<{ error?: string }> => {
    try {
      persistAuthDebug('login_attempt', { passwordLength: password.length });
      const email = codeToEmail(password);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        persistAuthDebug('login_failed', { message: error.message });
        return { error: 'كلمة المرور غير صحيحة' };
      }
      persistAuthDebug('login_submitted', {
        userId: data.user?.id ?? null,
        email: data.user?.email ?? null,
      });
      return {};
    } catch (error) {
      persistAuthDebug('login_exception', {
        message: error instanceof Error ? error.message : 'unknown_error',
      });
      return { error: 'خطأ في الاتصال بالخادم' };
    }
  };

  const logout = async () => {
    persistAuthDebug('logout_requested', { userId: user?.id ?? null });
    void logActivity('auth_logout_requested', {
      user_id: user?.id ?? null,
      email: user?.email ?? null,
    });
    roleRequestRef.current += 1;
    setLoading(true);

    const { error } = await supabase.auth.signOut();
    if (error) {
      persistAuthDebug('logout_failed', { message: error.message });
      setLoading(false);
    }
  };

  const isOwner = roles.includes('owner');
  const isAdmin = roles.includes('admin');
  const isCourier = roles.includes('courier');
  const isOffice = roles.includes('office');
  const isOwnerOrAdmin = isOwner || isAdmin;

  return (
    <AuthContext.Provider value={{
      session, user, roles, loading,
      isOwner, isAdmin, isCourier, isOffice, isOwnerOrAdmin,
      login, logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

