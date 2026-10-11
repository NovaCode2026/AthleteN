'use no memo';
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

const NAVY = '#081321';
const PANEL = '#12253C';
const CYAN = '#65D9FF';
const WHITE = '#FFFFFF';
const MUTED = '#9DB5CF';
type PulseData = { streak: number; sessions: number; minutes: number; signedIn: boolean };
type TrainingData = { title: string; detail: string; sessions: number; signedIn: boolean };
type CompetitionData = { title: string; detail: string; days: string; signedIn: boolean };

function Label({ text }: { text: string }) {
  return <TextWidget text={text} style={{ color: MUTED, fontSize: 10, fontWeight: 'bold' }} />;
}
function Value({ text, size = 22 }: { text: string; size?: number }) {
  return <TextWidget text={text} style={{ color: WHITE, fontSize: size, fontWeight: 'bold' }} />;
}
function Shell({ children, uri, label }: { children: React.ReactNode; uri: string; label: string }) {
  return <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri }} accessibilityLabel={label}
    style={{ width: 'match_parent', height: 'match_parent', backgroundColor: NAVY, borderRadius: 18, padding: 14, flexDirection: 'column', justifyContent: 'space-between' }}>
    {children}
    <TextWidget text="ATHLETEN  •  OPEN" style={{ color: CYAN, fontSize: 9, fontWeight: 'bold' }} />
  </FlexWidget>;
}

export function AthletePulseWidget({ data }: { data: PulseData }) {
  return <Shell uri="athleten:///training" label="AthleteN Athlete Pulse. Tap to open training.">
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', gap: 7 }}>
      <Label text="ATHLETE PULSE" />
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', gap: 10 }}>
        <FlexWidget style={{ flex: 1, backgroundColor: PANEL, borderRadius: 12, padding: 9, flexDirection: 'column', gap: 3 }}>
          <Label text="STREAK" /><Value text={data.signedIn ? String(data.streak) : '—'} /><Label text="DAYS" />
        </FlexWidget>
        <FlexWidget style={{ flex: 1, backgroundColor: PANEL, borderRadius: 12, padding: 9, flexDirection: 'column', gap: 3 }}>
          <Label text="THIS WEEK" /><Value text={data.signedIn ? String(data.sessions) : '—'} /><Label text="SESSIONS" />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  </Shell>;
}

export function TrainingPlannerWidget({ data }: { data: TrainingData }) {
  return <Shell uri="athleten:///training" label="AthleteN Training Planner. Tap to open training.">
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', gap: 7 }}>
      <Label text="TRAINING PLANNER" />
      <Value text={data.title} size={19} />
      <TextWidget text={data.detail} style={{ color: MUTED, fontSize: 11 }} />
      <TextWidget text={data.signedIn ? data.sessions + ' sessions logged this week' : 'Sign in to view your plan'} style={{ color: CYAN, fontSize: 10, fontWeight: 'bold' }} />
    </FlexWidget>
  </Shell>;
}

export function CompetitionCountdownWidget({ data }: { data: CompetitionData }) {
  return <Shell uri="athleten:///compete" label="AthleteN Competition Countdown. Tap to open competitions.">
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', gap: 7 }}>
      <Label text="NEXT COMPETITION" />
      <Value text={data.days} size={26} />
      <TextWidget text={data.title} style={{ color: WHITE, fontSize: 13, fontWeight: 'bold' }} />
      <TextWidget text={data.detail} style={{ color: MUTED, fontSize: 10 }} />
    </FlexWidget>
  </Shell>;
}
