'use client';

import { useState, useEffect, useCallback } from 'react';
import { createBrowserClient } from '@/lib/supabase';

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
  const [loading, setLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
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
        // Filter to completed or failed jobs that haven't been acknowledged
        const finished = (data.jobs || []).filter(
          (job: ScanJob) => job.status === 'completed' || job.status === 'failed'
        );
        setCompletedJobs(finished);
      }
    } catch (error) {
      console.error('Failed to fetch scan jobs:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Acknowledge (dismiss) a completed job
  const acknowledgeJob = useCallback(async (jobId: string) => {
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

  // Poll for updates every 30 seconds if there are pending jobs
  useEffect(() => {
    const interval = setInterval(() => {
      fetchJobs();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchJobs]);

  return {
    completedJobs,
    loading,
    acknowledgeJob,
    refresh: fetchJobs,
  };
}
