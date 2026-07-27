/**
 * カスタム抽出モード（ユーザ定義の抽出プロンプト）の共通ロジック。
 *
 * 「どの単語を抽出するか」の指示だけをユーザが書き、出力フォーマット
 * （JSON契約・品詞タグ・日本語訳ルール）は常にサーバー側テンプレートが
 * 付与する。ここでは名前とプロンプトの正規化・上限、DBからの解決を扱う。
 *
 * 正規化は API / フック / 抽出プロンプト組み立ての共通入口。
 * 上限値は supabase/migrations/20260726090000_create_custom_scan_modes.sql の
 * CHECK 制約・上限トリガと対応しており、変更時は両方を同時に更新すること。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const MAX_CUSTOM_SCAN_MODE_NAME_LENGTH = 30;
export const MAX_CUSTOM_SCAN_MODE_PROMPT_LENGTH = 1000;
export const MAX_CUSTOM_SCAN_MODES_PER_USER = 20;

export interface CustomScanMode {
  id: string;
  name: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
}

/** 設定UIのサジェスト用。ユーザが1から書かなくても始められるようにする。 */
export const CUSTOM_SCAN_MODE_EXAMPLES: { name: string; prompt: string }[] = [
  {
    name: '赤ペンの単語だけ',
    prompt: '赤ペン・赤字で書かれた単語だけを抽出してください。黒字の単語は抽出しないでください。',
  },
  {
    name: '動詞だけ',
    prompt: '動詞（句動詞を含む）だけを抽出してください。名詞・形容詞・副詞は抽出しないでください。',
  },
  {
    name: '知らなそうな難単語',
    prompt:
      '高校生には難しい単語（英検準1級以上の水準）だけを抽出してください。中学レベルの基礎単語は抽出しないでください。',
  },
  {
    name: '例文中の単語も拾う',
    prompt:
      '見出し語だけでなく、例文・長文の中に出てくる重要語も抽出してください。基礎的すぎる語（be動詞・冠詞・代名詞など）は除外してください。',
  },
];

// 制御文字はAIプロンプトに混ぜない。改行だけは指示の可読性のため残す。
const CONTROL_CHARS_KEEPING_NEWLINES = /[\u0000-\u0009\u000B-\u001F\u007F]/g;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

function stripControlCharacters(value: string, options: { keepNewlines: boolean }): string {
  const pattern = options.keepNewlines ? CONTROL_CHARS_KEEPING_NEWLINES : CONTROL_CHARS;
  return value.replace(pattern, ' ');
}

/**
 * モード名を正規化する。空・長すぎる場合は null（= 不正な入力）。
 */
export function normalizeCustomScanModeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = stripControlCharacters(value, { keepNewlines: false })
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length === 0) return null;
  if (normalized.length > MAX_CUSTOM_SCAN_MODE_NAME_LENGTH) return null;
  return normalized;
}

/**
 * 抽出指示プロンプトを正規化する。空・長すぎる場合は null（= 不正な入力）。
 * 連続する空行は詰め、行末の空白は落とす。
 */
export function normalizeCustomScanModePrompt(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = stripControlCharacters(value, { keepNewlines: true })
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, '').trimStart())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (normalized.length === 0) return null;
  if (normalized.length > MAX_CUSTOM_SCAN_MODE_PROMPT_LENGTH) return null;
  return normalized;
}

export function mapCustomScanModeRow(row: {
  id: unknown;
  name: unknown;
  prompt: unknown;
  created_at: unknown;
  updated_at: unknown;
}): CustomScanMode | null {
  if (typeof row.id !== 'string') return null;
  const name = normalizeCustomScanModeName(row.name);
  const prompt = normalizeCustomScanModePrompt(row.prompt);
  if (!name || !prompt) return null;

  return {
    id: row.id,
    name,
    prompt,
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : '',
  };
}

export const CUSTOM_SCAN_MODE_SELECT = 'id, name, prompt, created_at, updated_at';

/**
 * 保存済みモードのプロンプトをサーバー側で解決する。
 * クライアントが送るIDは信用せず、必ず本人の行だけを引く。
 * 見つからない場合は null（呼び出し側で400にする）。
 */
export async function fetchCustomScanModePrompt(
  supabase: SupabaseClient,
  userId: string,
  customScanModeId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('custom_scan_modes')
    .select('prompt')
    .eq('id', customScanModeId)
    .eq('user_id', userId)
    .maybeSingle<{ prompt: unknown }>();

  if (error) {
    console.warn('[custom-scan-modes] Failed to resolve saved prompt:', error.message);
    return null;
  }

  return normalizeCustomScanModePrompt(data?.prompt);
}

export type ResolvedCustomPrompt =
  | { ok: true; prompt: string | null }
  | { ok: false; error: string };

/**
 * リクエストの customModeId / customPrompt から実際に使うプロンプトを決める。
 * - custom モードでないのに指定された場合は無視（プロンプトなし）
 * - custom モードなのに解決できない場合はエラー
 *
 * 保存済みモード（customModeId）を優先し、その場限りの入力（customPrompt）は
 * 保存前のお試し実行に使う。
 */
export async function resolveCustomExtractionPrompt(
  supabase: SupabaseClient,
  userId: string,
  params: {
    isCustomMode: boolean;
    customModeId?: string | null;
    customPrompt?: string | null;
  },
): Promise<ResolvedCustomPrompt> {
  if (!params.isCustomMode) {
    return { ok: true, prompt: null };
  }

  if (params.customModeId) {
    const saved = await fetchCustomScanModePrompt(supabase, userId, params.customModeId);
    if (!saved) {
      return { ok: false, error: '指定されたカスタム抽出モードが見つかりません' };
    }
    return { ok: true, prompt: saved };
  }

  const inline = normalizeCustomScanModePrompt(params.customPrompt);
  if (!inline) {
    return {
      ok: false,
      error: `抽出プロンプトを入力してください（${MAX_CUSTOM_SCAN_MODE_PROMPT_LENGTH}文字以内）`,
    };
  }

  return { ok: true, prompt: inline };
}
