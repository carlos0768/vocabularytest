// Data migration utility
// Migrates local IndexedDB data to Supabase when user upgrades to Pro

import { db } from './dexie';
import { remoteRepository } from './remote-repository';
import type { Project } from '@/types';

export interface MigrationResult {
  success: boolean;
  projectsMigrated: number;
  wordsMigrated: number;
  error?: string;
}

// Migrate all local data to Supabase
export async function migrateLocalToRemote(userId: string): Promise<MigrationResult> {
  try {
    // Get all local projects
    const localProjects = await db.projects
      .where('userId')
      .equals(userId)
      .toArray();

    if (localProjects.length === 0) {
      // Also check for guest data
      const guestProjects = await db.projects.toArray();
      if (guestProjects.length === 0) {
        return { success: true, projectsMigrated: 0, wordsMigrated: 0 };
      }
      // Use guest projects if no user-specific projects found
      return migrateProjects(guestProjects, userId);
    }

    return migrateProjects(localProjects, userId);
  } catch (error) {
    console.error('Migration error:', error);
    return {
      success: false,
      projectsMigrated: 0,
      wordsMigrated: 0,
      error: error instanceof Error ? error.message : 'Migration failed',
    };
  }
}

async function migrateProjects(
  localProjects: Project[],
  userId: string
): Promise<MigrationResult> {
  let projectsMigrated = 0;
  let wordsMigrated = 0;

  for (const localProject of localProjects) {
    // Create project in Supabase
    const remoteProject = await remoteRepository.createProject({
      userId,
      title: localProject.title,
    });

    projectsMigrated++;

    // Get words for this project
    const localWords = await db.words
      .where('projectId')
      .equals(localProject.id)
      .toArray();

    if (localWords.length > 0) {
      // Create words in Supabase with new project ID
      const wordsToCreate = localWords.map((w) => ({
        projectId: remoteProject.id,
        english: w.english,
        japanese: w.japanese,
        distractors: w.distractors,
        status: w.status,
      }));

      await remoteRepository.createWords(wordsToCreate);
      wordsMigrated += localWords.length;
    }

    // Mark local project as synced
    await db.projects.update(localProject.id, { isSynced: true });
  }

  return {
    success: true,
    projectsMigrated,
    wordsMigrated,
  };
}

// Clear all local data after successful migration
export async function clearLocalData(): Promise<void> {
  await db.projects.clear();
  await db.words.clear();
}

// Check if there's local data to migrate
export async function hasLocalData(): Promise<boolean> {
  const count = await db.projects.count();
  return count > 0;
}

// Get local data stats for migration preview
export async function getLocalDataStats(): Promise<{
  projects: number;
  words: number;
}> {
  const projects = await db.projects.count();
  const words = await db.words.count();
  return { projects, words };
}
