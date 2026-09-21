import { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type Profile = { id: string; user_id: string; full_name: string; discipline: 'Kyorugi' | 'Poomsae' | null; [key: string]: unknown };
type AuthValue = { session: Session | null; profile: Profile | null; loading: boolean; profileLoading: boolean; refreshProfile: () => Promise<void>; signOut: () => Promise<void> };
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const loadProfile = async (userId: string) => {
    setProfileLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle();
    setProfile(!error && data ? data as Profile : null);
    setProfileLoading(false);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session) void loadProfile(data.session.user.id);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) void loadProfile(next.user.id); else setProfile(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{
    session, profile, loading, profileLoading,
    refreshProfile: async () => session ? loadProfile(session.user.id) : undefined,
    signOut: async () => { await supabase.auth.signOut(); },
  }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
