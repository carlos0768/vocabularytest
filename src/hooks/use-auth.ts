'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createBrowserClient } from '@/lib/supabase';
import type { User, SupabaseClient } from '@supabase/supabase-js';
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

  // Only create Supabase client on client-side
  const supabase = useMemo<SupabaseClient | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    try {
      return createBrowserClient();
    } catch {
      return null;
    }
  }, []);

  // Load user and subscription
  const loadUser = useCallback(async () => {
    if (!supabase) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        setState({ user: null, subscription: null, loading: false, error: null });
        return;
      }

      // Fetch subscription
      const { data: subscription, error: subError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (subError && subError.code !== 'PGRST116') {
        // PGRST116 = no rows returned, which is okay
        console.error('Failed to fetch subscription:', subError);
      }

      setState({
        user,
        subscription: subscription ? {
          id: subscription.id,
          userId: subscription.user_id,
          status: subscription.status as SubscriptionStatus,
          plan: subscription.plan as SubscriptionPlan,
          komojuSubscriptionId: subscription.komoju_subscription_id,
          komojuCustomerId: subscription.komoju_customer_id,
          currentPeriodStart: subscription.current_period_start,
          currentPeriodEnd: subscription.current_period_end,
          createdAt: subscription.created_at,
          updatedAt: subscription.updated_at,
        } : null,
        loading: false,
        error: null,
      });
    } catch (error) {
      // AuthSessionMissingError is expected when user is not logged in
      const isSessionMissing = error instanceof Error &&
        error.name === 'AuthSessionMissingError';

      if (!isSessionMissing) {
        console.error('Auth error:', error);
      }

      setState({
        user: null,
        subscription: null,
        loading: false,
        error: isSessionMissing ? null : '認証エラーが発生しました',
      });
    }
  }, [supabase]);

  // Sign up with email/password
  const signUp = useCallback(async (email: string, password: string) => {
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

    // Sign up successful - set loading to false
    setState((prev) => ({ ...prev, loading: false }));
    return { success: true, data };
  }, [supabase]);

  // Sign in with email/password
  const signIn = useCallback(async (email: string, password: string) => {
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
  }, [supabase, loadUser]);

  // Sign out
  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setState({ user: null, subscription: null, loading: false, error: null });
  }, [supabase]);

  // Listen for auth changes
  useEffect(() => {
    if (!supabase) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }

    // Flag to prevent race conditions
    let isMounted = true;

    const initAuth = async () => {
      await loadUser();
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, _session) => {
        if (!isMounted) return;

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          await loadUser();
        } else if (event === 'SIGNED_OUT') {
          setState({ user: null, subscription: null, loading: false, error: null });
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, loadUser]);

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
