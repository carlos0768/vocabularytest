'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getRepository } from '@/lib/db';
import { getGuestUserId } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import type { Project } from '@/types';
import type { SubscriptionStatus } from '@/types';

// Hook for managing projects with appropriate storage based on subscription
export function useProjects() {
  const { user, subscription, isPro, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get repository based on subscription status
  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  // Get user ID based on authentication status
  const userId = useMemo(() => {
    return isPro && user ? user.id : getGuestUserId();
  }, [isPro, user]);

  // Load projects
  const loadProjects = useCallback(async () => {
    // Wait for auth to be ready
    if (authLoading) return;

    try {
      setLoading(true);
      setError(null);
      const data = await repository.getProjects(userId);
      setProjects(data);
    } catch (e) {
      setError('プロジェクトの読み込みに失敗しました');
      console.error('Failed to load projects:', e);
    } finally {
      setLoading(false);
    }
  }, [repository, userId, authLoading]);

  // Create project
  const createProject = useCallback(
    async (title: string): Promise<Project | null> => {
      try {
        const project = await repository.createProject({ userId, title });
        setProjects((prev) => [project, ...prev]);
        return project;
      } catch (e) {
        setError('プロジェクトの作成に失敗しました');
        console.error('Failed to create project:', e);
        return null;
      }
    },
    [repository, userId]
  );

  // Delete project
  const deleteProject = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await repository.deleteProject(id);
        setProjects((prev) => prev.filter((p) => p.id !== id));
        return true;
      } catch (e) {
        setError('プロジェクトの削除に失敗しました');
        console.error('Failed to delete project:', e);
        return false;
      }
    },
    [repository]
  );

  // Update project
  const updateProject = useCallback(
    async (id: string, updates: Partial<Project>): Promise<boolean> => {
      try {
        await repository.updateProject(id, updates);
        setProjects((prev) =>
          prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
        );
        return true;
      } catch (e) {
        setError('プロジェクトの更新に失敗しました');
        console.error('Failed to update project:', e);
        return false;
      }
    },
    [repository]
  );

  // Initial load - wait for auth to be ready
  useEffect(() => {
    if (!authLoading) {
      loadProjects();
    }
  }, [authLoading, loadProjects]);

  return {
    projects,
    loading,
    error,
    createProject,
    deleteProject,
    updateProject,
    refresh: loadProjects,
  };
}
