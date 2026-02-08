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
export { SyncQueue, syncQueue } from './sync-queue';

import type { WordRepository, SubscriptionStatus } from '@/types';
import { localRepository } from './local-repository';
import { hybridRepository } from './hybrid-repository';

// Factory function to get the appropriate repository based on subscription
// Free users: LocalRepository (IndexedDB only)
// Pro users: HybridRepository (IndexedDB + Supabase sync)
export function getRepository(
  subscriptionStatus: SubscriptionStatus = 'free'
): WordRepository {
  if (subscriptionStatus === 'active') {
    // Pro users: Use hybrid repository for offline support
    return hybridRepository;
  }
  return localRepository;
}
