import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

export function ComingSoonScreen({ title, eyebrow }: { title: string; eyebrow: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.copy}>This part of your AthleteN workspace is coming together.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background, justifyContent: 'center', padding: 24 },
  eyebrow: { color: Colors.dark.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 },
  title: { color: Colors.dark.text, fontSize: 32, fontWeight: '800', marginBottom: 10 },
  copy: { color: Colors.dark.muted, fontSize: 15, lineHeight: 22, maxWidth: 280 },
});
