import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Screen, Header, Section, Card, c } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type Membership = { group_id: string; status: string };
type Group = { id: string; name: string };
type Session = {
  id: string;
  group_id: string;
  session_date: string;
  start_time: string | null;
  title: string;
  status: string;
};
type Attendance = {
  session_id: string;
  status: 'present' | 'late' | 'absent' | 'excused';
};

const statusColor: Record<string, string> = {
  present: c.success,
  late: c.warning,
  absent: c.danger,
  excused: c.muted,
};

export default function AttendanceScreen() {
  const { session } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [attendance, setAttendance] = useState<Record<string, Attendance['status']>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    setError(null);
    try {
      const uid = session.user.id;
      const membershipResult = await supabase
        .from('training_group_members')
        .select('group_id,status')
        .eq('athlete_user_id', uid)
        .eq('status', 'active');

      if (membershipResult.error) throw membershipResult.error;
      const memberships = (membershipResult.data || []) as Membership[];
      const groupIds = memberships.map((x) => x.group_id);

      if (!groupIds.length) {
        setGroups([]);
        setSessions([]);
        setAttendance({});
        return;
      }

      const [groupsResult, sessionsResult] = await Promise.all([
        supabase.from('training_groups').select('id,name').in('id', groupIds),
        supabase
          .from('training_group_sessions')
          .select('id,group_id,session_date,start_time,title,status')
          .in('group_id', groupIds)
          .lte('session_date', new Date().toISOString().slice(0, 10))
          .neq('status', 'cancelled')
          .order('session_date', { ascending: false })
          .limit(200),
      ]);

      if (groupsResult.error) throw groupsResult.error;
      if (sessionsResult.error) throw sessionsResult.error;

      const nextGroups = (groupsResult.data || []) as Group[];
      const nextSessions = (sessionsResult.data || []) as Session[];
      setGroups(nextGroups);
      setSessions(nextSessions);

      if (!nextSessions.length) {
        setAttendance({});
        return;
      }

      const attendanceResult = await supabase
        .from('training_group_attendance')
        .select('session_id,status')
        .eq('athlete_user_id', uid)
        .in('session_id', nextSessions.map((x) => x.id));

      if (attendanceResult.error) throw attendanceResult.error;

      const map: Record<string, Attendance['status']> = {};
      for (const row of (attendanceResult.data || []) as Attendance[]) {
        map[row.session_id] = row.status;
      }
      setAttendance(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load attendance.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session?.user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const values = sessions.map((s) => attendance[s.id]).filter(Boolean) as Attendance['status'][];
    const present = values.filter((x) => x === 'present').length;
    const late = values.filter((x) => x === 'late').length;
    const absent = values.filter((x) => x === 'absent').length;
    const excused = values.filter((x) => x === 'excused').length;
    const tracked = values.length;
    const attended = present + late;
    const percentage = tracked ? Math.round((attended / tracked) * 100) : 0;
    const unmarked = Math.max(0, sessions.length - tracked);
    return { present, late, absent, excused, tracked, attended, percentage, unmarked };
  }, [sessions, attendance]);

  const groupName = useMemo(() => {
    const map = new Map(groups.map((g) => [g.id, g.name]));
    return map;
  }, [groups]);

  return (
    <Screen scroll={false}>
      <Header
        back
        eyebrow="ATHLETEN CENTER"
        title="Attendance"
        subtitle="Your saved training attendance across linked coach groups."
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={c.accentBright}
          />
        }
        contentContainerStyle={{ gap: 14, paddingBottom: 50 }}
      >
        {loading ? (
          <Card>
            <ActivityIndicator color={c.accentBright} />
            <Text style={{ color: c.muted, fontSize: 10 }}>Loading attendance…</Text>
          </Card>
        ) : error ? (
          <Card>
            <Text style={{ color: c.danger, fontWeight: '900' }}>Attendance could not be loaded</Text>
            <Text style={{ color: c.muted, fontSize: 10, lineHeight: 16 }}>{error}</Text>
            <Pressable onPress={() => void load()} style={{ paddingVertical: 8 }}>
              <Text style={{ color: c.accentBright, fontWeight: '900', fontSize: 10 }}>RETRY</Text>
            </Pressable>
          </Card>
        ) : !groups.length ? (
          <Card accent>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '900' }}>No linked training group</Text>
            <Text style={{ color: c.muted, fontSize: 10, lineHeight: 16 }}>
              Connect with your coach first. Attendance will appear here once your coach adds you to a training group.
            </Text>
          </Card>
        ) : (
          <>
            <Section title="ATTENDANCE SUMMARY">
              <Card accent>
                <Text style={{ color: c.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 }}>ATTENDANCE PERCENTAGE</Text>
                <Text style={{ color: c.text, fontSize: 42, fontWeight: '900' }}>{stats.percentage}%</Text>
                <Text style={{ color: c.muted, fontSize: 10 }}>
                  {stats.attended} attended of {stats.tracked} tracked sessions
                  {stats.unmarked ? ` · ${stats.unmarked} not marked yet` : ''}
                </Text>
              </Card>
            </Section>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
              <Stat label="PRESENT" value={stats.present} color={c.success} />
              <Stat label="LATE" value={stats.late} color={c.warning} />
              <Stat label="ABSENT" value={stats.absent} color={c.danger} />
              <Stat label="EXCUSED" value={stats.excused} color={c.muted} />
            </View>

            <Section title="ATTENDANCE HISTORY">
              {sessions.length ? sessions.map((item) => {
                const value = attendance[item.id];
                const color = value ? statusColor[value] : c.muted;
                return (
                  <Card key={item.id}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: c.accentBright, fontSize: 12, fontWeight: '900' }}>
                          {new Date(`${item.session_date}T12:00:00`).getDate()}
                        </Text>
                        <Text style={{ color: c.muted, fontSize: 7, fontWeight: '900' }}>
                          {new Date(`${item.session_date}T12:00:00`).toLocaleString(undefined, { month: 'short' }).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: c.text, fontWeight: '900' }} numberOfLines={1}>{item.title}</Text>
                        <Text style={{ color: c.muted, fontSize: 9, marginTop: 3 }} numberOfLines={1}>
                          {groupName.get(item.group_id) || 'Training group'}{item.start_time ? ` · ${item.start_time.slice(0, 5)}` : ''}
                        </Text>
                      </View>
                      <Text style={{ color, fontSize: 9, fontWeight: '900' }}>
                        {(value || 'not marked').toUpperCase()}
                      </Text>
                    </View>
                  </Card>
                );
              }) : (
                <Card><Text style={{ color: c.muted }}>No completed sessions yet.</Text></Card>
              )}
            </Section>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ width: '48%', minHeight: 82, backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border, borderRadius: 17, padding: 13, justifyContent: 'space-between' }}>
      <Text style={{ color: c.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1 }}>{label}</Text>
      <Text style={{ color, fontSize: 24, fontWeight: '900' }}>{value}</Text>
    </View>
  );
}
