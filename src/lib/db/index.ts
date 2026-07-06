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
import { hybridRepository } from './hybrid-repository';
import { readonlyRemoteRepository } from './readonly-remote-repository';

// Factory function to get the appropriate repository based on subscription
// Active Pro users: HybridRepository (IndexedDB + Supabase sync)
// Free users (never Pro): HybridRepository (IndexedDB + Supabase sync, 100-word cap
//   enforced server-side via RLS + DB triggers)
// Downgraded Pro users (wasPro=true): ReadonlyRemoteRepository (Supabase read-only)
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
  // Free users: cloud sync is now enabled (cross-device). The Free 100-word cap
  // is enforced server-side (RLS + enforce_free_word_limit trigger), so the
  // hybrid repository is safe to use here.
  return hybridRepository;
}
