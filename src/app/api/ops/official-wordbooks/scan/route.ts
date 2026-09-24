import { NextRequest, NextResponse } from 'next/server';
import {
  extractCircledWordsFromImage,
  extractEikenWordsFromImage,
  extractIdiomsFromImage,
  extractWordsFromImage,
} from '@/lib/ai';
import { getAPIKeys } from '@/lib/ai/config';
import { generateQuizContentForWords } from '@/lib/ai/generate-quiz-content';
import { getMissingProviderKey } from '@/lib/scan/mode-provider';
import { backfillMissingJapaneseTranslationsWithMetadata } from '@/lib/words/backfill-japanese';
import { requireAdminSecret } from '@/lib/ops/admin-auth';
import {
  applyScanEnrichment,
  buildScanEnrichmentInputs,
  describeScanGaps,
  normalizeScannedWords,
  officialWordbookScanRequestSchema,
  type OfficialWordbookScanMode,
} from '@/lib/official-wordbooks/scan';
import type {
  OfficialWordbookEikenLevelValue,
  OfficialWordbookWordInput,
} from '@/lib/official-wordbooks/editor';

// 公式単語帳エディター(/ops/official-wordbooks)のカメラスキャン。
// 画像1枚につき1リクエストで、抽出した単語をエディターの行の形で返すだけ。
// DBには何も書かない(保存は既存の POST/PATCH が行う)。
//
// ユーザー向けの /api/extract とは意図的に別ルートにしてある:
// あちらはログインユーザーのPro判定・コイン消費・スキャン回数RPCが前提で、
// ここはログインを持たない ADMIN_SECRET のオペレーター専用だから。
// この2つを1本にまとめると、コイン消費や課金判定をバイパスする経路を
// 作ることになる。

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function extractForMode(
  mode: OfficialWordbookScanMode,
  image: string,
  apiKeys: { gemini?: string; openai?: string },
  eikenLevel: OfficialWordbookEikenLevelValue | null,
): Promise<{ success: true; words: unknown[] } | { success: false; error: string }> {
  switch (mode) {
    case 'circled': {
      const result = await extractCircledWordsFromImage(image, apiKeys, { eikenLevel });
      return result.success ? { success: true, words: result.data.words } : result;
    }
    case 'idiom': {
      const result = await extractIdiomsFromImage(image, apiKeys);
      return result.success ? { success: true, words: result.data.words } : result;
    }
    case 'eiken': {
      // 英検モードのレベル必須はリクエストスキーマ側で担保している。
      const result = await extractEikenWordsFromImage(image, apiKeys, eikenLevel);
      return result.success ? { success: true, words: result.data.words } : result;
    }
    case 'all':
    default: {
      const result = await extractWordsFromImage(image, apiKeys, { eikenLevel });
      return result.success ? { success: true, words: result.data.words } : result;
    }
  }
}

/**
 * ダミー選択肢・例文・発音・品詞の欠けている分だけを補う。
 * 生成に失敗しても抽出できた単語は返したいので、失敗は握って
 * 注意書き(warnings)として管理者に見せる。
 */
async function enrichScannedWords(
  words: OfficialWordbookWordInput[],
): Promise<{ words: OfficialWordbookWordInput[]; warning: string | null }> {
  const inputs = buildScanEnrichmentInputs(words);
  if (inputs.length === 0) return { words, warning: null };

  try {
    const results = await generateQuizContentForWords(inputs);
    return { words: applyScanEnrichment(words, results), warning: null };
  } catch (error) {
    console.error('[OpsOfficialWordbookScan] enrichment failed:', error);
    return { words, warning: 'ダミー選択肢・例文の自動生成に失敗しました(単語は読み取れています)' };
  }
}

export async function POST(request: NextRequest) {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => null);
    const parsed = officialWordbookScanRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid scan payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { image, mode, enrich } = parsed.data;
    const eikenLevel = parsed.data.eikenLevel ?? null;

    const apiKeys = getAPIKeys();
    const missingProvider = getMissingProviderKey(mode, apiKeys);
    if (missingProvider) {
      return NextResponse.json(
        { success: false, error: `${missingProvider} のAPIキーが未設定です` },
        { status: 503 },
      );
    }

    const extracted = await extractForMode(mode, image, apiKeys, eikenLevel);
    if (!extracted.success) {
      return NextResponse.json({ success: false, error: extracted.error }, { status: 422 });
    }

    const normalized = normalizeScannedWords(extracted.words);
    if (normalized.words.length === 0) {
      return NextResponse.json(
        { success: false, error: '画像から単語を読み取れませんでした' },
        { status: 422 },
      );
    }

    const warnings: string[] = [];

    // 訳が取れなかった単語はAI翻訳で埋める。公式単語帳は訳が空だと
    // クイズにならないので、生成コストより穴を埋める方を優先する。
    let words = normalized.words;
    try {
      const backfilled = await backfillMissingJapaneseTranslationsWithMetadata(words);
      words = backfilled.words;
    } catch (error) {
      console.error('[OpsOfficialWordbookScan] japanese backfill failed:', error);
      warnings.push('日本語訳の自動補完に失敗しました');
    }

    if (enrich) {
      const enriched = await enrichScannedWords(words);
      words = enriched.words;
      if (enriched.warning) warnings.push(enriched.warning);
    }

    warnings.push(...describeScanGaps(words));

    return NextResponse.json({
      success: true,
      words,
      mode,
      droppedCount: normalized.dropped,
      warnings,
    });
  } catch (error) {
    console.error('[OpsOfficialWordbookScan] scan failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to scan image' }, { status: 500 });
  }
}
