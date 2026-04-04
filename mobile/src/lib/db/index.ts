import { Platform } from 'react-native';
import { RemoteWordRepository } from './remote-repository';
import { WebLocalWordRepository } from './web-local';
import type { WordRepository, SubscriptionStatus } from '../../types';

// Singleton instances
let localRepository: WordRepository | null = null;
let webLocalRepository: WebLocalWordRepository | null = null;
let remoteRepository: RemoteWordRepository | null = null;

export function getRepository(subscriptionStatus: SubscriptionStatus): WordRepository {
  // Pro users (active subscription) use Supabase (cloud sync)
  if (subscriptionStatus === 'active') {
    if (!remoteRepository) {
      remoteRepository = new RemoteWordRepository();
    }
    return remoteRepository;
  }

  if (Platform.OS === 'web') {
    if (!webLocalRepository) {
      webLocalRepository = new WebLocalWordRepository();
    }
    return webLocalRepository;
  }

  // Free users use local SQLite
  if (!localRepository) {
    const { LocalWordRepository } = require('./sqlite') as typeof import('./sqlite');
    localRepository = new LocalWordRepository();
  }
  return localRepository;
}

export { RemoteWordRepository, WebLocalWordRepository };
