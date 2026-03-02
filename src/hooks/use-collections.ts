'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { remoteRepository } from '@/lib/db/remote-repository';
import type { Collection, CollectionProject } from '@/types';

export type CollectionStats = Record<string, { projectCount: number; wordCount: number; masteredCount: number }>;
export type CollectionPreviews = Record<string, { id: string; title: string; iconImage?: string }[]>;

interface CollectionsPayload {
  collections: Collection[];
  stats: CollectionStats;
  previews: CollectionPreviews;
}

let collectionsCache: { userId: string; payload: CollectionsPayload } | null = null;
let collectionsInFlight: { userId: string; promise: Promise<CollectionsPayload> } | null = null;

function getCachedPayload(userId: string): CollectionsPayload | null {
  if (!collectionsCache || collectionsCache.userId !== userId) return null;
  return collectionsCache.payload;
}

function setCachedPayload(userId: string, payload: CollectionsPayload) {
  collectionsCache = { userId, payload };
}

function clearCollectionsCache() {
  collectionsCache = null;
  collectionsInFlight = null;
}

function patchCachedPayload(userId: string, updater: (payload: CollectionsPayload) => CollectionsPayload) {
  if (!collectionsCache || collectionsCache.userId !== userId) return;
  collectionsCache = {
    userId,
    payload: updater(collectionsCache.payload),
  };
}

async function fetchCollectionsPayload(userId: string): Promise<CollectionsPayload> {
  if (collectionsInFlight && collectionsInFlight.userId === userId) {
    return collectionsInFlight.promise;
  }

  const promise = (async () => {
    const data = await remoteRepository.getCollections(userId);
    if (data.length === 0) {
      return { collections: data, stats: {}, previews: {} };
    }

    const ids = data.map((collection) => collection.id);
    const [stats, previews] = await Promise.all([
      remoteRepository.getCollectionStats(ids),
      remoteRepository.getCollectionPreviews(ids),
    ]);

    return {
      collections: data,
      stats,
      previews,
    };
  })();

  collectionsInFlight = { userId, promise };

  try {
    return await promise;
  } finally {
    if (collectionsInFlight?.promise === promise) {
      collectionsInFlight = null;
    }
  }
}

export function useCollections() {
  const { user, isPro, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const initialPayload = userId ? getCachedPayload(userId) : null;

  const [collections, setCollections] = useState<Collection[]>(() => initialPayload?.collections ?? []);
  const [stats, setStats] = useState<CollectionStats>(() => initialPayload?.stats ?? {});
  const [previews, setPreviews] = useState<CollectionPreviews>(() => initialPayload?.previews ?? {});
  const [loading, setLoading] = useState(() => initialPayload === null);

  const applyPayload = useCallback((payload: CollectionsPayload) => {
    setCollections(payload.collections);
    setStats(payload.stats);
    setPreviews(payload.previews);
  }, []);

  const loadCollections = useCallback(async (force = false) => {
    if (authLoading) return;

    if (!isPro || !userId) {
      setCollections([]);
      setStats({});
      setPreviews({});
      setLoading(false);
      clearCollectionsCache();
      return;
    }

    const cached = force ? null : getCachedPayload(userId);
    if (cached) {
      applyPayload(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const payload = await fetchCollectionsPayload(userId);
      setCachedPayload(userId, payload);
      applyPayload(payload);
    } catch (e) {
      console.error('Failed to load collections:', e);
    } finally {
      setLoading(false);
    }
  }, [applyPayload, authLoading, isPro, userId]);

  useEffect(() => {
    if (!authLoading) {
      loadCollections();
    }
  }, [authLoading, loadCollections]);

  const createCollection = useCallback(
    async (name: string, description?: string): Promise<Collection | null> => {
      if (!userId) return null;
      try {
        const collection = await remoteRepository.createCollection({
          userId,
          name,
          description,
        });
        setCollections((prev) => [collection, ...prev]);
        patchCachedPayload(userId, (payload) => ({
          ...payload,
          collections: [collection, ...payload.collections],
          stats: {
            ...payload.stats,
            [collection.id]: { projectCount: 0, wordCount: 0, masteredCount: 0 },
          },
          previews: {
            ...payload.previews,
            [collection.id]: [],
          },
        }));
        return collection;
      } catch (e) {
        console.error('Failed to create collection:', e);
        return null;
      }
    },
    [userId]
  );

  const updateCollection = useCallback(
    async (id: string, updates: Partial<Pick<Collection, 'name' | 'description'>>): Promise<boolean> => {
      try {
        await remoteRepository.updateCollection(id, updates);
        setCollections((prev) =>
          prev.map((c) => (c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c))
        );
        if (userId) {
          patchCachedPayload(userId, (payload) => ({
            ...payload,
            collections: payload.collections.map((collection) =>
              collection.id === id
                ? { ...collection, ...updates, updatedAt: new Date().toISOString() }
                : collection
            ),
          }));
        }
        return true;
      } catch (e) {
        console.error('Failed to update collection:', e);
        return false;
      }
    },
    [userId]
  );

  const deleteCollection = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await remoteRepository.deleteCollection(id);
        setCollections((prev) => prev.filter((c) => c.id !== id));
        setStats((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setPreviews((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        if (userId) {
          patchCachedPayload(userId, (payload) => {
            const nextStats = { ...payload.stats };
            delete nextStats[id];
            const nextPreviews = { ...payload.previews };
            delete nextPreviews[id];
            return {
              ...payload,
              collections: payload.collections.filter((collection) => collection.id !== id),
              stats: nextStats,
              previews: nextPreviews,
            };
          });
        }
        return true;
      } catch (e) {
        console.error('Failed to delete collection:', e);
        return false;
      }
    },
    [userId]
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
    stats,
    previews,
    loading,
    createCollection,
    updateCollection,
    deleteCollection,
    getCollectionProjects,
    addProjectsToCollection,
    removeProjectFromCollection,
    refresh: () => loadCollections(true),
  };
}
