import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { attachNotificationListeners, registerForPushNotifications, unregisterPushNotifications } from '@/lib/push-notifications';
import { refreshAthleteWidgets } from '@/lib/widget-refresh';

type Profile = { id: string; user_id: string; full_name: string; sport?: 'taekwondo' | null; discipline: 'kyorugi' | 'poomsae' | null; [key: string]: unknown };
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
  // Ignore profile/bootstrap responses that belong to an earlier account or auth event.
  const profileRequestVersion = useRef(0);
  const authEventVersion = useRef(0);
  const activeProfileUserId = useRef<string | null>(null);

  const loadProfile = async (userId: string) => {
    const requestVersion = ++profileRequestVersion.current;
    if (activeProfileUserId.current !== userId) {
      activeProfileUserId.current = userId;
      setProfile(null);
    }
    setProfileLoading(true);
    try {
      const result = await withTimeout(
        supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
        10000,
        'Profile request timed out. Check your network and Supabase configuration.'
      );
      if (result.error) throw result.error;
      if (requestVersion !== profileRequestVersion.current || activeProfileUserId.current !== userId) return;
      setProfile(result.data ? result.data as Profile : null);
      setAuthError(null);
    } catch (error) {
      if (requestVersion !== profileRequestVersion.current || activeProfileUserId.current !== userId) return;
      setProfile(null);
      setAuthError(error instanceof Error ? error.message : 'Could not load your AthleteN profile.');
    } finally {
      if (requestVersion === profileRequestVersion.current && activeProfileUserId.current === userId) {
        setProfileLoading(false);
      }
    }
  };

  const bootstrap = async () => {
    const observedAuthEventVersion = authEventVersion.current;
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
      // An auth event (for example, sign-out) wins over a slower getSession call.
      if (authEventVersion.current !== observedAuthEventVersion) return;

      const nextSession = result.data.session;
      const nextUserId = nextSession?.user.id ?? null;
      if (activeProfileUserId.current !== nextUserId) {
        profileRequestVersion.current += 1;
        activeProfileUserId.current = nextUserId;
        setProfile(null);
        setProfileLoading(false);
      }
      setSession(nextSession);
      setLoading(false);
      if (nextSession) await loadProfile(nextSession.user.id);
    } catch (error) {
      if (authEventVersion.current !== observedAuthEventVersion) return;
      profileRequestVersion.current += 1;
      activeProfileUserId.current = null;
      setSession(null);
      setProfile(null);
      setProfileLoading(false);
      setLoading(false);
      setAuthError(error instanceof Error ? error.message : 'Could not connect to AthleteN.');
    }
  };

  useEffect(() => {
    void bootstrap();

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      authEventVersion.current += 1;
      const nextUserId = next?.user.id ?? null;
      if (activeProfileUserId.current !== nextUserId) {
        profileRequestVersion.current += 1;
        activeProfileUserId.current = nextUserId;
        setProfile(null);
        setProfileLoading(false);
      }
      setSession(next);
      setLoading(false);
      if (next) void loadProfile(next.user.id);
      else setAuthError(null);
    });

    return () => {
      authEventVersion.current += 1;
      profileRequestVersion.current += 1;
      activeProfileUserId.current = null;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void refreshAthleteWidgets();
  }, [syncVersion, session?.user.id]);

  useEffect(() => {
    if (!session?.user.id) return;

    const userId = session.user.id;
    const syncPushToken = (requestPermission: boolean) => {
      void registerForPushNotifications(userId, { requestPermission }).catch((error) => {
        console.warn(
          '[AthleteN] push registration failed',
          error instanceof Error ? error.message : 'Unknown error'
        );
      });
    };

    // Ask once during authenticated setup. When the app resumes, only check
    // whether permission is now enabled in system settings.
    syncPushToken(true);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncPushToken(false);
    });

    const removeNotificationListeners = attachNotificationListeners();

    const channel = supabase.channel(`mobile-account-sync-${userId}`);
    const ownedTables = [
      'training_sessions', 'training_plans', 'tournaments', 'matches', 'medals',
      'weight_logs', 'goals', 'calendar_events', 'documents', 'notifications',
      'competition_checklists', 'attendance_records', 'certificates', 'injuries',
      'tournament_scans', 'athlete_badges', 'subscriptions',
      'account_entitlements', 'taekwondo_training_logs',
      'taekwondo_kyorugi_bouts', 'taekwondo_poomsae_performances'
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
      appStateSubscription.remove();
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
      signOut: async () => {
        const userId = session?.user.id;
        // Best-effort token cleanup prevents a shared device receiving alerts
        // for the previous account after sign-out. Bound the wait so a slow
        // device-token request cannot keep the user inside the old account.
        if (userId) {
          try {
            await withTimeout(
              unregisterPushNotifications(userId),
              2500,
              'Push-token cleanup timed out.'
            );
          } catch {
            // Never block account sign-out on best-effort notification cleanup.
          }
        }
        const { error } = await supabase.auth.signOut();
        if (error) throw error;

        // Supabase normally emits SIGNED_OUT through onAuthStateChange. Clear
        // the in-memory session explicitly as an idempotent fallback, and
        // invalidate any profile/bootstrap response still in flight.
        authEventVersion.current += 1;
        profileRequestVersion.current += 1;
        activeProfileUserId.current = null;
        setSession(null);
        setProfile(null);
        setProfileLoading(false);
        setLoading(false);
        setAuthError(null);
      },
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
