import React from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { DarkTheme, DefaultTheme, ThemeProvider, Stack, usePathname, useRouter, useSegments } from 'expo-router';
import { Pressable, Text, View, useColorScheme } from 'react-native';
import AthleteNLogo from '@/components/athleten-logo';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { Colors } from '@/constants/theme';
import AnnouncementOverlay from '@/components/announcement-overlay';
import AppUpdateGate from '@/components/app-update-gate';

type ErrorBoundaryState = { error: Error | null };

class AppErrorBoundary extends React.Component<React.PropsWithChildren<{ title?: string }>, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[AthleteN] render error', error);
    void SplashScreen.hideAsync().catch(() => undefined);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={{ flex: 1, backgroundColor: Colors.dark.background, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 }}>
        <Text style={{ color: Colors.dark.text, fontSize: 21, fontWeight: '900', textAlign: 'center' }}>{this.props.title || 'AthleteN hit a screen error'}</Text>
        <Text style={{ color: Colors.dark.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' }}>
          Startup was interrupted, but the app caught the error instead of leaving a blank screen.
        </Text>
        <Text selectable style={{ color: Colors.dark.warning || '#F6B94A', fontSize: 10, lineHeight: 15, textAlign: 'center' }}>
          {String(this.state.error.message || this.state.error).slice(0, 700)}
        </Text>
        <Pressable
          onPress={() => this.setState({ error: null })}
          style={{ backgroundColor: Colors.dark.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
        >
          <Text style={{ color: '#fff', fontWeight: '900' }}>RETRY SCREEN</Text>
        </Pressable>
      </View>
    );
  }
}

const PUBLIC_AUTH_PATHS = new Set(['/', '/auth/callback', '/reset-request', '/reset-password', '/policies']);

function AuthRouteGuard() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const isProtectedTabRoute = segments[0] === '(tabs)';

  React.useEffect(() => {
    if (loading || session) return;
    const isPublicEntryRoute = PUBLIC_AUTH_PATHS.has(pathname) && !isProtectedTabRoute;
    if (!isPublicEntryRoute) router.replace('/');
  }, [loading, session?.user.id, pathname, isProtectedTabRoute, router]);
  return null;
}

// Hide the native splash as soon as a route is committed, with a short failsafe.
// Do not let a slow auth/network request keep the native splash indefinitely.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function SplashHandoff() {
  const pathname = usePathname();
  React.useEffect(() => {
    if (!pathname) return;
    const timer = setTimeout(() => void SplashScreen.hideAsync().catch(() => undefined), 180);
    return () => clearTimeout(timer);
  }, [pathname]);
  React.useEffect(() => {
    const failsafe = setTimeout(() => void SplashScreen.hideAsync().catch(() => undefined), 3500);
    return () => clearTimeout(failsafe);
  }, []);
  return null;
}

// Optional overlays and update networking start only after the initial route has
// had time to paint. A failure in either optional feature cannot blank the app.
function DeferredStartupFeatures() {
  const pathname = usePathname();
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    if (!pathname) return;
    const timer = setTimeout(() => setReady(true), 12000);
    return () => clearTimeout(timer);
  }, [pathname]);
  if (!ready) return null;
  return (
    <>
      <AppErrorBoundary title="Announcement service unavailable"><AnnouncementOverlay /></AppErrorBoundary>
      <AppErrorBoundary title="Update service unavailable"><AppUpdateGate /></AppErrorBoundary>
    </>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  return (
    <AppErrorBoundary>
      <AuthProvider>
        <SplashHandoff />
        <AuthRouteGuard />
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack
            screenOptions={{
              headerShown: true,
              headerTitle: () => <AthleteNLogo width={54} height={54} />,
              headerTitleStyle: { color: Colors.dark.text, fontSize: 15, fontWeight: '900' },
              headerStyle: { backgroundColor: Colors.dark.background },
              headerTintColor: Colors.dark.accentBright,
              headerBackTitle: 'Back',
              headerShadowVisible: false,
              headerLeft: ({ canGoBack }) => canGoBack ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={12} onPress={() => router.back()} style={{ paddingRight: 18, paddingVertical: 8 }}>
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
          <DeferredStartupFeatures />
        </ThemeProvider>
      </AuthProvider>
    </AppErrorBoundary>
  );
}
