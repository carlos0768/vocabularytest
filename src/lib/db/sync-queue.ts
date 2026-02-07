// Sync Queue Manager
// Handles queuing and processing offline changes for Pro users

import { getDb, type SyncQueueItem } from './dexie';
import { remoteRepository } from './remote-repository';
import type { Project, Word } from '@/types';

const MAX_RETRY_COUNT = 3;

export class SyncQueue {
  // Add an operation to the sync queue
  async add(item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'retryCount'>): Promise<void> {
    const db = getDb();
    await db.syncQueue.add({
      ...item,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    });
  }

  // Get all pending items
  async getPending(): Promise<SyncQueueItem[]> {
    const db = getDb();
    return db.syncQueue.toArray();
  }

  // Remove a processed item
  async remove(id: number): Promise<void> {
    const db = getDb();
    await db.syncQueue.delete(id);
  }

  // Increment retry count
  async incrementRetry(id: number): Promise<void> {
    const db = getDb();
    const item = await db.syncQueue.get(id);
    if (item) {
      await db.syncQueue.update(id, { retryCount: item.retryCount + 1 });
    }
  }

  // Clear all items (after full sync)
  async clear(): Promise<void> {
    const db = getDb();
    await db.syncQueue.clear();
  }

  // Process the sync queue
  async process(): Promise<{ success: number; failed: number }> {
    const pending = await this.getPending();
    let success = 0;
    let failed = 0;

    for (const item of pending) {
      if (item.retryCount >= MAX_RETRY_COUNT) {
        // Too many retries, remove from queue
        if (item.id) await this.remove(item.id);
        failed++;
        continue;
      }

      try {
        await this.processItem(item);
        if (item.id) await this.remove(item.id);
        success++;
      } catch (error) {
        console.error('[SyncQueue] Failed to process item:', error);
        if (item.id) await this.incrementRetry(item.id);
        failed++;
      }
    }

    return { success, failed };
  }

  // Process a single sync queue item
  private async processItem(item: SyncQueueItem): Promise<void> {
    const { operation, table, data } = item;

    switch (table) {
      case 'projects':
        await this.processProjectOperation(operation, data);
        break;
      case 'words':
        await this.processWordOperation(operation, data);
        break;
      default:
        throw new Error(`Unknown table: ${table}`);
    }
  }

  private async processProjectOperation(
    operation: SyncQueueItem['operation'],
    data: unknown
  ): Promise<void> {
    switch (operation) {
      case 'create': {
        const project = data as Project;
        await remoteRepository.createProjectWithId(project);
        break;
      }
      case 'update': {
        const { id, updates } = data as { id: string; updates: Record<string, unknown> };
        await remoteRepository.updateProject(id, updates);
        break;
      }
      case 'delete': {
        const { id } = data as { id: string };
        await remoteRepository.deleteProject(id);
        break;
      }
    }
  }

  private async processWordOperation(
    operation: SyncQueueItem['operation'],
    data: unknown
  ): Promise<void> {
    switch (operation) {
      case 'create': {
        const word = data as Word;
        await remoteRepository.createWordsWithIds([word]);
        break;
      }
      case 'update': {
        const { id, updates } = data as { id: string; updates: Record<string, unknown> };
        await remoteRepository.updateWord(id, updates);
        break;
      }
      case 'delete': {
        const { id } = data as { id: string };
        await remoteRepository.deleteWord(id);
        break;
      }
    }
  }
}

export const syncQueue = new SyncQueue();
