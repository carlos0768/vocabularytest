// 自由入力の文法項目タグ (grammar_questions.grammar_point) を
// 文法マップのツリーノード (taxonomy.ts) に寄せる分類器。
//
// タグは ChatGPT が付けるため「仮定法過去完了」「仮定法・過去完了」「仮定法過去完了(混合)」
// のように表記がゆれる。正規化 → 完全一致 → キーワード部分一致 の順で判定し、
// どれにも当たらなければ null (= 未分類) を返す。
//
// サーバー側の集計と演習の絞り込みで同じ関数を使うので、DBやAIには一切依存しない。

import { GRAMMAR_TAXONOMY, walkGrammarTaxonomy, type GrammarTaxonomyNode } from './taxonomy';

/**
 * 表記ゆれを吸収するための正規化。
 * 全角/半角・大文字小文字・空白・区切り記号の違いを消す。
 */
export function normalizeGrammarPoint(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　]+/g, '')
    // 区切り・装飾記号はすべて落とす (「as ~ as」→「asas」)
    .replace(/[・。、．，,.\-–—~〜_/\\|:;!?'"“”‘’`()[\]【】「」『』{}<>+*#@$%&^]/g, '');
}

type ExactEntry = { nodeId: string; depth: number };
type KeywordEntry = { keyword: string; nodeId: string; depth: number };

const exactIndex = new Map<string, ExactEntry>();
const keywordIndex: KeywordEntry[] = [];

function registerExact(text: string, nodeId: string, depth: number): void {
  const key = normalizeGrammarPoint(text);
  if (!key) return;
  const existing = exactIndex.get(key);
  // 同じ表記が複数ノードに登録されたときは、より具体的な (深い) ノードを優先する
  if (!existing || depth > existing.depth) {
    exactIndex.set(key, { nodeId, depth });
  }
}

walkGrammarTaxonomy((node: GrammarTaxonomyNode, _parent, depth) => {
  registerExact(node.label, node.id, depth);
  registerExact(node.labelEn, node.id, depth);
  for (const alias of node.aliases ?? []) {
    registerExact(alias, node.id, depth);
  }
  for (const keyword of node.keywords ?? []) {
    const normalized = normalizeGrammarPoint(keyword);
    if (normalized) keywordIndex.push({ keyword: normalized, nodeId: node.id, depth });
  }
});

// 長いキーワードほど具体的 (「仮定法過去完了」が「仮定法」より優先)。
// 同じ長さなら深いノードを優先する。
keywordIndex.sort((a, b) => (b.keyword.length - a.keyword.length) || (b.depth - a.depth));

/**
 * 文法項目タグをツリーのノードIDに分類する。
 * 当てはまるノードが無ければ null (呼び出し側で未分類として扱う)。
 */
export function classifyGrammarPoint(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = normalizeGrammarPoint(raw);
  if (!normalized) return null;

  const exact = exactIndex.get(normalized);
  if (exact) return exact.nodeId;

  for (const entry of keywordIndex) {
    if (normalized.includes(entry.keyword)) return entry.nodeId;
  }

  return null;
}

/**
 * 分類結果を確認するための補助 (デバッグ・テスト用)。
 * ツリーに登録された表記の総数を返す。
 */
export function grammarClassifierSize(): { exact: number; keywords: number; categories: number } {
  return { exact: exactIndex.size, keywords: keywordIndex.length, categories: GRAMMAR_TAXONOMY.length };
}
