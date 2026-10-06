import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://wjegokgtrewtoopbsiol.supabase.co';

// Expo embeds EXPO_PUBLIC_* values at build time. Keep a public Supabase
// publishable/anon key fallback so standalone APKs can connect even when no
// local .env file exists on the build runner.
const key =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_OVH6gmAjzAatxXNeguK3Dw_pCFVj9dd';

export const isSupabaseConfigured = Boolean(key);
export const supabase = createClient(url, key, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});
