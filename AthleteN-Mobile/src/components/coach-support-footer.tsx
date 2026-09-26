import { Linking, Pressable, Text, View } from 'react-native';
import { c } from '@/components/mobile-ui';

const SUPPORT_EMAIL = 'novacode.create@gmail.com';

export default function CoachSupportFooter() {
  const openSupport = () => {
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=AthleteN%20Coach%20Support`);
  };

  return (
    <View style={{ marginTop: 18, paddingTop: 16, paddingBottom: 8, borderTopWidth: 1, borderTopColor: c.border, alignItems: 'center', gap: 6 }}>
      <Text style={{ color: c.muted, fontSize: 9, textAlign: 'center' }}>Need help with AthleteN?</Text>
      <Pressable onPress={openSupport} hitSlop={8}>
        <Text style={{ color: c.accentBright, fontSize: 10, fontWeight: '900' }}>CONTACT SUPPORT · {SUPPORT_EMAIL}</Text>
      </Pressable>
    </View>
  );
}
