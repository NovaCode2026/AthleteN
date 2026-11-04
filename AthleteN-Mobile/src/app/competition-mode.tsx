// @ts-nocheck
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Screen, Header, Section, Card, FeatureRow, c, RefreshButton } from '@/components/mobile-ui';

export default function CompetitionMode() {
  const { session } = useAuth();
  const router = useRouter();
  const [event, setEvent] = useState<any>(null);
  const [open, setOpen] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setBusy(true);

    try {
      const uid = session.user.id;
      const eventResult = await supabase
        .from('tournaments')
        .select('id,name,starts_at,location,status,result,opponent_notes,match_notes')
        .eq('user_id', uid)
        .gte('starts_at', new Date().toISOString().slice(0, 10))
        .order('starts_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (eventResult.error) throw eventResult.error;

      const nextEvent = eventResult.data || null;
      let checklistItems: any[] = [];

      // A checklist belongs to a specific athlete + tournament. Never mix
      // unchecked items from a different event into the next-event cockpit.
      if (nextEvent?.id) {
        const checklistResult = await supabase
          .from('competition_checklists')
          .select('id,item,category,completed,tournament_id')
          .eq('user_id', uid)
          .eq('tournament_id', nextEvent.id)
          .eq('completed', false)
          .order('created_at', { ascending: true })
          .limit(6);

        if (checklistResult.error) throw checklistResult.error;
        checklistItems = checklistResult.data || [];
      }

      setEvent(nextEvent);
      setOpen(checklistItems);
    } catch (error) {
      Alert.alert(
        'Competition data unavailable',
        error instanceof Error ? error.message : 'Could not load the event checklist.'
      );
    } finally {
      setBusy(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen>
      <Header
        back
        eyebrow="COMPETITION MODE"
        title="Competition cockpit"
        subtitle="One place for preparation, event-day context and the review that comes after."
        right={<RefreshButton onPress={() => void load()} busy={busy} />}
      />
      {event ? (
        <Card accent>
          <Text style={{ color: c.accentBright, fontSize: 9, fontWeight: '900' }}>NEXT EVENT</Text>
          <Text style={{ color: c.text, fontSize: 22, fontWeight: '900', marginTop: 4 }}>{event.name}</Text>
          <Text style={{ color: c.muted, fontSize: 11, marginTop: 3 }}>
            {event.starts_at} • {event.location || 'Location not set'}
          </Text>
          <Text style={{ color: c.muted, fontSize: 10, marginTop: 8 }}>
            Status: {event.status || 'planned'}{event.result ? ' • Result: ' + event.result : ''}
          </Text>
        </Card>
      ) : (
        <Card>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '900' }}>No upcoming competition</Text>
          <Text style={{ color: c.muted, fontSize: 10 }}>
            Add an event in Compete and this cockpit will automatically pick it up.
          </Text>
        </Card>
      )}
      <Section title="BEFORE COMPETITION">
        {open.length ? (
          <Card>
            {open.map((item, index) => (
              <View
                key={item.id}
                style={{
                  paddingVertical: 9,
                  borderBottomWidth: index === open.length - 1 ? 0 : 1,
                  borderBottomColor: c.border,
                }}
              >
                <Text style={{ color: c.text, fontSize: 12, fontWeight: '800' }}>{item.item}</Text>
                <Text style={{ color: c.muted, fontSize: 9 }}>{item.category || 'Preparation'}</Text>
              </View>
            ))}
          </Card>
        ) : (
          <Card>
            <Text style={{ color: c.success, fontWeight: '900' }}>
              {event ? 'EVENT CHECKLIST CLEAR' : 'NO EVENT CHECKLIST'}
            </Text>
            <Text style={{ color: c.muted, fontSize: 10 }}>
              {event
                ? 'No open checklist items are recorded for this competition.'
                : 'Create a competition first, then add preparation items to that event.'}
            </Text>
          </Card>
        )}
        <FeatureRow
          title="Open full checklist"
          text="Manage preparation items for this competition."
          icon="check"
          onPress={() => router.push('/checklist')}
        />
      </Section>
      <Section title="COMPETITION INTELLIGENCE">
        <FeatureRow
          title="Competition Analysis"
          text="Review patterns and performance from your recorded matches."
          icon="chart"
          onPress={() => router.push('/competition-analysis')}
        />
        <FeatureRow
          title="Fight IQ & Journal"
          text="Capture what worked, what failed and the next tactical target."
          icon="ai"
          onPress={() => router.push('/athlete-journey')}
        />
      </Section>
      <Section title="AFTER THE EVENT">
        <FeatureRow
          title="Post-competition review"
          text="Record result, lessons, coach feedback and the next target."
          icon="edit"
          onPress={() => router.push('/athlete-journey')}
        />
        <FeatureRow
          title="Athlete Passport"
          text="See verified results and achievements after your record is updated."
          icon="shield"
          onPress={() => router.push('/athlete-passport')}
        />
      </Section>
    </Screen>
  );
}
