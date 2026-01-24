import { LocalWordRepository } from './sqlite';
import type { WordRepository, SubscriptionStatus } from '../../types';

// Singleton instance for local repository
let localRepository: LocalWordRepository | null = null;

export function getRepository(_subscriptionStatus: SubscriptionStatus): WordRepository {
  void _subscriptionStatus;
  // For now, always use local repository
  // In the future, we'll add RemoteWordRepository for Pro users
  if (!localRepository) {
    localRepository = new LocalWordRepository();
  }
  return localRepository;
}

export { LocalWordRepository };
