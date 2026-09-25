import React from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import { Pressable, Text, View, useColorScheme } from 'react-native';
import { AuthProvider } from '@/context/AuthContext';
import { Colors } from '@/constants/theme';

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
          The app caught the error safely. Restart AthleteN and try again.
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

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AppErrorBoundary>
      <AuthProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.dark.background } }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="reset-request" options={{ headerShown: false }} />
            <Stack.Screen name="reset-password" options={{ headerShown: false }} />
            <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
          </Stack>
        </ThemeProvider>
      </AuthProvider>
    </AppErrorBoundary>
  );
}
