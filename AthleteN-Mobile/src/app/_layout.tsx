import React from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import { Pressable, Text, View, useColorScheme } from 'react-native';
import AthleteNLogo from '@/components/athleten-logo';
import { useRouter, usePathname, useSegments } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { Colors } from '@/constants/theme';
import AnnouncementOverlay from '@/components/announcement-overlay';
import AppUpdateGate from '@/components/app-update-gate';

type ErrorBoundaryState = { error: Error | null };

class AppErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[AthleteN] render error', error);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={{ flex: 1, backgroundColor: Colors.dark.background, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 }}>
        <Text style={{ color: Colors.dark.text, fontSize: 21, fontWeight: '900', textAlign: 'center' }}>AthleteN hit a screen error</Text>
        <Text style={{ color: Colors.dark.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' }}>
          The app caught the error safely. The details below can help diagnose this screen.
        </Text>
        <Text selectable style={{ color: Colors.dark.warning || '#F6B94A', fontSize: 10, lineHeight: 15, textAlign: 'center' }}>
          {String(this.state.error.message || this.state.error).slice(0, 700)}
        </Text>
        <Pressable
          onPress={() => this.setState({ error: null })}
          style={{ backgroundColor: Colors.dark.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
        >
          <Text style={{ color: '#fff', fontWeight: '900' }}>RETRY</Text>
        </Pressable>
      </View>
    );
  }
}


const PUBLIC_AUTH_PATHS = new Set([
  '/',
  '/auth/callback',
  '/reset-request',
  '/reset-password',
  '/policies',
]);

function AuthRouteGuard() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const isProtectedTabRoute = segments[0] === '(tabs)';

  React.useEffect(() => {
    if (loading || session) return;
    // Expo Router omits route-group names from usePathname(). As a result, the
    // protected tab home can also report "/" and be mistaken for the public
    // login entry route. Route segments disambiguate the two cases after logout.
    // Supabase email confirmation and recovery links remain public.
    const isPublicEntryRoute = PUBLIC_AUTH_PATHS.has(pathname) && !isProtectedTabRoute;
    if (!isPublicEntryRoute) router.replace('/');
  }, [loading, session?.user.id, pathname, isProtectedTabRoute, router]);
  return null;
}

// Keep the native splash until React has mounted, but never leave users trapped
// on the native splash if app bootstrap/rendering is delayed.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  React.useEffect(() => {
    const hide = () => { void SplashScreen.hideAsync().catch(() => undefined); };
    hide();
    const failsafe = setTimeout(hide, 12000);
    return () => clearTimeout(failsafe);
  }, []);

  const colorScheme = useColorScheme();
  const router = useRouter();

  return (
    <AppErrorBoundary>
      <AuthProvider>
        <AuthRouteGuard />
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AnnouncementOverlay />
          <AppUpdateGate />
          <Stack
            screenOptions={{
              headerShown: true,
              headerTitle: () => (
                <AthleteNLogo width={54} height={54} />
              ),
              headerTitleStyle: { color: Colors.dark.text, fontSize: 15, fontWeight: '900' },
              headerStyle: { backgroundColor: Colors.dark.background },
              headerTintColor: Colors.dark.accentBright,
              headerBackTitle: 'Back',
              headerShadowVisible: false,
              headerLeft: ({ canGoBack }) => canGoBack ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                  hitSlop={12}
                  onPress={() => router.back()}
                  style={{ paddingRight: 18, paddingVertical: 8 }}
                >
                  <MaterialCommunityIcons name="arrow-left" size={23} color={Colors.dark.accentBright} />
                </Pressable>
              ) : null,
              contentStyle: { backgroundColor: Colors.dark.background },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="rewards" options={{ headerShown: false }} />
            <Stack.Screen name="leaderboard" options={{ headerShown: false }} />
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="academy-setup" options={{ headerShown: false }} />
            <Stack.Screen name="change-password" options={{ headerShown: false }} />
            <Stack.Screen name="reset-request" options={{ headerShown: false }} />
            <Stack.Screen name="reset-password" options={{ headerShown: false }} />
            <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
            <Stack.Screen name="policies" options={{ headerShown: false }} />
          </Stack>
        </ThemeProvider>
      </AuthProvider>
    </AppErrorBoundary>
  );
}
