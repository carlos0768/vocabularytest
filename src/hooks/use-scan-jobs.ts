'use client';

import { useState, useEffect, useCallback } from 'react';
import { createBrowserClient, isSupabaseConfigured } from '@/lib/supabase';

export interface ScanJob {
  id: string;
  user_id: string;
  project_id: string | null;
  project_title: string;
  scan_mode: string;
  image_path: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export function useScanJobs() {
  const [completedJobs, setCompletedJobs] = useState<ScanJob[]>([]);
  const [hasActiveJobs, setHasActiveJobs] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setCompletedJobs([]);
      setHasActiveJobs(false);
      setLoading(false);
      return;
    }

    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        setCompletedJobs([]);
        setHasActiveJobs(false);
        setLoading(false);
        return;
      }

      const response = await fetch('/api/scan-jobs', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const jobs: ScanJob[] = data.jobs || [];
        // Filter to completed or failed jobs that haven't been acknowledged
        const finished = jobs.filter(
          (job: ScanJob) => job.status === 'completed' || job.status === 'failed'
        );
        setCompletedJobs(finished);
        setHasActiveJobs(jobs.some((job) => job.status === 'pending' || job.status === 'processing'));
      }
    } catch (error) {
      console.error('Failed to fetch scan jobs:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Acknowledge (dismiss) a completed job
  const acknowledgeJob = useCallback(async (jobId: string) => {
    if (!isSupabaseConfigured()) return;

    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) return;

      await fetch(`/api/scan-jobs?jobId=${jobId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      // Remove from local state
      setCompletedJobs(prev => prev.filter(job => job.id !== jobId));
    } catch (error) {
      console.error('Failed to acknowledge job:', error);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Poll faster while active jobs exist to reduce display delay.
  useEffect(() => {
    const intervalMs = hasActiveJobs ? 3000 : 30000;
    const interval = setInterval(() => {
      fetchJobs();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [fetchJobs, hasActiveJobs]);

  // Real-time updates for immediate completion detection.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const supabase = createBrowserClient();
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    const setup = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId || !mounted) return;

      const channel = supabase
        .channel(`scan-jobs-${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'scan_jobs',
            filter: `user_id=eq.${userId}`,
          },
          () => {
            fetchJobs();
          }
        )
        .subscribe();

      unsubscribe = () => {
        supabase.removeChannel(channel).catch(() => {
          // ignore
        });
      };
    };

    setup().catch(() => {
      // ignore
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [fetchJobs]);

  // Refresh once when tab becomes visible again.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchJobs();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [fetchJobs]);

  return {
    completedJobs,
    hasActiveJobs,
    loading,
    acknowledgeJob,
    refresh: fetchJobs,
  };
}
