'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createBrowserClient } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { Subscription, SubscriptionStatus, SubscriptionPlan } from '@/types';

interface AuthState {
  user: User | null;
  subscription: Subscription | null;
  loading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    subscription: null,
    loading: true,
    error: null,
  });

  // Refs to track component lifecycle
  const isMountedRef = useRef(true);
  const isLoadingRef = useRef(false);

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
      return { user: null, subscription: null };
    }

    // Fetch subscription
    const { data: subscriptionData, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (subError && subError.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is okay
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

    return { user, subscription };
  }, [getSupabase]);

  // Public loadUser function with deduplication and timeout
  const loadUser = useCallback(async () => {
    // Prevent concurrent calls
    if (isLoadingRef.current) {
      return;
    }
    isLoadingRef.current = true;

    try {
      // Add timeout to prevent infinite loading
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('AUTH_TIMEOUT')), 5000);
      });

      const result = await Promise.race([
        loadUserCore(),
        timeoutPromise,
      ]);

      if (isMountedRef.current) {
        setState({
          user: result.user,
          subscription: result.subscription,
          loading: false,
          error: null,
        });
      }
    } catch (error) {
      if (!isMountedRef.current) return;

      const isTimeout = error instanceof Error && error.message === 'AUTH_TIMEOUT';
      const isSessionMissing = error instanceof Error && error.name === 'AuthSessionMissingError';

      if (!isSessionMissing && !isTimeout) {
        console.error('Auth error:', error);
      }

      setState({
        user: null,
        subscription: null,
        loading: false,
        error: isSessionMissing || isTimeout ? null : '認証エラーが発生しました',
      });
    } finally {
      isLoadingRef.current = false;
    }
  }, [loadUserCore]);

  // Sign up with email/password
  const signUp = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) {
      return { success: false, error: 'Supabase not initialized' };
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setState((prev) => ({ ...prev, loading: false, error: error.message }));
      return { success: false, error: error.message };
    }

    setState((prev) => ({ ...prev, loading: false }));
    return { success: true, data };
  }, [getSupabase]);

  // Sign in with email/password
  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) {
      return { success: false, error: 'Supabase not initialized' };
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setState((prev) => ({ ...prev, loading: false, error: error.message }));
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
    setState({ user: null, subscription: null, loading: false, error: null });
  }, [getSupabase]);

  // Initialize auth state
  useEffect(() => {
    isMountedRef.current = true;

    const supabase = getSupabase();
    if (!supabase) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }

    // Load user on mount
    loadUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (!isMountedRef.current) return;

        // Handle specific events
        if (event === 'SIGNED_OUT') {
          setState({ user: null, subscription: null, loading: false, error: null });
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          // Reload user data when signed in or token refreshed
          loadUser();
        }
        // Ignore INITIAL_SESSION - we handle that with loadUser() above
      }
    );

    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
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
