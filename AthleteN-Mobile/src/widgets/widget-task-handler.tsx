import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { supabase } from '@/lib/supabase';
import { AthletePulseWidget, TrainingPlannerWidget, CompetitionCountdownWidget } from './athlete-widgets';

export const emptyPulse = { streak: 0, sessions: 0, minutes: 0, signedIn: false };
export const emptyTraining = { title: 'Your next session', detail: 'Open AthleteN to plan training', sessions: 0, signedIn: false };
export const emptyCompetition = { title: 'No event added', detail: 'Add a tournament in Compete', days: '—', signedIn: false };
const dateKey = (date: Date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');

export async function loadWidgetData() {
  try {
    const { data: sessionResult } = await supabase.auth.getSession();
    const userId = sessionResult.session?.user.id;
    if (!userId) return { pulse: emptyPulse, training: emptyTraining, competition: emptyCompetition };

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - 6);
    const [trainingResult, tournamentResult] = await Promise.all([
      supabase.from('training_sessions').select('session_date,minutes').eq('user_id', userId)
        .gte('session_date', dateKey(weekStart)).lte('session_date', dateKey(now))
        .order('session_date', { ascending: false }).limit(100),
      supabase.from('tournaments').select('name,starts_at,location').eq('user_id', userId)
        .gte('starts_at', now.toISOString()).order('starts_at', { ascending: true }).limit(1).maybeSingle(),
    ]);
    const rows = trainingResult.data || [];
    const dates = [...new Set(rows.map((row: { session_date: string }) => String(row.session_date).slice(0, 10)))];
    let streak = 0;
    const cursor = new Date(now);
    cursor.setHours(0, 0, 0, 0);
    if (!dates.includes(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (dates.includes(dateKey(cursor)) && streak < 365) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    const sessions = rows.length;
    const minutes = rows.reduce((sum: number, row: { minutes?: number | null }) => sum + (Number(row.minutes) || 0), 0);
    const pulse = { streak, sessions, minutes, signedIn: true };
    const training = {
      title: sessions ? 'Keep your momentum' : 'Plan your next session',
      detail: sessions ? 'Recent work: ' + minutes + ' minutes' : 'No sessions logged this week yet',
      sessions,
      signedIn: true,
    };
    const event = tournamentResult.data;
    let competition = emptyCompetition;
    if (event?.starts_at) {
      const eventDate = new Date(event.starts_at);
      const days = Math.max(0, Math.ceil((eventDate.getTime() - now.getTime()) / 86400000));
      competition = {
        title: String(event.name || 'Upcoming competition').slice(0, 36),
        detail: [eventDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), event.location].filter(Boolean).join(' • '),
        days: days === 0 ? 'TODAY' : days + ' DAYS',
        signedIn: true,
      };
    }
    return { pulse, training, competition };
  } catch {
    return { pulse: emptyPulse, training: emptyTraining, competition: emptyCompetition };
  }
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (!['WIDGET_ADDED', 'WIDGET_UPDATE', 'WIDGET_RESIZED'].includes(props.widgetAction)) return;
  const data = await loadWidgetData();
  switch (props.widgetInfo.widgetName) {
    case 'AthletePulse':
      props.renderWidget(<AthletePulseWidget data={data.pulse} />);
      break;
    case 'TrainingPlanner':
      props.renderWidget(<TrainingPlannerWidget data={data.training} />);
      break;
    case 'CompetitionCountdown':
      props.renderWidget(<CompetitionCountdownWidget data={data.competition} />);
      break;
  }
}
