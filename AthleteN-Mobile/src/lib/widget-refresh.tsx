import { Platform } from 'react-native';

export async function refreshAthleteWidgets() {
  if (Platform.OS !== 'android') return;
  try {
    const [{ requestWidgetUpdate }, { loadWidgetData }, widgets] = await Promise.all([
      import('react-native-android-widget'),
      import('@/widgets/widget-task-handler'),
      import('@/widgets/athlete-widgets'),
    ]);
    const data = await loadWidgetData();
    await Promise.all([
      requestWidgetUpdate({ widgetName: 'AthletePulse', renderWidget: () => <widgets.AthletePulseWidget data={data.pulse} /> }),
      requestWidgetUpdate({ widgetName: 'TrainingPlanner', renderWidget: () => <widgets.TrainingPlannerWidget data={data.training} /> }),
      requestWidgetUpdate({ widgetName: 'CompetitionCountdown', renderWidget: () => <widgets.CompetitionCountdownWidget data={data.competition} /> }),
    ]);
  } catch {
    // Widgets are optional UI; refresh failures must not interrupt the app.
  }
}
