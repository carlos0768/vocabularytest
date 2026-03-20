'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { remoteRepository } from '@/lib/db/remote-repository';
import { localRepository } from '@/lib/db/local-repository';
import type { Collection, CollectionProject } from '@/types';

export type CollectionStats = Record<string, { projectCount: number; wordCount: number; masteredCount: number }>;
export type CollectionPreviews = Record<string, { id: string; title: string; iconImage?: string }[]>;

interface CollectionsPayload {
  collections: Collection[];
  stats: CollectionStats;
  previews: CollectionPreviews;
}

// Cache for remote (Pro) only
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

async function fetchRemotePayload(userId: string): Promise<CollectionsPayload> {
  if (collectionsInFlight && collectionsInFlight.userId === userId) {
    return collectionsInFlight.promise;
  }

  const promise = (async () => {
    const data = await remoteRepository.getCollections(userId);
    if (data.length === 0) {
      return { collections: data, stats: {}, previews: {} };
    }

    const ids = data.map((c) => c.id);
    const [stats, previews] = await Promise.all([
      remoteRepository.getCollectionStats(ids),
      remoteRepository.getCollectionPreviews(ids),
    ]);

    return { collections: data, stats, previews };
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

async function fetchLocalPayload(userId: string): Promise<CollectionsPayload> {
  const data = await localRepository.getCollections(userId);
  if (data.length === 0) {
    return { collections: data, stats: {}, previews: {} };
  }

  const ids = data.map((c) => c.id);
  const [stats, previews] = await Promise.all([
    localRepository.getCollectionStats(ids),
    localRepository.getCollectionPreviews(ids),
  ]);

  return { collections: data, stats, previews };
}

export function useCollections() {
  const { user, isPro, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  // Only use cache for Pro (remote) users
  const initialPayload = (userId && isPro) ? getCachedPayload(userId) : null;

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

    if (!userId) {
      setCollections([]);
      setStats({});
      setPreviews({});
      setLoading(false);
      clearCollectionsCache();
      return;
    }

    if (isPro) {
      // Pro: remote (Supabase)
      const cached = force ? null : getCachedPayload(userId);
      if (cached) {
        applyPayload(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const payload = await fetchRemotePayload(userId);
        setCachedPayload(userId, payload);
        applyPayload(payload);
      } catch (e) {
        console.error('Failed to load collections:', e);
      } finally {
        setLoading(false);
      }
    } else {
      // Free: local (IndexedDB)
      setLoading(true);
      try {
        const payload = await fetchLocalPayload(userId);
        applyPayload(payload);
      } catch (e) {
        console.error('Failed to load local collections:', e);
      } finally {
        setLoading(false);
      }
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
        const collection = isPro
          ? await remoteRepository.createCollection({ userId, name, description })
          : await localRepository.createCollection({ userId, name, description });

        setCollections((prev) => [collection, ...prev]);

        if (isPro) {
          patchCachedPayload(userId, (payload) => ({
            ...payload,
            collections: [collection, ...payload.collections],
            stats: { ...payload.stats, [collection.id]: { projectCount: 0, wordCount: 0, masteredCount: 0 } },
            previews: { ...payload.previews, [collection.id]: [] },
          }));
        }

        return collection;
      } catch (e) {
        console.error('Failed to create collection:', e);
        return null;
      }
    },
    [userId, isPro]
  );

  const updateCollection = useCallback(
    async (id: string, updates: Partial<Pick<Collection, 'name' | 'description'>>): Promise<boolean> => {
      try {
        if (isPro) {
          await remoteRepository.updateCollection(id, updates);
        } else {
          await localRepository.updateCollection(id, updates);
        }

        setCollections((prev) =>
          prev.map((c) => (c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c))
        );

        if (isPro && userId) {
          patchCachedPayload(userId, (payload) => ({
            ...payload,
            collections: payload.collections.map((c) =>
              c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c
            ),
          }));
        }

        return true;
      } catch (e) {
        console.error('Failed to update collection:', e);
        return false;
      }
    },
    [isPro, userId]
  );

  const deleteCollection = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        if (isPro) {
          await remoteRepository.deleteCollection(id);
        } else {
          await localRepository.deleteCollection(id);
        }

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

        if (isPro && userId) {
          patchCachedPayload(userId, (payload) => {
            const nextStats = { ...payload.stats };
            delete nextStats[id];
            const nextPreviews = { ...payload.previews };
            delete nextPreviews[id];
            return {
              ...payload,
              collections: payload.collections.filter((c) => c.id !== id),
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
    [isPro, userId]
  );

  const getCollectionProjects = useCallback(
    async (collectionId: string): Promise<CollectionProject[]> => {
      try {
        return isPro
          ? await remoteRepository.getCollectionProjects(collectionId)
          : await localRepository.getCollectionProjects(collectionId);
      } catch (e) {
        console.error('Failed to get collection projects:', e);
        return [];
      }
    },
    [isPro]
  );

  const addProjectsToCollection = useCallback(
    async (collectionId: string, projectIds: string[]): Promise<boolean> => {
      try {
        if (isPro) {
          await remoteRepository.addProjectsToCollection(collectionId, projectIds);
        } else {
          await localRepository.addProjectsToCollection(collectionId, projectIds);
        }
        return true;
      } catch (e) {
        console.error('Failed to add projects to collection:', e);
        return false;
      }
    },
    [isPro]
  );

  const removeProjectFromCollection = useCallback(
    async (collectionId: string, projectId: string): Promise<boolean> => {
      try {
        if (isPro) {
          await remoteRepository.removeProjectFromCollection(collectionId, projectId);
        } else {
          await localRepository.removeProjectFromCollection(collectionId, projectId);
        }
        return true;
      } catch (e) {
        console.error('Failed to remove project from collection:', e);
        return false;
      }
    },
    [isPro]
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
