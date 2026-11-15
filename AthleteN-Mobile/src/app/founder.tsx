// @ts-nocheck
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Icon } from '@/components/mobile-ui';

const c = Colors.dark;
const EMPTY_STATS = { users: 0, athletes: 0, coaches: 0, academies: 0, founders: 0 };

export default function FounderWorkspaceScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const allowed = profile?.role === 'super_admin';
  const [stats, setStats] = useState(EMPTY_STATS);
  const [flags, setFlags] = useState([]);
  const [release, setRelease] = useState(null);
  const [audits, setAudits] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!allowed || !session) return;
    setRefreshing(true);
    setMessage('');
    try {
      const [users, athletes, coaches, academies, founders, featureFlags, liveRelease, audit] = await Promise.all([
        supabase.from('profiles').select('user_id', { count: 'exact', head: true }),
        supabase.from('profiles').select('user_id', { count: 'exact', head: true }).eq('role', 'athlete'),
        supabase.from('profiles').select('user_id', { count: 'exact', head: true }).eq('role', 'coach'),
        supabase.from('profiles').select('user_id', { count: 'exact', head: true }).eq('role', 'academy_admin'),
        supabase.from('profiles').select('user_id', { count: 'exact', head: true }).eq('founder_badge', true),
        supabase.from('feature_flags').select('id,flag_key,enabled').order('flag_key'),
        supabase.from('mobile_app_releases').select('version,version_code,minimum_version_code,published,updated_at').eq('id', true).maybeSingle(),
        supabase.from('audit_logs').select('id,action,entity_table,created_at').order('created_at', { ascending: false }).limit(8),
      ]);
      const firstError = [users, athletes, coaches, academies, founders, featureFlags, liveRelease, audit].find((item) => item.error)?.error;
      if (firstError) setMessage(firstError.message);
      setStats({
        users: users.count || 0,
        athletes: athletes.count || 0,
        coaches: coaches.count || 0,
        academies: academies.count || 0,
        founders: founders.count || 0,
      });
      setFlags(featureFlags.data || []);
      setRelease(liveRelease.data || null);
      setAudits(audit.data || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Founder workspace could not be refreshed.');
    } finally {
      setRefreshing(false);
    }
  }, [allowed, session?.user.id]);

  useEffect(() => { void load(); }, [load]);

  if (!allowed) {
    return <SafeAreaView style={s.screen}><View style={s.denied}><Icon name="shield" size={28} color={c.danger}/><Text style={s.title}>Founder access required</Text><Text style={s.body}>This workspace is available only to the authenticated Super Admin role.</Text><Pressable onPress={() => router.replace('/')} style={s.secondary}><Text style={s.secondaryText}>BACK TO ATHLETEN</Text></Pressable></View></SafeAreaView>;
  }

  const enabledFlags = flags.filter((flag) => flag.enabled).length;

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} tintColor={c.accentBright} />}>
        <Pressable onPress={() => router.back()}><Text style={s.back}>‹ BACK</Text></Pressable>
        <View style={s.heading}>
          <View style={s.brandIcon}><Icon name="shield" size={24} color={c.accentBright}/></View>
          <View style={{ flex: 1 }}>
            <Text style={s.kicker}>NOVACODE · FOUNDER CONTROL</Text>
            <Text style={s.title}>Founder Workspace</Text>
            <Text style={s.body}>Mobile platform oversight and owner controls.</Text>
          </View>
        </View>

        <View style={s.banner}>
          <Text style={s.bannerTitle}>Founder access verified</Text>
          <Text style={s.bannerText}>Your session is authorized by the Super Admin role. Sensitive operations remain protected by Supabase permissions.</Text>
        </View>

        <Text style={s.section}>PLATFORM OVERVIEW</Text>
        <View style={s.grid}>
          <Stat label="TOTAL ACCOUNTS" value={stats.users}/>
          <Stat label="ATHLETES" value={stats.athletes}/>
          <Stat label="COACHES" value={stats.coaches}/>
          <Stat label="ACADEMIES" value={stats.academies}/>
          <Stat label="FOUNDING MEMBERS" value={stats.founders}/>
          <Stat label="LIVE FEATURES" value={enabledFlags + ' / ' + flags.length}/>
        </View>

        <View style={s.panel}>
          <Text style={s.section}>RELEASE STATUS</Text>
          {release?.published ? (
            <>
              <View style={s.releaseRow}>
                <View style={s.liveDot}/>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>Android version {release.version}</Text>
                  <Text style={s.meta}>Build {release.version_code} · Minimum supported build {release.minimum_version_code}</Text>
                </View>
                <Text style={s.liveLabel}>LIVE</Text>
              </View>
              <Text style={s.meta}>Published {new Date(release.updated_at).toLocaleString()}</Text>
            </>
          ) : <Text style={s.body}>No Android release is currently published.</Text>}
          <Text style={s.meta}>Android devices detect new releases automatically. Each device owner must approve the Android installer.</Text>
          <Action title="Android Release Control" description="Upload and publish a signed APK from this phone." icon="upload" onPress={() => router.push('/admin-releases')}/>
        </View>

        <View style={s.panel}>
          <Text style={s.section}>FOUNDER TOOLS</Text>
          <Action title="Super Admin Dashboard" description="Manage accounts, roles, feature flags and audit events." icon="settings" onPress={() => router.push('/admin-panel')}/>
          <Action title="Full Admin Command Center" description="Open the complete operations and data workspace." icon="dashboard" onPress={() => router.push('/admin')}/>
          <Action title="Badge Management" description="Review and award eligible athlete badges." icon="medal" onPress={() => router.push('/admin-badges')}/>
        </View>

        <View style={s.panel}>
          <Text style={s.section}>FEATURE FLAG STATUS</Text>
          {flags.length ? flags.map((flag) => (
            <View key={flag.id} style={s.flagRow}>
              <Text style={s.flagName}>{flag.flag_key.replace(/_/g, ' ')}</Text>
              <Text style={[s.flagState, flag.enabled ? s.flagOn : s.flagOff]}>{flag.enabled ? 'ENABLED' : 'DISABLED'}</Text>
            </View>
          )) : <Text style={s.meta}>No feature flags are available to this account.</Text>}
        </View>

        <View style={s.panel}>
          <Text style={s.section}>RECENT ADMIN ACTIVITY</Text>
          {audits.length ? audits.map((entry) => (
            <View key={entry.id} style={s.auditRow}>
              <Text style={s.auditAction}>{entry.action}</Text>
              <Text style={s.meta}>{entry.entity_table} · {new Date(entry.created_at).toLocaleString()}</Text>
            </View>
          )) : <Text style={s.meta}>No recent audit events are visible.</Text>}
        </View>

        <Pressable onPress={() => void load()} disabled={refreshing} style={s.refreshButton}>
          {refreshing ? <ActivityIndicator color={c.accentBright}/> : <Icon name="refresh" size={15}/>}
          <Text style={s.refreshText}>REFRESH FOUNDER DATA</Text>
        </Pressable>
        {message ? <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }) {
  return <View style={s.stat}><Text style={s.statLabel}>{label}</Text><Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text></View>;
}

function Action({ title, description, icon, onPress }) {
  return <Pressable onPress={onPress} style={s.action}><View style={s.actionIcon}><Icon name={icon} size={18}/></View><View style={{ flex: 1 }}><Text style={s.cardTitle}>{title}</Text><Text style={s.meta}>{description}</Text></View><Icon name="arrow" size={16} color={c.muted}/></Pressable>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  content: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 56, gap: 13 },
  back: { color: c.accentBright, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.accent },
  kicker: { color: c.accentBright, fontSize: 8, fontWeight: '900', letterSpacing: 1.3 },
  title: { color: c.text, fontSize: 25, fontWeight: '900', marginTop: 3 },
  body: { color: c.muted, fontSize: 11, lineHeight: 17 },
  banner: { borderWidth: 1, borderColor: c.accent, backgroundColor: c.surface, borderRadius: 16, padding: 14, gap: 5 },
  bannerTitle: { color: c.accentBright, fontSize: 12, fontWeight: '900' },
  bannerText: { color: c.muted, fontSize: 10, lineHeight: 15 },
  section: { color: c.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  stat: { width: '48%', minWidth: 130, flexGrow: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderStrong, borderRadius: 16, padding: 13, gap: 9 },
  statLabel: { color: c.muted, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  statValue: { color: c.text, fontSize: 23, fontWeight: '900' },
  panel: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderStrong, borderRadius: 19, padding: 15, gap: 11 },
  releaseRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: c.success },
  liveLabel: { color: c.success, fontSize: 9, fontWeight: '900' },
  cardTitle: { color: c.text, fontSize: 12, fontWeight: '900' },
  meta: { color: c.muted, fontSize: 9, lineHeight: 14, marginTop: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 11 },
  actionIcon: { width: 37, height: 37, borderRadius: 12, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
  flagRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 },
  flagName: { color: c.text, fontSize: 10, fontWeight: '800', flex: 1, textTransform: 'capitalize' },
  flagState: { fontSize: 8, fontWeight: '900' },
  flagOn: { color: c.success },
  flagOff: { color: c.muted },
  auditRow: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10, gap: 3 },
  auditAction: { color: c.text, fontSize: 10, fontWeight: '900' },
  refreshButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: c.borderStrong, borderRadius: 12 },
  refreshText: { color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  message: { color: c.accentBright, fontSize: 10, lineHeight: 15 },
  denied: { flex: 1, backgroundColor: c.background, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  secondary: { borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 12 },
  secondaryText: { color: c.accentBright, fontSize: 9, fontWeight: '900' },
});