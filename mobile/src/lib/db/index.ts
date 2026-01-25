import { LocalWordRepository } from './sqlite';
import { RemoteWordRepository } from './remote-repository';
import type { WordRepository, SubscriptionStatus } from '../../types';

// Singleton instances
let localRepository: LocalWordRepository | null = null;
let remoteRepository: RemoteWordRepository | null = null;

export function getRepository(subscriptionStatus: SubscriptionStatus): WordRepository {
  // Pro users (active subscription) use Supabase (cloud sync)
  if (subscriptionStatus === 'active') {
    if (!remoteRepository) {
      remoteRepository = new RemoteWordRepository();
    }
    return remoteRepository;
  }

  // Free users use local SQLite
  if (!localRepository) {
    localRepository = new LocalWordRepository();
  }
  return localRepository;
}

export { LocalWordRepository, RemoteWordRepository };
