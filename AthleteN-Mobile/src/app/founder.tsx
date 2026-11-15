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

const PRODUCT_MODULES = [
  { group: 'ATHLETE WORKSPACE', title: 'Athlete dashboard & profile', description: 'Sporting identity, profile details and athlete overview.', route: '/' },
  { group: 'ATHLETE WORKSPACE', title: 'Taekwondo hub', description: 'Kyorugi, Poomsae and discipline-specific athlete records.', route: '/taekwondo' },
  { group: 'ATHLETE WORKSPACE', title: 'Training & training plans', description: 'Sessions, history, plans and progress tracking.', route: '/training' },
  { group: 'ATHLETE WORKSPACE', title: 'Calendar & reminders', description: 'Month calendar, date markers, event details and reminders.', route: '/calendar' },
  { group: 'ATHLETE WORKSPACE', title: 'Competition & match records', description: 'Tournaments, match results and competition preparation.', route: '/compete' },
  { group: 'ATHLETE WORKSPACE', title: 'Medals & certificates', description: 'Achievement records and sporting certificates.', route: '/medals' },
  { group: 'ATHLETE WORKSPACE', title: 'Attendance', description: 'Training attendance and participation history.', route: '/attendance' },
  { group: 'ATHLETE WORKSPACE', title: 'Weight & performance records', description: 'Athlete performance logs and weight history.', route: '/weight' },
  { group: 'ATHLETE WORKSPACE', title: 'Goals & athlete journey', description: 'Milestones, progress and personal sporting journey.', route: '/athlete-journey' },
  { group: 'ATHLETE WORKSPACE', title: 'Documents & athlete passport', description: 'Private records, documents and athlete identity passport.', route: '/athlete-passport' },
  { group: 'ATHLETE WORKSPACE', title: 'Competition checklist', description: 'Equipment and competition preparation checklist.', route: '/checklist' },
  { group: 'TEAM & COMMUNICATION', title: 'Coach & Academy connections', description: 'Connect using typed Coach or Academy codes.', route: '/team' },
  { group: 'TEAM & COMMUNICATION', title: 'Coach workspace', description: 'Coach roster, athlete oversight and training tools; role-gated.', route: '/coach-athletes' },
  { group: 'TEAM & COMMUNICATION', title: 'Academy workspace', description: 'Academy members, coaches and operations; role-gated.', route: '/academy' },
  { group: 'TEAM & COMMUNICATION', title: 'Messages & groups', description: 'Direct messages, group conversations and delivery receipts.', route: '/messages' },
  { group: 'TEAM & COMMUNICATION', title: 'Notifications', description: 'In-app alerts, push notifications and preferences.', route: '/notifications' },
  { group: 'TOOLS & INSIGHTS', title: 'AI Coach', description: 'AI coaching interface; paid-plan, safety and server-budget gates apply.', route: '/ai-coach' },
  { group: 'TOOLS & INSIGHTS', title: 'Tournament scanner', description: 'Tournament notices and organizer discovery; integration access applies.', route: '/scanner' },
  { group: 'TOOLS & INSIGHTS', title: 'Analytics & intelligence reports', description: 'Performance analytics and subscription-gated intelligence reports.', route: '/analytics' },
  { group: 'TOOLS & INSIGHTS', title: 'Nutrition & hydration', description: 'Nutrition and hydration logs with applicable coach controls.', route: '/nutrition' },
  { group: 'TOOLS & INSIGHTS', title: 'Competition mode & missions', description: 'Competition preparation tools and athlete missions.', route: '/competition-mode' },
  { group: 'TOOLS & INSIGHTS', title: 'Badges & achievements', description: 'Badge collection and achievement history.', route: '/badges' },
  { group: 'COMMUNITY & ACCOUNT', title: 'Plans & subscriptions', description: 'Plan comparison, billing status and usage overview.', route: '/plans' },
  { group: 'COMMUNITY & ACCOUNT', title: 'Verification & parent approval', description: 'Account trust, age verification and guardian approval workflows.', route: '/verification' },
  { group: 'COMMUNITY & ACCOUNT', title: 'Support centre', description: 'Private support tickets and account help.', route: '/support' },
  { group: 'COMMUNITY & ACCOUNT', title: 'Feedback & roadmap', description: 'Product suggestions, roadmap status and votes.', route: '/roadmap' },
  { group: 'FOUNDER & PLATFORM OPERATIONS', title: 'Owner Command Center', description: 'Full admin resource catalogue across platform data and operations.', route: '/admin' },
  { group: 'FOUNDER & PLATFORM OPERATIONS', title: 'User, role & entitlement management', description: 'User lookup, approved plan assignment and privileged role controls.', route: '/admin-panel' },
  { group: 'FOUNDER & PLATFORM OPERATIONS', title: 'Badge administration', description: 'Award eligible badges and inspect permanent system awards.', route: '/admin-badges' },
  { group: 'FOUNDER & PLATFORM OPERATIONS', title: 'Support operations', description: 'Review, assign and resolve user support cases.', route: '/admin-support' },
  { group: 'FOUNDER & PLATFORM OPERATIONS', title: 'Android release control', description: 'Publish signed APK releases and manage update delivery.', route: '/admin-releases' },
];
const EMPTY_STATS = {
  users: 0, athletes: 0, coaches: 0, academies: 0, admins: 0,
  founders: 0, paidSubscriptions: 0, openTickets: 0, pendingPayments: 0, announcements: 0,
};

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
  const [health, setHealth] = useState('CHECKING');
  const [showAllModules, setShowAllModules] = useState(false);

  const load = useCallback(async () => {
    if (!allowed || !session || !supabase) return;
    setRefreshing(true);
    setMessage('');
    setHealth('CHECKING');
    try {
      const count = async (query) => {
        const result = await query;
        return { count: result.count ?? 0, error: result.error };
      };
      const now = new Date().toISOString();
      const [
        users, athletes, coaches, admins, founders, academies,
        paidSubscriptions, openTickets, pendingPayments, announcements,
        flagsResult, releaseResult, auditResult,
      ] = await Promise.all([
        count(supabase.from('profiles').select('user_id', { count: 'exact', head: true })),
        count(supabase.from('profiles').select('user_id', { count: 'exact', head: true }).eq('role', 'athlete')),
        count(supabase.from('profiles').select('user_id', { count: 'exact', head: true }).eq('role', 'coach')),
        count(supabase.from('profiles').select('user_id', { count: 'exact', head: true }).in('role', ['support_admin', 'admin', 'super_admin'])),
        count(supabase.from('profiles').select('user_id', { count: 'exact', head: true }).eq('founder_badge', true)),
        count(supabase.from('academies').select('id', { count: 'exact', head: true }).eq('status', 'active')),
        count(supabase.from('subscriptions').select('id', { count: 'exact', head: true })
          .in('status', ['active', 'trialing']).neq('plan_id', 'free')
          .or('current_period_end.is.null,current_period_end.gt.' + now)),
        count(supabase.from('support_tickets').select('id', { count: 'exact', head: true }).not('status', 'in', '(resolved,closed)')),
        count(supabase.from('payment_orders').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
        count(supabase.from('announcements').select('id', { count: 'exact', head: true }).not('published_at', 'is', null)),
        supabase.from('feature_flags').select('id,flag_key,description,enabled,audience').order('flag_key'),
        supabase.from('mobile_app_releases').select('version,version_code,minimum_version_code,published,updated_at').eq('id', true).maybeSingle(),
        supabase.from('audit_logs').select('id,action,entity_table,created_at').order('created_at', { ascending: false }).limit(10),
      ]);

      const countResults = [users, athletes, coaches, admins, founders, academies, paidSubscriptions, openTickets, pendingPayments, announcements];
      const failed = [
        ...countResults.filter((result) => result.error),
        ...[flagsResult, releaseResult, auditResult].filter((result) => result.error),
      ];
      setStats({
        users: users.count,
        athletes: athletes.count,
        coaches: coaches.count,
        academies: academies.count,
        admins: admins.count,
        founders: founders.count,
        paidSubscriptions: paidSubscriptions.count,
        openTickets: openTickets.count,
        pendingPayments: pendingPayments.count,
        announcements: announcements.count,
      });
      setFlags(flagsResult.data || []);
      setRelease(releaseResult.data || null);
      setAudits(auditResult.data || []);
      setHealth(failed.length ? 'PARTIAL DATA' : 'CONNECTED');
      if (failed.length) setMessage(failed.map((result) => result.error?.message).filter(Boolean).join(' · '));
    } catch (error) {
      setHealth('OFFLINE');
      setMessage(error instanceof Error ? error.message : 'Founder data could not be refreshed.');
    } finally {
      setRefreshing(false);
    }
  }, [allowed, session?.user.id]);

  useEffect(() => { void load(); }, [load]);

  if (!allowed) {
    return <SafeAreaView style={s.screen}><View style={s.denied}>
      <Icon name="shield" size={28} color={c.danger}/>
      <Text style={s.title}>Founder access required</Text>
      <Text style={s.body}>This workspace is available only to the authenticated Super Admin role.</Text>
      <Pressable onPress={() => router.replace('/')} style={s.secondary}><Text style={s.secondaryText}>BACK TO ATHLETEN</Text></Pressable>
    </View></SafeAreaView>;
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
            <Text style={s.body}>Platform-wide oversight, operational controls and release management.</Text>
          </View>
        </View>

        <View style={s.banner}>
          <View style={s.healthRow}>
            <View style={[s.healthDot, health === 'CONNECTED' ? s.healthGood : s.healthWarning]}/>
            <Text style={s.bannerTitle}>PLATFORM DATA · {health}</Text>
          </View>
          <Text style={s.bannerText}>Founder privileges are verified against your Super Admin role. Mutations continue to use their existing protected admin routes and database permissions.</Text>
        </View>

        <Text style={s.section}>PLATFORM OVERVIEW</Text>
        <View style={s.grid}>
          <Stat label="TOTAL ACCOUNTS" value={stats.users}/>
          <Stat label="ATHLETES" value={stats.athletes}/>
          <Stat label="COACHES" value={stats.coaches}/>
          <Stat label="ACTIVE ACADEMIES" value={stats.academies}/>
          <Stat label="ADMIN ACCOUNTS" value={stats.admins}/>
          <Stat label="FOUNDING MEMBERS" value={stats.founders}/>
          <Stat label="PAID SUBSCRIPTIONS" value={stats.paidSubscriptions}/>
          <Stat label="OPEN SUPPORT TICKETS" value={stats.openTickets}/>
          <Stat label="PENDING PAYMENTS" value={stats.pendingPayments}/>
          <Stat label="PUBLISHED ANNOUNCEMENTS" value={stats.announcements}/>
          <Stat label="IMPLEMENTED MODULES" value={PRODUCT_MODULES.length}/>
        </View>

        <View style={s.panel}>
          <View style={s.sectionRow}>
            <Text style={s.section}>ANDROID RELEASE STATUS</Text>
            <View style={[s.pill, release?.published && s.pillOn]}><Text style={s.pillText}>{release?.published ? 'LIVE' : 'NO RELEASE'}</Text></View>
          </View>
          {release?.published ? <>
            <Text style={s.releaseTitle}>AthleteN {release.version}</Text>
            <Text style={s.meta}>Build {release.version_code} · Minimum supported build {release.minimum_version_code}</Text>
            <Text style={s.meta}>Published {new Date(release.updated_at).toLocaleString()}</Text>
          </> : <Text style={s.body}>No Android release is currently published. Publish the signed APK from Android Release Control when the build is ready.</Text>}
          <Action title="Android Release Control" description="Upload and publish a signed APK from this phone." icon="upload" onPress={() => router.push('/admin-releases')}/>
        </View>

        <View style={s.panel}>
          <Text style={s.section}>FOUNDER COMMAND</Text>
          <Action title="Owner Command Center" description="Manage the full operational resource catalogue, athlete data, subscriptions, payments, announcements and system records." icon="dashboard" onPress={() => router.push('/admin')}/>
          <Action title="Super Admin Dashboard" description="Manage accounts, usernames, plans, privileged roles, feature flags and audit history." icon="settings" onPress={() => router.push('/admin-panel')}/>
          <Action title="Support Workspace" description="Review, assign, reply to, resolve and close support tickets." icon="message" onPress={() => router.push('/admin-support')}/>
          <Action title="Badge Control" description="Award eligible badges and review permanent system awards." icon="medal" onPress={() => router.push('/admin-badges')}/>
        </View>

        <View style={s.panel}>
          <Text style={s.section}>PLATFORM DOMAINS</Text>
          <Text style={s.body}>Use the Owner Command Center to reach the platform's existing data and operations areas. Each record is still governed by its database permissions.</Text>
          <Domain title="Accounts & roles" description="Profiles, academy workspaces, memberships, coach seats and coach-athlete relationships."/>
          <Domain title="Athlete operations" description="Training, plans, attendance, weight logs, goals, injuries, documents and calendar records."/>
          <Domain title="Competition" description="Tournaments, matches, medals, certificates, checklists, Kyorugi and Poomsae records."/>
          <Domain title="Trust & safety" description="Student verification, age-verification review, coach approvals and privileged access controls."/>
          <Domain title="Subscriptions & payments" description="Plan entitlements, subscriptions, usage, payment orders and payment events."/>
          <Domain title="Messaging & support" description="Conversations, members, message reports, blocks, support tickets and notifications."/>
          <Domain title="Product & growth" description="Feature flags, roadmap, votes, referrals, badges and tournament scans."/>
          <Domain title="System operations" description="Announcements, reserved usernames, audit history and mobile release control."/>
          <Pressable onPress={() => router.push('/admin')} style={s.fullCommand}><Text style={s.fullCommandText}>OPEN ALL ADMIN RESOURCES</Text><Icon name="arrow" size={16} color={c.accentBright}/></Pressable>
        </View>

        <View style={s.panel}>
          <View style={s.sectionRow}>
            <Text style={s.section}>IMPLEMENTED PRODUCT MODULES</Text>
            <Text style={s.flagSummary}>{PRODUCT_MODULES.length} BUILT IN</Text>
          </View>
          <Text style={s.body}>This inventory counts product modules present in the app, not database feature-flag records. Access to individual modules still follows account role, age approval, subscription and integration requirements.</Text>
          {PRODUCT_MODULES.slice(0, showAllModules ? PRODUCT_MODULES.length : 10).map((module, index) => (
            <View key={module.title} style={s.moduleRow}>
              <View style={s.moduleNumber}><Text style={s.moduleNumberText}>{String(index + 1).padStart(2, '0')}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                {index === 0 || PRODUCT_MODULES[index - 1].group !== module.group
                  ? <Text style={s.moduleGroup}>{module.group}</Text>
                  : null}
                <Text style={s.cardTitle}>{module.title}</Text>
                <Text style={s.meta}>{module.description}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + module.title} onPress={() => router.push(module.route)} style={s.moduleOpen}>
                <Icon name="arrow" size={15} color={c.accentBright}/>
              </Pressable>
            </View>
          ))}
          <Pressable onPress={() => setShowAllModules((value) => !value)} style={s.fullCommand}>
            <Text style={s.fullCommandText}>{showAllModules ? 'SHOW FEWER MODULES' : 'VIEW ALL ' + PRODUCT_MODULES.length + ' MODULES'}</Text>
            <Icon name={showAllModules ? 'chevron-up' : 'chevron-down'} size={16} color={c.accentBright}/>
          </Pressable>
        </View>

        <View style={s.panel}>
          <View style={s.sectionRow}>
            <Text style={s.section}>DATABASE FEATURE FLAGS</Text>
            <Text style={s.flagSummary}>{enabledFlags} ENABLED · {flags.length} CONFIGURED</Text>
          </View>
          <Text style={s.body}>This is a separate operational setting count. The feature_flags table currently contains {flags.length} configured switches; an empty table does not mean AthleteN has zero product features.</Text>
          {flags.length ? flags.map((flag) => (
            <View key={flag.id} style={s.flagRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.flagName}>{flag.flag_key.replace(/_/g, ' ')}</Text>
                <Text style={s.meta}>{flag.description || flag.audience || 'Platform flag'}</Text>
              </View>
              <Text style={[s.flagState, flag.enabled ? s.flagOn : s.flagOff]}>{flag.enabled ? 'ENABLED' : 'DISABLED'}</Text>
            </View>
          )) : <Text style={s.empty}>No configurable flags have been created yet. Product modules continue to run under their plan and role permissions.</Text>}
          <Action title="Manage feature flags" description="Review configured platform flags in the Super Admin Dashboard." icon="settings" onPress={() => router.push('/admin-panel')}/>
        </View>

        <View style={s.panel}>
          <Text style={s.section}>FOUNDER SHORTCUTS</Text>
          <Action title="Analytics & intelligence reports" description="Review analytics and saved report workspaces." icon="dashboard" onPress={() => router.push('/reports')}/>
          <Action title="Product roadmap" description="Review proposals and product progress." icon="dashboard" onPress={() => router.push('/roadmap')}/>
          <Action title="Notifications" description="Review platform and account notification activity." icon="bell" onPress={() => router.push('/notifications')}/>
          <Action title="Messages" description="Open messaging; moderation records remain in Owner Command Center." icon="message" onPress={() => router.push('/messages')}/>
        </View>

        <View style={s.panel}>
          <Text style={s.section}>RECENT PRIVILEGED ACTIVITY</Text>
          {audits.length ? audits.map((entry) => (
            <View key={entry.id} style={s.auditRow}>
              <Text style={s.auditAction}>{entry.action}</Text>
              <Text style={s.meta}>{entry.entity_table} · {new Date(entry.created_at).toLocaleString()}</Text>
            </View>
          )) : <Text style={s.empty}>No recent audit events are visible.</Text>}
          <Action title="Full Audit & Security Records" description="Open the admin data catalogue for available system history." icon="shield" onPress={() => router.push('/admin')}/>
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
function Domain({ title, description }) {
  return <View style={s.domain}><Text style={s.domainTitle}>{title}</Text><Text style={s.meta}>{description}</Text></View>;
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
  banner: { borderWidth: 1, borderColor: c.accent, backgroundColor: c.surface, borderRadius: 16, padding: 14, gap: 7 },
  healthRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  healthDot: { width: 7, height: 7, borderRadius: 4 },
  healthGood: { backgroundColor: c.success },
  healthWarning: { backgroundColor: '#E5B04D' },
  bannerTitle: { color: c.accentBright, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  bannerText: { color: c.muted, fontSize: 10, lineHeight: 15 },
  section: { color: c.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  stat: { width: '48%', minWidth: 130, flexGrow: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderStrong, borderRadius: 16, padding: 13, gap: 9 },
  statLabel: { color: c.muted, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  statValue: { color: c.text, fontSize: 23, fontWeight: '900' },
  panel: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderStrong, borderRadius: 19, padding: 15, gap: 11 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  pill: { borderColor: c.border, borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 },
  pillOn: { borderColor: c.success },
  pillText: { color: c.accentBright, fontSize: 8, fontWeight: '900' },
  releaseTitle: { color: c.text, fontSize: 17, fontWeight: '900' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 11 },
  actionIcon: { width: 37, height: 37, borderRadius: 12, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: c.text, fontSize: 12, fontWeight: '900' },
  meta: { color: c.muted, fontSize: 9, lineHeight: 14, marginTop: 2 },
  domain: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10, gap: 3 },
  moduleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 },
  moduleNumber: { width: 30, height: 30, borderRadius: 10, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
  moduleNumberText: { color: c.accentBright, fontSize: 9, fontWeight: '900' },
  moduleGroup: { color: c.accentBright, fontSize: 7, fontWeight: '900', letterSpacing: 1.1, marginBottom: 4 },
  moduleOpen: { width: 32, height: 32, borderRadius: 10, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' },
  domainTitle: { color: c.text, fontSize: 10, fontWeight: '900' },
  fullCommand: { minHeight: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 },
  fullCommandText: { color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  flagSummary: { color: c.accentBright, fontSize: 8, fontWeight: '900' },
  flagRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 },
  flagName: { color: c.text, fontSize: 10, fontWeight: '800', flex: 1, textTransform: 'capitalize' },
  flagState: { fontSize: 8, fontWeight: '900' },
  flagOn: { color: c.success },
  flagOff: { color: c.muted },
  empty: { color: c.muted, fontSize: 10, lineHeight: 15 },
  auditRow: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10, gap: 3 },
  auditAction: { color: c.text, fontSize: 10, fontWeight: '900' },
  refreshButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: c.borderStrong, borderRadius: 12 },
  refreshText: { color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  message: { color: c.accentBright, fontSize: 10, lineHeight: 15 },
  denied: { flex: 1, backgroundColor: c.background, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  secondary: { borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 12 },
  secondaryText: { color: c.accentBright, fontSize: 9, fontWeight: '900' },
});