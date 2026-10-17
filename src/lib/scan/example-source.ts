/**
 * スキャンで付ける例文の出どころ。
 *
 * 2026-10-15 から、スキャンでは例文を AI で生成しない。単語ごとに毎回 GPT を
 * 呼ぶとコストが語数に比例して膨らむので、共通辞書 (英語は `lexicon_entries`、
 * 古典語は `classical_entries`) に貯まっている例文だけを付ける。辞書に例文が
 * 無い語は例文なしで保存される。
 *
 * 止めている間:
 * - スキャン画面の「例文生成 (+2コイン)」トグルを出さず、コインも取らない
 *   (`/api/extract` と `/api/scan-jobs/create` が `includeExamples` を false に倒す)
 * - 例文のジャンル設定やトグルに関係なく、辞書の例文は常に転記する
 * - 保存後のクイズ prefill も例文を作らない (`includeExamples: false` で呼ばれる)
 *
 * 戻すときはこの定数を true にするだけでよい (以前の挙動: トグルでオプトイン、
 * ジャンル指定ユーザーは辞書の例文を使わず毎回ジャンル別に生成)。
 */
export const SCAN_EXAMPLE_GENERATION_ENABLED = false;

/**
 * スキャンで例文を AI 生成するか (= +2コインを取るか)。
 * クライアントから `includeExamples: true` が来ても、停止中は false。
 */
export function shouldGenerateScanExamples(
  requested: boolean,
  enabled: boolean = SCAN_EXAMPLE_GENERATION_ENABLED,
): boolean {
  return enabled && requested;
}

/**
 * 辞書に貯まった英語の例文を、スキャンした語へ転記するか。
 *
 * 生成を止めている間は常に転記する (例文の出どころがここしか無い)。
 * 生成が有効なときは従来どおり、オプトインした人だけに転記し、ジャンル指定の
 * 人には転記しない (ジャンル別に作り直すため)。
 */
export function shouldAttachStockedScanExamples(
  input: { includeExamples: boolean; hasExampleGenres: boolean },
  enabled: boolean = SCAN_EXAMPLE_GENERATION_ENABLED,
): boolean {
  if (!enabled) return true;
  return input.includeExamples && !input.hasExampleGenres;
}

/**
 * 古典語の例文を用意するときの方針。
 * - `null`: 何もしない (生成が有効で、オプトインしていない)
 * - `cacheOnly: true`: 共通辞書に貯まった例文だけを付ける
 * - `cacheOnly: false`: 辞書に無いぶんは生成する
 */
export function resolveClassicalScanExamplePolicy(
  includeExamples: boolean,
  enabled: boolean = SCAN_EXAMPLE_GENERATION_ENABLED,
): { cacheOnly: boolean } | null {
  if (!enabled) return { cacheOnly: true };
  return includeExamples ? { cacheOnly: false } : null;
}
