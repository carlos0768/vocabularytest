import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocalWordRepository } from './sqlite';
import { RemoteWordRepository } from './remote-repository';
import { getGuestUserId } from '../utils';
import type { Project, Word } from '../../types';

const MIGRATION_VERSION = 'v1';
const MIGRATION_PREFIX = `merken_cloud_migration_${MIGRATION_VERSION}`;

export interface MigrationResult {
  success: boolean;
  skipped: boolean;
  reason?: string;
  projectsMigrated: number;
  wordsMigrated: number;
}

function getMigrationKey(userId: string): string {
  return `${MIGRATION_PREFIX}:${userId}`;
}

async function markMigrationComplete(userId: string): Promise<void> {
  await AsyncStorage.setItem(getMigrationKey(userId), new Date().toISOString());
}

async function hasCompletedMigration(userId: string): Promise<boolean> {
  const value = await AsyncStorage.getItem(getMigrationKey(userId));
  return Boolean(value);
}

function mapWordForRemote(word: Word, projectId: string) {
  return {
    projectId,
    english: word.english,
    japanese: word.japanese,
    japaneseSource: word.japaneseSource,
    lexiconEntryId: word.lexiconEntryId,
    cefrLevel: word.cefrLevel,
    distractors: word.distractors,
    exampleSentence: word.exampleSentence,
    exampleSentenceJa: word.exampleSentenceJa,
    pronunciation: word.pronunciation,
    partOfSpeechTags: word.partOfSpeechTags,
    relatedWords: word.relatedWords,
    usagePatterns: word.usagePatterns,
    insightsGeneratedAt: word.insightsGeneratedAt,
    insightsVersion: word.insightsVersion,
  };
}

async function collectLocalProjects(
  repository: LocalWordRepository,
  userId: string
): Promise<Project[]> {
  const guestUserId = await getGuestUserId();
  const candidateUserIds = guestUserId === userId ? [userId] : [userId, guestUserId];
  const projects: Project[] = [];
  const seenIds = new Set<string>();

  for (const candidateUserId of candidateUserIds) {
    const localProjects = await repository.getProjects(candidateUserId);

    for (const project of localProjects) {
      if (seenIds.has(project.id)) continue;
      seenIds.add(project.id);
      projects.push(project);
    }
  }

  return projects;
}

export async function migrateLocalDataToCloudIfNeeded(
  userId: string
): Promise<MigrationResult> {
  if (await hasCompletedMigration(userId)) {
    return {
      success: true,
      skipped: true,
      reason: 'already_migrated',
      projectsMigrated: 0,
      wordsMigrated: 0,
    };
  }

  const localRepository = new LocalWordRepository();
  const remoteRepository = new RemoteWordRepository();

  const remoteProjects = await remoteRepository.getProjects(userId);
  if (remoteProjects.length > 0) {
    await markMigrationComplete(userId);
    return {
      success: true,
      skipped: true,
      reason: 'remote_not_empty',
      projectsMigrated: 0,
      wordsMigrated: 0,
    };
  }

  const localProjects = await collectLocalProjects(localRepository, userId);
  if (localProjects.length === 0) {
    await markMigrationComplete(userId);
    return {
      success: true,
      skipped: true,
      reason: 'no_local_projects',
      projectsMigrated: 0,
      wordsMigrated: 0,
    };
  }

  let projectsMigrated = 0;
  let wordsMigrated = 0;

  for (const localProject of localProjects) {
    const remoteProject = await remoteRepository.createProject({
      userId,
      title: localProject.title,
      sourceLabels: localProject.sourceLabels,
      iconImage: localProject.iconImage,
    });

    projectsMigrated += 1;

    const localWords = await localRepository.getWords(localProject.id);
    if (localWords.length > 0) {
      await remoteRepository.createWords(
        localWords.map((word) => mapWordForRemote(word, remoteProject.id))
      );
      wordsMigrated += localWords.length;
    }

    await localRepository.updateProject(localProject.id, { isSynced: true });
  }

  await markMigrationComplete(userId);

  return {
    success: true,
    skipped: false,
    projectsMigrated,
    wordsMigrated,
  };
}
