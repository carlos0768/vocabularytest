import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const rawSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const rawSupabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

export const SUPABASE_CONFIG_ERROR =
  rawSupabaseUrl && rawSupabaseAnonKey
    ? null
    : 'Supabase設定が不足しています。EXPO_PUBLIC_SUPABASE_URL と EXPO_PUBLIC_SUPABASE_ANON_KEY を設定してください。';

export const hasSupabaseConfig = SUPABASE_CONFIG_ERROR === null;

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  supabaseInstance = createClient(
    rawSupabaseUrl ?? 'https://example.invalid',
    rawSupabaseAnonKey ?? 'missing-anon-key',
    {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    }
  );

  return supabaseInstance;
}

export const supabase = getSupabase();
