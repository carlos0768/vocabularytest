// Database layer exports
// Repository Pattern: UI layer imports from here without knowing the storage backend

export { db, getDb } from './dexie';
export { LocalWordRepository, localRepository } from './local-repository';
export { RemoteWordRepository, remoteRepository } from './remote-repository';

import type { WordRepository, SubscriptionStatus } from '@/types';
import { localRepository } from './local-repository';
import { remoteRepository } from './remote-repository';

// Factory function to get the appropriate repository based on subscription
// Free users: LocalRepository (IndexedDB)
// Pro users: RemoteRepository (Supabase)
export function getRepository(
  subscriptionStatus: SubscriptionStatus = 'free'
): WordRepository {
  if (subscriptionStatus === 'active') {
    return remoteRepository;
  }
  return localRepository;
}
