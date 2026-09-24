'use no memo';

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

export type AthleteWidgetProps = {
  streak: number;
  sessions: number;
  nextCompetition?: string | null;
  aiRemaining?: number | null;
};

export function AthleteWidget({ streak, sessions, nextCompetition, aiRemaining }: AthleteWidgetProps) {
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: '#10151D',
        borderRadius: 20,
        padding: 16,
        flexDirection: 'column',
        justifyContent: 'center',
      }}
      accessibilityLabel="AthleteN athlete widget"
    >
      <TextWidget text="ATHLETEN" style={{ fontSize: 12, fontWeight: 'bold', color: '#7CC7FF' }} />
      <TextWidget
        text={streak > 0 ? `★ ${streak} DAY STREAK` : '★ START YOUR STREAK'}
        style={{ fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginTop: 5 }}
      />
      <TextWidget
        text={`${sessions} sessions • ${nextCompetition || 'No upcoming competition'}`}
        style={{ fontSize: 11, color: '#A8B2C0', marginTop: 5 }}
      />
      {aiRemaining != null ? (
        <TextWidget text={`AI ${aiRemaining} remaining`} style={{ fontSize: 10, color: '#7CC7FF', marginTop: 4 }} />
      ) : null}
    </FlexWidget>
  );
}