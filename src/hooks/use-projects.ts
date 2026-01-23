'use client';

import { useState, useEffect, useCallback } from 'react';
import { getRepository } from '@/lib/db';
import { getGuestUserId } from '@/lib/utils';
import type { Project } from '@/types';

// Hook for managing projects with local IndexedDB
export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const repository = getRepository('free');

  // Load projects
  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const userId = getGuestUserId();
      const data = await repository.getProjects(userId);
      setProjects(data);
    } catch (e) {
      setError('プロジェクトの読み込みに失敗しました');
      console.error('Failed to load projects:', e);
    } finally {
      setLoading(false);
    }
  }, [repository]);

  // Create project
  const createProject = useCallback(
    async (title: string): Promise<Project | null> => {
      try {
        const userId = getGuestUserId();
        const project = await repository.createProject({ userId, title });
        setProjects((prev) => [project, ...prev]);
        return project;
      } catch (e) {
        setError('プロジェクトの作成に失敗しました');
        console.error('Failed to create project:', e);
        return null;
      }
    },
    [repository]
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

  // Initial load
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

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
