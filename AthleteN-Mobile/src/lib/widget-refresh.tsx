import { Platform } from 'react-native';
import React from 'react';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { loadWidgetData } from '@/widgets/widget-task-handler';
import { AthletePulseWidget, TrainingPlannerWidget, CompetitionCountdownWidget } from '@/widgets/athlete-widgets';

export async function refreshAthleteWidgets() {
  if (Platform.OS !== 'android') return;
  try {
    const data = await loadWidgetData();
    await Promise.all([
      requestWidgetUpdate({ widgetName: 'AthletePulse', renderWidget: () => <AthletePulseWidget data={data.pulse} /> }),
      requestWidgetUpdate({ widgetName: 'TrainingPlanner', renderWidget: () => <TrainingPlannerWidget data={data.training} /> }),
      requestWidgetUpdate({ widgetName: 'CompetitionCountdown', renderWidget: () => <CompetitionCountdownWidget data={data.competition} /> }),
    ]);
  } catch {
    // Widgets are optional UI; refresh failures must not interrupt the app.
  }
}
