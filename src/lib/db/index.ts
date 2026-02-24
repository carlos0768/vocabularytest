// Database layer exports
// Repository Pattern: UI layer imports from here without knowing the storage backend

export { db, getDb } from './dexie';
export { LocalWordRepository, localRepository } from './local-repository';
export { RemoteWordRepository, remoteRepository } from './remote-repository';
export {
  HybridWordRepository,
  hybridRepository,
  FULL_SYNC_INTERVAL_MS,
  shouldRunFullSync,
} from './hybrid-repository';
export { ReadonlyRemoteRepository, readonlyRemoteRepository } from './readonly-remote-repository';
export { SyncQueue, syncQueue } from './sync-queue';

import type { WordRepository, SubscriptionStatus } from '@/types';
import { localRepository } from './local-repository';
import { hybridRepository } from './hybrid-repository';
import { readonlyRemoteRepository } from './readonly-remote-repository';

// Factory function to get the appropriate repository based on subscription
// Active Pro users: HybridRepository (IndexedDB + Supabase sync)
// Downgraded Pro users (wasPro=true): ReadonlyRemoteRepository (Supabase read-only)
// Free users (never Pro): LocalRepository (IndexedDB only)
export function getRepository(
  subscriptionStatus: SubscriptionStatus = 'free',
  wasPro: boolean = false,
): WordRepository {
  if (subscriptionStatus === 'active') {
    // Pro users: Use hybrid repository for offline support
    return hybridRepository;
  }
  if (wasPro) {
    // Downgraded users: Read-only access to Supabase data
    return readonlyRemoteRepository;
  }
  return localRepository;
}
