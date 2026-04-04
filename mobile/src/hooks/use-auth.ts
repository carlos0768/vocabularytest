import { useCallback, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { hasSupabaseConfig, SUPABASE_CONFIG_ERROR, supabase } from '../lib/supabase';
import type { Subscription } from '../types';
import {
  getEffectiveSubscriptionStatus,
  isActiveProSubscription,
  wasProUser,
} from '../lib/subscription';

interface AuthState {
  user: User | null;
  session: Session | null;
  subscription: Subscription | null;
  loading: boolean;
  error: string | null;
}

type SubscriptionRow = Record<string, unknown>;

function mapSubscriptionRow(row: SubscriptionRow | null): Subscription | null {
  if (!row) return null;

  const rawStatus = (row.status as Subscription['status'] | null) ?? 'free';
  const rawPlan = (row.plan as Subscription['plan'] | null) ?? 'free';
  const proSource = (row.pro_source as Subscription['proSource'] | null) ?? 'none';
  const testProExpiresAt = (row.test_pro_expires_at as string | null | undefined) ?? null;
  const currentPeriodEnd = row.current_period_end as string | undefined;

  return {
    id: row.id as string,
    userId: row.user_id as string,
    status: getEffectiveSubscriptionStatus(
      rawStatus,
      rawPlan,
      proSource,
      testProExpiresAt,
      currentPeriodEnd
    ),
    plan: rawPlan,
    proSource,
    testProExpiresAt,
    komojuSubscriptionId: row.komoju_subscription_id as string | undefined,
    komojuCustomerId: row.komoju_customer_id as string | undefined,
    currentPeriodStart: row.current_period_start as string | undefined,
    currentPeriodEnd,
    cancelAtPeriodEnd: (row.cancel_at_period_end as boolean | null) ?? false,
    cancelRequestedAt: row.cancel_requested_at as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    subscription: null,
    loading: true,
    error: null,
  });

  const loadSubscription = useCallback(async (userId: string) => {
    if (!hasSupabaseConfig) return null;

    const { data, error } = await supabase
      .from('subscriptions')
      .select(
        'id,user_id,status,plan,pro_source,test_pro_expires_at,komoju_subscription_id,komoju_customer_id,current_period_start,current_period_end,cancel_at_period_end,cancel_requested_at,created_at,updated_at'
      )
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Failed to load subscription:', error);
      return null;
    }

    return mapSubscriptionRow((data as SubscriptionRow | null) ?? null);
  }, []);

  const hydrateState = useCallback(async (session: Session | null) => {
    if (!hasSupabaseConfig) {
      setState({
        user: null,
        session: null,
        subscription: null,
        loading: false,
        error: SUPABASE_CONFIG_ERROR,
      });
      return;
    }

    if (!session?.user) {
      setState({
        user: null,
        session: null,
        subscription: null,
        loading: false,
        error: null,
      });
      return;
    }

    const subscription = await loadSubscription(session.user.id);

    setState({
      user: session.user,
      session,
      subscription,
      loading: false,
      error: null,
    });
  }, [loadSubscription]);

  useEffect(() => {
    let active = true;

    async function initialize() {
      if (!hasSupabaseConfig) {
        setState({
          user: null,
          session: null,
          subscription: null,
          loading: false,
          error: SUPABASE_CONFIG_ERROR,
        });
        return;
      }

      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (!active) return;

        if (error) {
          setState({
            user: null,
            session: null,
            subscription: null,
            loading: false,
            error: error.message,
          });
          return;
        }

        await hydrateState(session);
      } catch (error) {
        if (!active) return;

        setState({
          user: null,
          session: null,
          subscription: null,
          loading: false,
          error: error instanceof Error ? error.message : '認証状態の取得に失敗しました。',
        });
      }
    }

    initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      void hydrateState(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [hydrateState]);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!hasSupabaseConfig) {
      return { success: false, error: SUPABASE_CONFIG_ERROR, needsConfirmation: false };
    }

    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const { data, error } = await supabase.auth.signUp({ email, password });

      if (error) {
        setState((current) => ({ ...current, loading: false, error: error.message }));
        return { success: false, error: error.message, needsConfirmation: false };
      }

      const needsConfirmation = Boolean(data.user && !data.session);

      if (!needsConfirmation) {
        await hydrateState(data.session);
      } else {
        setState((current) => ({ ...current, loading: false, error: null }));
      }

      return { success: true, error: null, needsConfirmation };
    } catch (error) {
      const message = error instanceof Error ? error.message : '登録に失敗しました。';
      setState((current) => ({ ...current, loading: false, error: message }));
      return { success: false, error: message, needsConfirmation: false };
    }
  }, [hydrateState]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!hasSupabaseConfig) {
      return { success: false, error: SUPABASE_CONFIG_ERROR };
    }

    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setState((current) => ({ ...current, loading: false, error: error.message }));
        return { success: false, error: error.message };
      }

      await hydrateState(data.session);
      return { success: true, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ログインに失敗しました。';
      setState((current) => ({ ...current, loading: false, error: message }));
      return { success: false, error: message };
    }
  }, [hydrateState]);

  const signOut = useCallback(async () => {
    if (!hasSupabaseConfig) {
      setState({
        user: null,
        session: null,
        subscription: null,
        loading: false,
        error: SUPABASE_CONFIG_ERROR,
      });
      return { success: false, error: SUPABASE_CONFIG_ERROR };
    }

    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        setState((current) => ({ ...current, loading: false, error: error.message }));
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
      const message = error instanceof Error ? error.message : 'ログアウトに失敗しました。';
      setState((current) => ({ ...current, loading: false, error: message }));
      return { success: false, error: message };
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (!hasSupabaseConfig) {
      return { success: false, error: SUPABASE_CONFIG_ERROR };
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      return { success: !error, error: error?.message ?? null };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'パスワードリセットに失敗しました。',
      };
    }
  }, []);

  const refreshSubscription = useCallback(async () => {
    if (!state.user) return;
    const subscription = await loadSubscription(state.user.id);
    setState((current) => ({ ...current, subscription }));
  }, [loadSubscription, state.user]);

  return {
    ...state,
    configError: SUPABASE_CONFIG_ERROR,
    isAuthenticated: Boolean(state.user),
    isPro: isActiveProSubscription(state.subscription),
    wasPro: wasProUser(state.subscription),
    signUp,
    signIn,
    signOut,
    resetPassword,
    refreshSubscription,
  };
}
