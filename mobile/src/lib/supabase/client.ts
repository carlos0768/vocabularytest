import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Supabase credentials - these should match the web app
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://ryoyvpayoacgeqgoehgk.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5b3l2cGF5b2FjZ2VxZ29laGdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNDQ4NjksImV4cCI6MjA4NDcyMDg2OX0.lDj9qdTwPAZew-fJpMDWBOnI6vNLqz2gk3uNmtVvUmY';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  return supabaseInstance;
}

export const supabase = getSupabase();
