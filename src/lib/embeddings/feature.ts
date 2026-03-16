export const EMBEDDINGS_ENABLED = false;

export const EMBEDDINGS_DISABLED_MESSAGE = 'Embedding機能は一時停止中です';
export const SEMANTIC_SEARCH_DISABLED_MESSAGE = '意味検索は一時停止中です';
export const SIMILAR_WORDS_DISABLED_MESSAGE = '関連語機能は一時停止中です';

export function isEmbeddingsEnabled(): boolean {
  return EMBEDDINGS_ENABLED;
}
