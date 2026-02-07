'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createBrowserClient } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { Subscription, SubscriptionStatus, SubscriptionPlan } from '@/types';
import { hybridRepository } from '@/lib/db';
import { invalidateStatsCache } from '@/lib/stats-cache';
import { clearHomeCache } from '@/lib/home-cache';
import { clearAllUserStats } from '@/lib/utils';

interface AuthState {
  user: User | null;
  subscription: Subscription | null;
  loading: boolean;
  error: string | null;
}

// ---- Fast session detection ----
// Synchronously check if Supabase session exists in localStorage
// This allows instant UI without waiting for async getSession()
function hasSupabaseSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // Supabase stores session in localStorage with key pattern: sb-{project_ref}-auth-token
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return false;
    
    // Extract project ref from URL (e.g., https://ryoyvpayoacgeqgoehgk.supabase.co -> ryoyvpayoacgeqgoehgk)
    const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
    if (!match) return false;
    
    const projectRef = match[1];
    const sessionKey = `sb-${projectRef}-auth-token`;
    const sessionData = localStorage.getItem(sessionKey);
    
    if (!sessionData) return false;
    
    // Parse and check if token exists and isn't expired
    const parsed = JSON.parse(sessionData);
    if (!parsed?.access_token) return false;
    
    // Check expiry with 5-minute buffer (expires_at is Unix timestamp in seconds)
    // The buffer prevents false negatives during token refresh
    if (parsed.expires_at && Date.now() / 1000 > parsed.expires_at + 300) {
      return false; // Token expired (with 5-min grace)
    }
    
    return true;
  } catch {
    return false;
  }
}

// Get cached user from Supabase localStorage (for instant UI)
function getCachedSupabaseUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return null;
    
    const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
    if (!match) return null;
    
    const projectRef = match[1];
    const sessionKey = `sb-${projectRef}-auth-token`;
    const sessionData = localStorage.getItem(sessionKey);
    
    if (!sessionData) return null;
    
    const parsed = JSON.parse(sessionData);
    return parsed?.user ?? null;
  } catch {
    return null;
  }
}

// ---- Strategy 3: localStorage subscription cache ----
const SUB_CACHE_KEY = 'merken_sub_cache';

interface SubCache {
  subscription: Subscription | null;
  userId: string;
  timestamp: number;
}

function getCachedSubscription(userId: string): Subscription | null {
  try {
    const raw = localStorage.getItem(SUB_CACHE_KEY);
    if (!raw) return null;
    const cache: SubCache = JSON.parse(raw);
    // Must match user and be < 1 hour old (extended from 10 min for faster startup)
    if (cache.userId !== userId) return null;
    if (Date.now() - cache.timestamp > 60 * 60 * 1000) return null;
    return cache.subscription;
  } catch {
    return null;
  }
}

function setCachedSubscription(userId: string, subscription: Subscription | null) {
  try {
    const cache: SubCache = { subscription, userId, timestamp: Date.now() };
    localStorage.setItem(SUB_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

function clearCachedSubscription() {
  try {
    localStorage.removeItem(SUB_CACHE_KEY);
  } catch {
    // ignore
  }
}

// ---- Daily activity logging ----
const ACTIVITY_LOG_KEY = 'merken_activity_logged';

function logDailyActivity(userId: string) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const cached = localStorage.getItem(ACTIVITY_LOG_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.userId === userId && parsed.date === today) return;
    }
    // Mark as logged immediately to prevent duplicate calls
    localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify({ userId, date: today }));
    fetch('/api/activity', { method: 'POST' }).catch(() => {
      // If API call fails, clear cache so it retries next time
      localStorage.removeItem(ACTIVITY_LOG_KEY);
    });
  } catch {
    // ignore
  }
}

// ---- Global state ----

// Start with loading: true for SSR compatibility
// We'll immediately update to cached state on client mount
let globalAuthState: AuthState = {
  user: null,
  subscription: null,
  loading: true,
  error: null,
};

// Track if we've done the instant-load optimization
let hasOptimisticLoad = false;

// Called immediately on first client-side mount to provide instant UI
function tryOptimisticLoad(): boolean {
  if (hasOptimisticLoad) return false;
  if (typeof window === 'undefined') return false;
  
  hasOptimisticLoad = true;
  
  // Check if we have a valid session in localStorage
  if (hasSupabaseSession()) {
    const cachedUser = getCachedSupabaseUser();
    const cachedSub = cachedUser ? getCachedSubscription(cachedUser.id) : null;
    
    // If we have cached user data, instantly update state
    if (cachedUser) {
      globalAuthState = {
        user: cachedUser,
        subscription: cachedSub,
        loading: false, // Instant UI!
        error: null,
      };
      return true;
    }
  }
  
  return false;
}
const globalListeners: Set<(state: AuthState) => void> = new Set();
let isGlobalLoading = false;
let hasInitialized = false;

function notifyListeners(newState: AuthState) {
  globalAuthState = newState;
  globalListeners.forEach(listener => listener(newState));
}

export function useAuth() {
  // Try optimistic load on first render (instant UI for returning users)
  // This runs synchronously before useState, updating globalAuthState
  tryOptimisticLoad();
  
  const [state, setState] = useState<AuthState>(globalAuthState);

  // Refs to track component lifecycle
  const isMountedRef = useRef(true);

  // Subscribe to global state changes
  useEffect(() => {
    const listener = (newState: AuthState) => {
      if (isMountedRef.current) {
        setState(newState);
      }
    };
    globalListeners.add(listener);
    // Sync with current global state (handles optimistic load updates)
    if (state !== globalAuthState) {
      setState(globalAuthState);
    }

    return () => {
      globalListeners.delete(listener);
    };
  }, [state]);

  // Get supabase client (singleton)
  const getSupabase = useCallback(() => {
    if (typeof window === 'undefined') return null;
    try {
      return createBrowserClient();
    } catch {
      return null;
    }
  }, []);

  // Load user and subscription - core function
  const loadUserCore = useCallback(async (): Promise<{ user: User | null; subscription: Subscription | null }> => {
    const supabase = getSupabase();
    if (!supabase) {
      return { user: null, subscription: null };
    }

    // Use getSession instead of getUser - faster and more reliable
    // getSession reads from local storage, getUser makes a server request
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    const user = session?.user ?? null;

    if (!user) {
      clearCachedSubscription();
      return { user: null, subscription: null };
    }

    // Strategy 3: Check localStorage cache first for instant UI
    const cachedSub = getCachedSubscription(user.id);
    if (cachedSub !== null || getCachedSubscription(user.id) === null) {
      // We have a cached answer (could be null = free user).
      // Emit cached state immediately, then verify in background.
      const hasCacheEntry = localStorage.getItem(SUB_CACHE_KEY) !== null;
      if (hasCacheEntry) {
        // Emit fast path
        const fastResult = { user, subscription: cachedSub };

        // Schedule background verification (non-blocking)
        setTimeout(async () => {
          try {
            const { data: subData, error: subError } = await supabase
              .from('subscriptions')
              .select('*')
              .eq('user_id', user.id)
              .single();

            if (subError && subError.code !== 'PGRST116') return;

            const freshSub: Subscription | null = subData ? {
              id: subData.id,
              userId: subData.user_id,
              status: subData.status as SubscriptionStatus,
              plan: subData.plan as SubscriptionPlan,
              komojuSubscriptionId: subData.komoju_subscription_id,
              komojuCustomerId: subData.komoju_customer_id,
              currentPeriodStart: subData.current_period_start,
              currentPeriodEnd: subData.current_period_end,
              createdAt: subData.created_at,
              updatedAt: subData.updated_at,
            } : null;

            setCachedSubscription(user.id, freshSub);

            // Only notify if subscription actually changed
            const cachedStatus = cachedSub?.status;
            const freshStatus = freshSub?.status;
            if (cachedStatus !== freshStatus) {
              notifyListeners({
                user,
                subscription: freshSub,
                loading: false,
                error: null,
              });
            }
          } catch {
            // Background verification failed - cached state is still valid
          }
        }, 0);

        return fastResult;
      }
    }

    // No cache: fetch subscription synchronously
    const { data: subscriptionData, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (subError && subError.code !== 'PGRST116') {
      console.error('Failed to fetch subscription:', subError);
    }

    const subscription: Subscription | null = subscriptionData ? {
      id: subscriptionData.id,
      userId: subscriptionData.user_id,
      status: subscriptionData.status as SubscriptionStatus,
      plan: subscriptionData.plan as SubscriptionPlan,
      komojuSubscriptionId: subscriptionData.komoju_subscription_id,
      komojuCustomerId: subscriptionData.komoju_customer_id,
      currentPeriodStart: subscriptionData.current_period_start,
      currentPeriodEnd: subscriptionData.current_period_end,
      createdAt: subscriptionData.created_at,
      updatedAt: subscriptionData.updated_at,
    } : null;

    // Cache for next time
    setCachedSubscription(user.id, subscription);

    return { user, subscription };
  }, [getSupabase]);

  // Public loadUser function with global deduplication and timeout
  const loadUser = useCallback(async () => {
    // Prevent concurrent calls globally (across all useAuth instances)
    if (isGlobalLoading) {
      return;
    }
    isGlobalLoading = true;

    try {
      // Add timeout to prevent infinite loading
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('AUTH_TIMEOUT')), 5000);
      });

      const result = await Promise.race([
        loadUserCore(),
        timeoutPromise,
      ]);

      const newState: AuthState = {
        user: result.user,
        subscription: result.subscription,
        loading: false,
        error: null,
      };
      notifyListeners(newState);

      // Log daily activity for authenticated users
      if (result.user) {
        logDailyActivity(result.user.id);
        
        // Trigger initial sync for Pro users (background, non-blocking)
        if (result.subscription?.status === 'active') {
          const syncedUserId = hybridRepository.getSyncedUserId();
          const lastSync = hybridRepository.getLastSync();
          const needsSync = !lastSync || syncedUserId !== result.user.id;
          
          if (needsSync) {
            console.log('[Auth] Pro user detected, triggering initial sync');
            hybridRepository.fullSync(result.user.id).catch((error) => {
              console.error('[Auth] Initial sync failed:', error);
            });
          } else {
            // Already synced, just process any pending queue items
            hybridRepository.processSyncQueue().catch((error) => {
              console.error('[Auth] Sync queue processing failed:', error);
            });
          }
        }
      }
    } catch (error) {
      const isTimeout = error instanceof Error && error.message === 'AUTH_TIMEOUT';
      const isSessionMissing = error instanceof Error && error.name === 'AuthSessionMissingError';

      if (!isSessionMissing && !isTimeout) {
        console.error('Auth error:', error);
      }

      const newState: AuthState = {
        user: null,
        subscription: null,
        loading: false,
        error: isSessionMissing || isTimeout ? null : '認証エラーが発生しました',
      };
      notifyListeners(newState);
    } finally {
      isGlobalLoading = false;
    }
  }, [loadUserCore]);

  // Sign up with email/password
  const signUp = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) {
      return { success: false, error: 'Supabase not initialized' };
    }

    notifyListeners({ ...globalAuthState, loading: true, error: null });

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      notifyListeners({ ...globalAuthState, loading: false, error: error.message });
      return { success: false, error: error.message };
    }

    notifyListeners({ ...globalAuthState, loading: false });
    return { success: true, data };
  }, [getSupabase]);

  // Sign in with email/password
  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) {
      return { success: false, error: 'Supabase not initialized' };
    }

    notifyListeners({ ...globalAuthState, loading: true, error: null });

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      notifyListeners({ ...globalAuthState, loading: false, error: error.message });
      return { success: false, error: error.message };
    }

    await loadUser();
    return { success: true, data };
  }, [getSupabase, loadUser]);

  // Sign out
  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.auth.signOut();
    clearCachedSubscription();
    hybridRepository.clearSyncData();
    invalidateStatsCache();
    clearHomeCache();
    clearAllUserStats();
    notifyListeners({ user: null, subscription: null, loading: false, error: null });
    hasInitialized = false;
    hasOptimisticLoad = false;
  }, [getSupabase]);

  // Initialize auth state - only once globally
  useEffect(() => {
    isMountedRef.current = true;

    const supabase = getSupabase();
    if (!supabase) {
      notifyListeners({ ...globalAuthState, loading: false });
      return;
    }

    // Only initialize once globally
    if (!hasInitialized) {
      hasInitialized = true;
      loadUser();
    }

    // Refresh session when tab becomes visible again (prevents stale sessions)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().catch(() => {
          // Session refresh failed - will be handled by auth state change
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Listen for auth changes - only set up once per component instance
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        // Handle specific events
        if (event === 'SIGNED_OUT') {
          clearCachedSubscription();
          invalidateStatsCache();
          clearHomeCache();
          clearAllUserStats();
          notifyListeners({ user: null, subscription: null, loading: false, error: null });
          hasInitialized = false;
          hasOptimisticLoad = false;
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          // Reload user state on sign-in (e.g., after email confirmation callback)
          // and on token refresh
          loadUser();
        }
        // Ignore INITIAL_SESSION - handled by hasInitialized check above
      }
    );

    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [getSupabase, loadUser]);

  // Computed properties
  const isAuthenticated = !!state.user;
  const isPro = state.subscription?.status === 'active' && state.subscription?.plan === 'pro';

  return {
    ...state,
    isAuthenticated,
    isPro,
    signUp,
    signIn,
    signOut,
    refresh: loadUser,
  };
}
