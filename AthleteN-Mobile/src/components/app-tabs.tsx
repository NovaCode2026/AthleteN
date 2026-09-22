import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';
import { Colors } from '@/constants/theme';

export default function AppTabs(){
 const scheme=useColorScheme();const colors=Colors[scheme==='light'?'light':'dark'];
 return <NativeTabs backgroundColor={colors.background} indicatorColor={colors.accentSoft} disableTransparentOnScrollEdge>
  <NativeTabs.Trigger name="index"><NativeTabs.Trigger.Icon sf={{default:'house',selected:'house.fill'}} md={{default:'home',selected:'home'}}/><NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label></NativeTabs.Trigger>
  <NativeTabs.Trigger name="training"><NativeTabs.Trigger.Icon sf={{default:'figure.run',selected:'figure.run'}} md={{default:'fitness_center',selected:'fitness_center'}}/><NativeTabs.Trigger.Label>Train</NativeTabs.Trigger.Label></NativeTabs.Trigger>
  <NativeTabs.Trigger name="ai"><NativeTabs.Trigger.Icon sf={{default:'sparkles',selected:'sparkles'}} md={{default:'auto_awesome',selected:'auto_awesome'}}/><NativeTabs.Trigger.Label>AI</NativeTabs.Trigger.Label></NativeTabs.Trigger>
  <NativeTabs.Trigger name="compete"><NativeTabs.Trigger.Icon sf={{default:'trophy',selected:'trophy.fill'}} md={{default:'emoji_events',selected:'emoji_events'}}/><NativeTabs.Trigger.Label>Compete</NativeTabs.Trigger.Label></NativeTabs.Trigger>
  <NativeTabs.Trigger name="profile"><NativeTabs.Trigger.Icon sf={{default:'person',selected:'person.fill'}} md={{default:'person',selected:'person'}}/><NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label></NativeTabs.Trigger>
  <NativeTabs.Trigger name="explore"><NativeTabs.Trigger.Icon sf={{default:'square.grid.2x2',selected:'square.grid.2x2.fill'}} md={{default:'apps',selected:'apps'}}/><NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label></NativeTabs.Trigger>
 </NativeTabs>;
}
