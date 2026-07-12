// 語彙レベル診断の静的問題バンク。
//
// scripts/generate-level-test-bank.ts が public/level-test/bank-v1.json を
// 事前生成しており、ランタイムはそれを fetch するだけ(DBアクセスなし)。
// ファイル名にバージョンを含めることでCDNに永続キャッシュさせる。

export type BankWord = {
  english: string;
  japanese: string;
  distractors: [string, string, string];
};

export type LevelTestBank = {
  version: number;
  // index 0..6 = 英検5級..1級(EIKEN_LEVEL_ORDER と同順)
  levels: BankWord[][];
};

export const LEVEL_TEST_BANK_URL = '/level-test/bank-v1.json';
const EXPECTED_LEVEL_COUNT = 7;

// バンクJSONはタプル形式([english, japanese, [d1, d2, d3]])で圧縮されている。
type RawBankTuple = [string, string, [string, string, string]];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseBankWord(value: unknown): BankWord | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const [english, japanese, distractors] = value as RawBankTuple;
  if (!isNonEmptyString(english) || !isNonEmptyString(japanese)) return null;
  if (!Array.isArray(distractors) || distractors.length !== 3) return null;
  if (!distractors.every(isNonEmptyString)) return null;
  return { english, japanese, distractors: [distractors[0], distractors[1], distractors[2]] };
}

// 形状を検証しつつパースする。生成スクリプトの出力とランタイムの両方で
// 使えるように、失敗時は例外を投げる(呼び出し側でハンドリング)。
export function parseLevelTestBank(json: unknown): LevelTestBank {
  if (!json || typeof json !== 'object') {
    throw new Error('Level test bank: not an object');
  }
  const { version, levels } = json as { version?: unknown; levels?: unknown };
  if (typeof version !== 'number') {
    throw new Error('Level test bank: missing version');
  }
  if (!Array.isArray(levels) || levels.length !== EXPECTED_LEVEL_COUNT) {
    throw new Error(`Level test bank: expected ${EXPECTED_LEVEL_COUNT} levels`);
  }

  const parsedLevels = levels.map((levelWords, levelIndex) => {
    if (!Array.isArray(levelWords) || levelWords.length === 0) {
      throw new Error(`Level test bank: level ${levelIndex} is empty`);
    }
    const words = levelWords.map(parseBankWord).filter((word): word is BankWord => word !== null);
    if (words.length === 0) {
      throw new Error(`Level test bank: level ${levelIndex} has no valid words`);
    }
    return words;
  });

  return { version, levels: parsedLevels };
}

export async function loadLevelTestBank(fetchImpl: typeof fetch = fetch): Promise<LevelTestBank> {
  const response = await fetchImpl(LEVEL_TEST_BANK_URL);
  if (!response.ok) {
    throw new Error(`Level test bank: HTTP ${response.status}`);
  }
  return parseLevelTestBank(await response.json());
}
