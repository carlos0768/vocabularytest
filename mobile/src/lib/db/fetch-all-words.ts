import { supabase } from '../supabase';
import { mapWordFromRow, type WordRow } from '../../shared/db';
import type { Word } from '../../types';

/**
 * Fetch all words for a user in a single paginated query
 * using a join through the projects table.
 * Avoids N+1 queries (one per project).
 */
export async function fetchAllWordsForUser(userId: string): Promise<Word[]> {
  const allWords: Word[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('words')
      .select('*, projects!inner(user_id)')
      .eq('projects.user_id', userId)
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`Failed to get all words: ${error.message}`);

    const rows = (data ?? []) as (WordRow & { projects: unknown })[];
    for (const row of rows) {
      allWords.push(mapWordFromRow(row));
    }

    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return allWords;
}
