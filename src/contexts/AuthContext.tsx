import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
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

function codeToEmail(code: string) {
  return code.replace(/@/g, '_at_').replace(/[^a-zA-Z0-9._-]/g, '_') + '@modex.ship';
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

  const fetchRoles = async (userId: string): Promise<AppRole[]> => {
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);
      return (data?.map((r) => r.role as AppRole)) || [];
    } catch {
      return [];
    }
  };

  useEffect(() => {
    let mounted = true;

    const applySignedOutState = () => {
      roleRequestRef.current += 1;
      setSession(null);
      setUser(null);
      setRoles([]);
      setLoading(false);
    };

    const syncRoles = (userId: string) => {
      const requestId = ++roleRequestRef.current;
      setLoading(true);

      window.setTimeout(() => {
        void fetchRoles(userId)
          .then((userRoles) => {
            if (!mounted || roleRequestRef.current !== requestId) return;
            setRoles(userRoles);
          })
          .finally(() => {
            if (!mounted || roleRequestRef.current !== requestId) return;
            setLoading(false);
          });
      }, 0);
    };

    const handleSession = (sess: Session | null, shouldRefreshRoles = true) => {
      setSession(sess);
      setUser(sess?.user ?? null);

      if (!sess?.user) {
        applySignedOutState();
        return;
      }

      if (shouldRefreshRoles) {
        syncRoles(sess.user.id);
      } else {
        setLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT') {
        applySignedOutState();
        return;
      }

      if (event === 'TOKEN_REFRESHED') {
        handleSession(sess, false);
        return;
      }

      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        handleSession(sess, true);
      }
    });

    void supabase.auth.getSession()
      .then(({ data: { session: sess } }) => {
        if (!mounted) return;
        handleSession(sess ?? null, true);
      })
      .catch(() => {
        if (!mounted) return;
        applySignedOutState();
      });

    const timeout = window.setTimeout(() => {
      if (mounted) {
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
      setLoading(true);
      const email = codeToEmail(password);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setLoading(false);
        return { error: 'كلمة المرور غير صحيحة' };
      }
      return {};
    } catch {
      setLoading(false);
      return { error: 'خطأ في الاتصال بالخادم' };
    }
  };

  const logout = async () => {
    roleRequestRef.current += 1;
    setRoles([]);
    setSession(null);
    setUser(null);
    setLoading(false);
    await supabase.auth.signOut();
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

