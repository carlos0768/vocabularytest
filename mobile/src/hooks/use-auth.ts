import { useState, useEffect, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { SubscriptionStatus, SubscriptionPlan, Subscription } from '../types';

export interface AuthState {
  user: User | null;
  session: Session | null;
  subscription: Subscription | null;
  loading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    subscription: null,
    loading: true,
    error: null,
  });

  // Load subscription data
  const loadSubscription = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading subscription:', error);
        return null;
      }

      return data as Subscription | null;
    } catch (error) {
      console.error('Failed to load subscription:', error);
      return null;
    }
  }, []);

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('Error getting session:', error);
          if (mounted) {
            setState((prev) => ({ ...prev, loading: false, error: error.message }));
          }
          return;
        }

        if (session?.user && mounted) {
          const subscription = await loadSubscription(session.user.id);
          setState({
            user: session.user,
            session,
            subscription,
            loading: false,
            error: null,
          });
        } else if (mounted) {
          setState({
            user: null,
            session: null,
            subscription: null,
            loading: false,
            error: null,
          });
        }
      } catch (error) {
        console.error('Auth init error:', error);
        if (mounted) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }));
        }
      }
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event);

        if (session?.user && mounted) {
          const subscription = await loadSubscription(session.user.id);
          setState({
            user: session.user,
            session,
            subscription,
            loading: false,
            error: null,
          });
        } else if (mounted) {
          setState({
            user: null,
            session: null,
            subscription: null,
            loading: false,
            error: null,
          });
        }
      }
    );

    return () => {
      mounted = false;
      authSubscription.unsubscribe();
    };
  }, [loadSubscription]);

  // Sign up with email and password
  const signUp = async (email: string, password: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setState((prev) => ({ ...prev, loading: false, error: error.message }));
        return { success: false, error: error.message, needsConfirmation: false };
      }

      // Check if email confirmation is required
      if (data.user && !data.session) {
        setState((prev) => ({ ...prev, loading: false }));
        return {
          success: true,
          error: null,
          needsConfirmation: true,
        };
      }

      setState((prev) => ({ ...prev, loading: false }));
      return { success: true, error: null, needsConfirmation: false };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sign up failed';
      setState((prev) => ({ ...prev, loading: false, error: errorMessage }));
      return { success: false, error: errorMessage, needsConfirmation: false };
    }
  };

  // Sign in with email and password
  const signIn = async (email: string, password: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setState((prev) => ({ ...prev, loading: false, error: error.message }));
        return { success: false, error: error.message };
      }

      if (data.user) {
        const subscription = await loadSubscription(data.user.id);
        setState({
          user: data.user,
          session: data.session,
          subscription,
          loading: false,
          error: null,
        });
      }

      return { success: true, error: null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sign in failed';
      setState((prev) => ({ ...prev, loading: false, error: errorMessage }));
      return { success: false, error: errorMessage };
    }
  };

  // Sign out
  const signOut = async () => {
    setState((prev) => ({ ...prev, loading: true }));

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        setState((prev) => ({ ...prev, loading: false, error: error.message }));
        return { success: false, error: error.message };
      }

      setState({
        user: null,
        session: null,
        subscription: null,
        loading: false,
        error: null,
      });

      return { success: true, error: null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sign out failed';
      setState((prev) => ({ ...prev, loading: false, error: errorMessage }));
      return { success: false, error: errorMessage };
    }
  };

  // Reset password
  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, error: null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Reset password failed';
      return { success: false, error: errorMessage };
    }
  };

  // Refresh subscription
  const refreshSubscription = async () => {
    if (!state.user) return;

    const subscription = await loadSubscription(state.user.id);
    setState((prev) => ({ ...prev, subscription }));
  };

  return {
    ...state,
    isAuthenticated: !!state.user,
    isPro: state.subscription?.status === 'active' && state.subscription?.plan === 'pro',
    signUp,
    signIn,
    signOut,
    resetPassword,
    refreshSubscription,
  };
}
