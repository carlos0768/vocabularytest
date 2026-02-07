'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { remoteRepository } from '@/lib/db/remote-repository';
import type { Collection, CollectionProject } from '@/types';

export function useCollections() {
  const { user, isPro, loading: authLoading } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCollections = useCallback(async () => {
    if (authLoading || !isPro || !user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await remoteRepository.getCollections(user.id);
      setCollections(data);
    } catch (e) {
      console.error('Failed to load collections:', e);
    } finally {
      setLoading(false);
    }
  }, [user, isPro, authLoading]);

  useEffect(() => {
    if (!authLoading) {
      loadCollections();
    }
  }, [authLoading, loadCollections]);

  const createCollection = useCallback(
    async (name: string, description?: string): Promise<Collection | null> => {
      if (!user) return null;
      try {
        const collection = await remoteRepository.createCollection({
          userId: user.id,
          name,
          description,
        });
        setCollections((prev) => [collection, ...prev]);
        return collection;
      } catch (e) {
        console.error('Failed to create collection:', e);
        return null;
      }
    },
    [user]
  );

  const updateCollection = useCallback(
    async (id: string, updates: Partial<Pick<Collection, 'name' | 'description'>>): Promise<boolean> => {
      try {
        await remoteRepository.updateCollection(id, updates);
        setCollections((prev) =>
          prev.map((c) => (c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c))
        );
        return true;
      } catch (e) {
        console.error('Failed to update collection:', e);
        return false;
      }
    },
    []
  );

  const deleteCollection = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await remoteRepository.deleteCollection(id);
        setCollections((prev) => prev.filter((c) => c.id !== id));
        return true;
      } catch (e) {
        console.error('Failed to delete collection:', e);
        return false;
      }
    },
    []
  );

  const getCollectionProjects = useCallback(
    async (collectionId: string): Promise<CollectionProject[]> => {
      try {
        return await remoteRepository.getCollectionProjects(collectionId);
      } catch (e) {
        console.error('Failed to get collection projects:', e);
        return [];
      }
    },
    []
  );

  const addProjectsToCollection = useCallback(
    async (collectionId: string, projectIds: string[]): Promise<boolean> => {
      try {
        await remoteRepository.addProjectsToCollection(collectionId, projectIds);
        return true;
      } catch (e) {
        console.error('Failed to add projects to collection:', e);
        return false;
      }
    },
    []
  );

  const removeProjectFromCollection = useCallback(
    async (collectionId: string, projectId: string): Promise<boolean> => {
      try {
        await remoteRepository.removeProjectFromCollection(collectionId, projectId);
        return true;
      } catch (e) {
        console.error('Failed to remove project from collection:', e);
        return false;
      }
    },
    []
  );

  return {
    collections,
    loading,
    createCollection,
    updateCollection,
    deleteCollection,
    getCollectionProjects,
    addProjectsToCollection,
    removeProjectFromCollection,
    refresh: loadCollections,
  };
}
