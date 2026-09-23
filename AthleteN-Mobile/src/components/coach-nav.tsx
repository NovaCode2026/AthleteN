import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';

const c = Colors.dark;

const ITEMS = [
  { key: 'home', label: 'Home', icon: '⌂', route: '/coach' },
  { key: 'athletes', label: 'Athletes', icon: '♙', route: '/coach-athletes' },
  { key: 'training', label: 'Training', icon: '▥', route: '/coach-training' },
  { key: 'compete', label: 'Compete', icon: '♜', route: '/coach-tournaments' },
  { key: 'more', label: 'More', icon: '•••', route: '/coach-more' },
] as const;

export default function CoachNav({ active }: { active?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = active || (pathname === '/coach' ? 'home' : pathname.includes('athletes') ? 'athletes' : pathname.includes('training') ? 'training' : pathname.includes('tournament') ? 'compete' : 'more');

  return (
    <View style={s.outer}>
      <View style={s.bar}>
        {ITEMS.map(item => {
          const selected = current === item.key;
          return (
            <Pressable key={item.key} onPress={() => router.push(item.route)} style={s.item}>
              <View style={[s.icon, selected && s.iconActive]}>
                <Text style={[s.iconText, selected && s.iconTextActive]}>{item.icon}</Text>
              </View>
              <Text numberOfLines={1} style={[s.label, selected && s.labelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  outer: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    backgroundColor: '#070c14',
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: 34,
    paddingHorizontal: 8,
    paddingTop: 7,
    paddingBottom: 7,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  bar: { minHeight: 68, flexDirection: 'row' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', gap: 3, paddingHorizontal: 1 },
  icon: { width: 52, height: 38, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  iconActive: { backgroundColor: c.accentSoft, borderWidth: 1, borderColor: c.accentDeep },
  iconText: { color: c.muted, fontSize: 21, fontWeight: '900' },
  iconTextActive: { color: c.accentBright },
  label: { color: c.muted, fontSize: 9, fontWeight: '800', textAlign: 'center' },
  labelActive: { color: c.accentBright, fontWeight: '900' },
});
