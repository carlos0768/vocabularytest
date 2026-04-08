import { getDb } from '@/lib/db';
import type { Project, Word } from '@/types';
import type { SharedProjectImportResponse } from './types';
import { getDefaultSpacedRepetitionFields } from '../../../shared/db';

type ImportSharedProjectResult = SharedProjectImportResponse;

type SeedImportedSharedProjectInput = {
  project: Project;
  sourceWords: Word[];
  importedAt: string;
  wordMappings: SharedProjectImportResponse['wordMappings'];
};

export async function importSharedProject(
  projectId: string,
  sourceWordIds: string[],
): Promise<ImportSharedProjectResult> {
  const response = await fetch(`/api/shared-projects/${projectId}/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sourceWordIds }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || '共有単語帳の取り込みに失敗しました');
  }

  return {
    project: payload.project as Project,
    importedAt: payload.importedAt as string,
    wordMappings: (payload.wordMappings as SharedProjectImportResponse['wordMappings']) ?? [],
  };
}

export async function seedImportedSharedProjectLocally(
  input: SeedImportedSharedProjectInput,
): Promise<void> {
  const db = getDb();
  const defaultSR = getDefaultSpacedRepetitionFields();
  const sourceWordById = new Map(input.sourceWords.map((word) => [word.id, word] as const));

  const importedWords = input.wordMappings.map((mapping) => {
    const sourceWord = sourceWordById.get(mapping.sourceWordId);
    if (!sourceWord) {
      throw new Error(`Missing source word for imported mapping: ${mapping.sourceWordId}`);
    }

    return {
      ...sourceWord,
      id: mapping.targetWordId,
      projectId: input.project.id,
      lexiconEntryId: undefined,
      cefrLevel: undefined,
      relatedWords: undefined,
      usagePatterns: undefined,
      insightsGeneratedAt: undefined,
      insightsVersion: undefined,
      customSections: undefined,
      status: 'new' as const,
      createdAt: input.importedAt,
      lastReviewedAt: undefined,
      nextReviewAt: undefined,
      easeFactor: defaultSR.easeFactor,
      intervalDays: defaultSR.intervalDays,
      repetition: defaultSR.repetition,
      isFavorite: false,
    } satisfies Word;
  });

  await db.transaction('rw', db.projects, db.words, async () => {
    await db.projects.put(input.project);
    if (importedWords.length > 0) {
      await db.words.bulkPut(importedWords);
    }
  });
}
