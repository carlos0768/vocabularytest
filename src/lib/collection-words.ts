import { remoteRepository } from '@/lib/db/remote-repository';
import type { Word } from '@/types';

/**
 * コレクションに所属する全プロジェクトの単語をまとめて取得する。
 * 各学習ページ（quiz, flashcard, sentence-quiz, dictation）から呼ばれる。
 */
export async function loadCollectionWords(collectionId: string): Promise<Word[]> {
  const colProjects = await remoteRepository.getCollectionProjects(collectionId);
  if (colProjects.length === 0) return [];

  const projectIds = colProjects.map((cp) => cp.projectId);
  const wordsByProject = await remoteRepository.getAllWordsByProjectIds(projectIds);

  return projectIds.flatMap((id) => wordsByProject[id] ?? []);
}
