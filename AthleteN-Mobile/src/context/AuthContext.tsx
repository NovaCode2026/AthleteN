import { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { attachNotificationListeners, registerForPushNotifications } from '@/lib/push-notifications';

type Profile = { id: string; user_id: string; full_name: string; discipline: 'Kyorugi' | 'Poomsae' | null; [key: string]: unknown };
type AuthValue = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  authError: string | null;
  syncVersion: number;
  retry: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

const withTimeout = <T,>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> =>
  Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncVersion, setSyncVersion] = useState(0);

  const loadProfile = async (userId: string) => {
    setProfileLoading(true);
    try {
      const result = await withTimeout(
        supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
        10000,
        'Profile request timed out. Check your network and Supabase configuration.'
      );
      if (result.error) throw result.error;
      setProfile(result.data ? result.data as Profile : null);
      setAuthError(null);
    } catch (error) {
      setProfile(null);
      setAuthError(error instanceof Error ? error.message : 'Could not load your AthleteN profile.');
    } finally {
      setProfileLoading(false);
    }
  };

  const bootstrap = async () => {
    setLoading(true);
    setAuthError(null);

    if (!isSupabaseConfigured) {
      setLoading(false);
      setAuthError('Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_ANON_KEY to AthleteN-Mobile/.env and restart Expo.');
      return;
    }

    try {
      const result = await withTimeout(
        supabase.auth.getSession(),
        10000,
        'Supabase auth request timed out. Check your internet connection.'
      );
      if (result.error) throw result.error;

      const nextSession = result.data.session;
      setSession(nextSession);
      setLoading(false);
      if (nextSession) await loadProfile(nextSession.user.id);
    } catch (error) {
      setSession(null);
      setProfile(null);
      setLoading(false);
      setAuthError(error instanceof Error ? error.message : 'Could not connect to AthleteN.');
    }
  };

  useEffect(() => {
    void bootstrap();

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) void loadProfile(next.user.id);
      else setProfile(null);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user.id) return;

    const userId = session.user.id;
    void registerForPushNotifications(userId).catch(() => undefined);
    const removeNotificationListeners = attachNotificationListeners();

    const channel = supabase.channel(`mobile-account-sync-${userId}`);
    const ownedTables = [
      'training_sessions', 'training_plans', 'tournaments', 'matches', 'medals',
      'weight_logs', 'goals', 'calendar_events', 'documents', 'notifications',
      'competition_checklists', 'attendance_records', 'certificates', 'injuries',
      'tournament_scans', 'athlete_badges', 'messages', 'taekwondo_kyorugi_bouts',
      'taekwondo_poomsae_performances', 'taekwondo_training_logs',
      'athlete_seasons', 'competition_journals', 'fight_iq_entries',
      'technique_progress', 'athlete_challenges', 'personal_records',
      'athlete_milestones', 'athlete_timeline_events', 'subscriptions',
      'account_entitlements'
    ];
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'profiles', filter: `user_id=eq.${userId}` },
      () => { void loadProfile(userId); setSyncVersion((version) => version + 1); }
    );
    for (const table of ownedTables) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
        () => {
          setSyncVersion((version) => version + 1);
          if (table === 'subscriptions' || table === 'account_entitlements') void loadProfile(userId);
        }
      );
    }
    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
      removeNotificationListeners?.();
    };
  }, [session?.user.id]);

  return (
    <AuthContext.Provider value={{
      session,
      profile,
      loading,
      profileLoading,
      authError,
      syncVersion,
      retry: bootstrap,
      refreshProfile: async () => session ? loadProfile(session.user.id) : undefined,
      signOut: async () => { await supabase.auth.signOut(); },
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
