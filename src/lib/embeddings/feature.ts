const EMBEDDINGS_ENABLED = false;

export const EMBEDDINGS_DISABLED_MESSAGE = 'Embedding機能は一時停止中です';

export function isEmbeddingsEnabled(): boolean {
  return EMBEDDINGS_ENABLED;
}
