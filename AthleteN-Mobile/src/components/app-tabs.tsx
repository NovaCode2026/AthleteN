import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';
import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];
  return (
    <NativeTabs backgroundColor={colors.background} indicatorColor={colors.accentSoft} labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="index"><NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label></NativeTabs.Trigger>
      <NativeTabs.Trigger name="training"><NativeTabs.Trigger.Label>Train</NativeTabs.Trigger.Label></NativeTabs.Trigger>
      <NativeTabs.Trigger name="ai"><NativeTabs.Trigger.Label>AI</NativeTabs.Trigger.Label></NativeTabs.Trigger>
      <NativeTabs.Trigger name="compete"><NativeTabs.Trigger.Label>Compete</NativeTabs.Trigger.Label></NativeTabs.Trigger>
      <NativeTabs.Trigger name="scanner"><NativeTabs.Trigger.Label>Scan</NativeTabs.Trigger.Label></NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile"><NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label></NativeTabs.Trigger>
    </NativeTabs>
  );
}
