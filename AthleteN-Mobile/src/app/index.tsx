import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';

const colors = Colors.dark;

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function DashboardCard({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function QuickAction({ label, detail }: { label: string; detail: string }) {
  return (
    <Pressable style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}>
      <View style={styles.actionIcon}>
        <SymbolView name="plus" tintColor={colors.accent} size={20} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
      <Text style={styles.actionDetail}>{detail}</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
          <View style={styles.header}>
            <View style={styles.brand}>
              <Image source={require('@/assets/logo.png')} style={styles.logo} contentFit="cover" />
              <Text style={styles.brandName}>ATHLETEN</Text>
            </View>
            <Pressable style={styles.notificationButton} accessibilityLabel="Notifications">
              <SymbolView name="link" tintColor={colors.text} size={20} />
              <View style={styles.notificationDot} />
            </Pressable>
          </View>

          <View style={styles.greeting}>
            <Text style={styles.eyebrow}>MONDAY, SEPTEMBER 21</Text>
            <Text style={styles.greetingTitle}>Good morning, Alex</Text>
            <Text style={styles.greetingCopy}>Ready to make today count?</Text>
          </View>

          <DashboardCard style={styles.streakCard}>
            <View style={styles.cardHeader}>
              <View><SectionLabel>TRAINING STREAK</SectionLabel><View style={styles.streakValueRow}><Text style={styles.streakValue}>12</Text><Text style={styles.streakUnit}>days</Text></View></View>
              <View style={styles.flameCircle}><Text style={styles.flame}>+</Text></View>
            </View>
            <View style={styles.weekRow}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
                <View key={`${day}-${index}`} style={styles.dayItem}><Text style={styles.dayLabel}>{day}</Text><View style={[styles.dayDot, index < 5 && styles.dayDotActive]}>{index < 5 && <Text style={styles.dayCheck}>✓</Text>}</View></View>
              ))}
            </View>
          </DashboardCard>

          <SectionLabel>NEXT COMPETITION</SectionLabel>
          <DashboardCard style={styles.competitionCard}>
            <View style={styles.competitionBadge}><Text style={styles.competitionBadgeText}>28</Text><Text style={styles.competitionBadgeMonth}>SEP</Text></View>
            <View style={styles.competitionInfo}><Text style={styles.competitionTitle}>World Athletics Final</Text><Text style={styles.competitionMeta}>Berlin, Germany  •  In 7 days</Text><View style={styles.progressTrack}><View style={styles.progressFill} /></View><Text style={styles.progressLabel}>Preparation  <Text style={styles.progressPercent}>82%</Text></Text></View>
            <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} tintColor={colors.muted} size={18} />
          </DashboardCard>

          <View style={styles.sectionHeadingRow}><SectionLabel>QUICK ACTIONS</SectionLabel><Text style={styles.seeAll}>VIEW ALL</Text></View>
          <View style={styles.actionsRow}><QuickAction label="Training" detail="Start a session" /><QuickAction label="Weight" detail="Log measurement" /></View>

          <DashboardCard style={styles.intelligenceCard}>
            <View style={styles.intelligenceTop}><View style={styles.intelligenceIcon}><Text style={styles.intelligenceMark}>AI</Text></View><View style={styles.intelligenceTitleWrap}><Text style={styles.intelligenceTitle}>AthleteN Intelligence</Text><Text style={styles.intelligenceSubtitle}>Your daily performance insight</Text></View><Text style={styles.newPill}>NEW</Text></View>
            <Text style={styles.insight}>Your consistency is building momentum. A focused recovery session today will keep you sharp for Berlin.</Text>
            <Pressable style={({ pressed }) => [styles.insightButton, pressed && styles.pressed]}><Text style={styles.insightButtonText}>VIEW INSIGHT</Text><Text style={styles.insightArrow}>→</Text></Pressable>
          </DashboardCard>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  content: { paddingHorizontal: 20, gap: 18 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 }, brand: { flexDirection: 'row', alignItems: 'center', gap: 10 }, logo: { width: 38, height: 38, borderRadius: 11 }, brandName: { color: colors.text, fontSize: 15, fontWeight: '800', letterSpacing: 3 }, notificationButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, notificationDot: { position: 'absolute', right: 10, top: 9, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent }, greeting: { paddingTop: 18, gap: 5 }, eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }, greetingTitle: { color: colors.text, fontSize: 29, fontWeight: '800' }, greetingCopy: { color: colors.muted, fontSize: 15 }, sectionLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }, card: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 18 }, streakCard: { backgroundColor: colors.accentDeep, borderColor: '#1A55B8', gap: 18 }, cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, streakValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 4 }, streakValue: { color: colors.text, fontSize: 42, fontWeight: '800' }, streakUnit: { color: '#B6D0FF', fontSize: 14 }, flameCircle: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#2E72E5', justifyContent: 'center', alignItems: 'center' }, flame: { color: colors.text, fontSize: 25, fontWeight: '800' }, weekRow: { flexDirection: 'row', justifyContent: 'space-between' }, dayItem: { alignItems: 'center', gap: 7 }, dayLabel: { color: '#9ABDF5', fontSize: 11, fontWeight: '700' }, dayDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#4175C9', alignItems: 'center', justifyContent: 'center' }, dayDotActive: { backgroundColor: colors.text, borderColor: colors.text }, dayCheck: { color: colors.accent, fontSize: 14, fontWeight: '800' }, competitionCard: { flexDirection: 'row', alignItems: 'center', gap: 13 }, competitionBadge: { width: 50, height: 58, borderRadius: 13, backgroundColor: '#19212F', alignItems: 'center', justifyContent: 'center' }, competitionBadgeText: { color: colors.text, fontSize: 20, fontWeight: '800' }, competitionBadgeMonth: { color: colors.accent, fontSize: 10, fontWeight: '800', marginTop: 1 }, competitionInfo: { flex: 1, gap: 5 }, competitionTitle: { color: colors.text, fontSize: 15, fontWeight: '700' }, competitionMeta: { color: colors.muted, fontSize: 12 }, progressTrack: { height: 5, backgroundColor: '#252D3B', borderRadius: 3, marginTop: 7, overflow: 'hidden' }, progressFill: { width: '82%', height: '100%', backgroundColor: colors.accent, borderRadius: 3 }, progressLabel: { color: colors.muted, fontSize: 11 }, progressPercent: { color: colors.accent, fontWeight: '700' }, sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 }, seeAll: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1 }, actionsRow: { flexDirection: 'row', gap: 12 }, quickAction: { flex: 1, minHeight: 118, backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 7 }, actionIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 2 }, actionLabel: { color: colors.text, fontSize: 15, fontWeight: '700' }, actionDetail: { color: colors.muted, fontSize: 11 }, intelligenceCard: { gap: 14, marginTop: 2, marginBottom: 8 }, intelligenceTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, intelligenceIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, intelligenceMark: { color: colors.accent, fontSize: 12, fontWeight: '900' }, intelligenceTitleWrap: { flex: 1, gap: 2 }, intelligenceTitle: { color: colors.text, fontSize: 15, fontWeight: '700' }, intelligenceSubtitle: { color: colors.muted, fontSize: 11 }, newPill: { color: colors.accent, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, insight: { color: '#C0C7D5', fontSize: 13, lineHeight: 19 }, insightButton: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }, insightButtonText: { color: colors.text, fontSize: 11, fontWeight: '800', letterSpacing: 1 }, insightArrow: { color: colors.accent, fontSize: 18 }, pressed: { opacity: 0.7 },
});
