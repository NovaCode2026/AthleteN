import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { AthleteWidget } from './widgets/AthleteWidget';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(<AthleteWidget streak={0} sessions={0} nextCompetition="Open AthleteN to sync" />);
      break;
    default:
      break;
  }
}