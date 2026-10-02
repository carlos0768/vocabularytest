/**
 * プロフィールに載せる資格(英検 / TOEFL / TOEIC)の共有ルール。
 *
 * 種類ごとに形式が違うので、それぞれのスコア体系をここで一元管理する。
 * サーバ(API バリデーション)とクライアント(入力 UI・表示)の両方から参照するので
 * ブラウザ専用 API には依存しないこと。
 *
 * 1種類(= `certificationKey`)につき1件だけ持つ。同じ種類を登録し直すと上書きする。
 */
import { z } from 'zod';

/**
 * 登録できる件数の上限(= 種類の数)。
 * `supabase/migrations/20261002130000_add_profile_certifications.sql` の CHECK 制約と同じ値。
 */
export const MAX_PROFILE_CERTIFICATIONS = 5;

// ---- 英検 ----------------------------------------------------------------

/** 低い級から順に並べる(2025年度新設の準2級プラスを含む)。 */
export const EIKEN_GRADES = ['5', '4', '3', 'pre2', 'pre2plus', '2', 'pre1', '1'] as const;
export type EikenGrade = (typeof EIKEN_GRADES)[number];

export const EIKEN_GRADE_LABELS: Record<EikenGrade, string> = {
  '5': '5級',
  '4': '4級',
  '3': '3級',
  pre2: '準2級',
  pre2plus: '準2級プラス',
  '2': '2級',
  pre1: '準1級',
  '1': '1級',
};

/** 英検CSEスコアの上限(1級の満点)。 */
export const EIKEN_CSE_MAX = 3400;

// ---- TOEFL ---------------------------------------------------------------

/**
 * TOEFL iBT は 2026年1月から 1.0〜6.0 (0.5刻み) のバンドスコアに移行し、
 * 移行期間中は従来の 0〜120 も併記される。どちらで覚えている人もいるので両方を受け付ける。
 */
export const TOEFL_SCALES = ['ibt', 'band'] as const;
export type ToeflScale = (typeof TOEFL_SCALES)[number];

export const TOEFL_SCALE_LABELS: Record<ToeflScale, string> = {
  ibt: 'iBT (0〜120)',
  band: '新スコア (1.0〜6.0)',
};

export const TOEFL_BAND_SCORES = Array.from({ length: 11 }, (_, i) => 1 + i * 0.5);

// ---- TOEIC ---------------------------------------------------------------

export const TOEIC_TESTS = ['lr', 'sw'] as const;
export type ToeicTest = (typeof TOEIC_TESTS)[number];

export const TOEIC_TEST_LABELS: Record<ToeicTest, string> = {
  lr: 'L&R',
  sw: 'S&W',
};

type ScoreRule = { min: number; max: number; step: number };

export const TOEFL_SCORE_RULES: Record<ToeflScale, ScoreRule> = {
  ibt: { min: 0, max: 120, step: 1 },
  band: { min: 1, max: 6, step: 0.5 },
};

export const TOEIC_SCORE_RULES: Record<ToeicTest, ScoreRule> = {
  lr: { min: 10, max: 990, step: 5 },
  sw: { min: 0, max: 400, step: 10 },
};

function fitsRule(score: number, rule: ScoreRule): boolean {
  if (!Number.isFinite(score) || score < rule.min || score > rule.max) return false;
  const steps = (score - rule.min) / rule.step;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

export function describeScoreRule(rule: ScoreRule): string {
  const fmt = (n: number) => (rule.step < 1 ? n.toFixed(1) : String(n));
  return rule.step === 1
    ? `${fmt(rule.min)}〜${fmt(rule.max)}`
    : `${fmt(rule.min)}〜${fmt(rule.max)}・${rule.step}刻み`;
}

// ---- スキーマ ------------------------------------------------------------

const eikenSchema = z.object({
  type: z.literal('eiken'),
  grade: z.enum(EIKEN_GRADES),
  cse: z
    .number()
    .int('CSEスコアは整数で入力してください')
    .min(0, 'CSEスコアが範囲外です')
    .max(EIKEN_CSE_MAX, 'CSEスコアが範囲外です')
    .nullable()
    .optional()
    .transform((value) => value ?? null),
}).strict();

const toeflSchema = z.object({
  type: z.literal('toefl'),
  scale: z.enum(TOEFL_SCALES),
  score: z.number(),
}).strict().superRefine((value, ctx) => {
  const rule = TOEFL_SCORE_RULES[value.scale];
  if (!fitsRule(value.score, rule)) {
    ctx.addIssue({ code: 'custom', path: ['score'], message: `TOEFLのスコアは${describeScoreRule(rule)}で入力してください` });
  }
});

const toeicSchema = z.object({
  type: z.literal('toeic'),
  test: z.enum(TOEIC_TESTS),
  score: z.number(),
}).strict().superRefine((value, ctx) => {
  const rule = TOEIC_SCORE_RULES[value.test];
  if (!fitsRule(value.score, rule)) {
    ctx.addIssue({ code: 'custom', path: ['score'], message: `TOEICのスコアは${describeScoreRule(rule)}で入力してください` });
  }
});

export const certificationSchema = z.discriminatedUnion('type', [eikenSchema, toeflSchema, toeicSchema]);

export type ProfileCertification = z.infer<typeof certificationSchema>;
export type CertificationType = ProfileCertification['type'];

export const CERTIFICATION_TYPE_LABELS: Record<CertificationType, string> = {
  eiken: '英検',
  toefl: 'TOEFL',
  toeic: 'TOEIC',
};

/** 1件だけ持てる単位。英検は1件、TOEFL・TOEIC は形式ごとに1件。 */
export function certificationKey(cert: ProfileCertification): string {
  switch (cert.type) {
    case 'eiken': return 'eiken';
    case 'toefl': return `toefl:${cert.scale}`;
    case 'toeic': return `toeic:${cert.test}`;
  }
}

const KEY_ORDER = ['eiken', 'toefl:ibt', 'toefl:band', 'toeic:lr', 'toeic:sw'];

/** 表示順(英検 → TOEFL → TOEIC)に並べる。 */
export function sortCertifications(list: ProfileCertification[]): ProfileCertification[] {
  return [...list].sort((a, b) => KEY_ORDER.indexOf(certificationKey(a)) - KEY_ORDER.indexOf(certificationKey(b)));
}

/** 保存用の配列スキーマ。同じ種類が重複していたら後のものを優先する。 */
export const certificationListSchema = z
  .array(certificationSchema)
  .max(MAX_PROFILE_CERTIFICATIONS * 2, '資格の数が多すぎます')
  .transform((list) => {
    const byKey = new Map<string, ProfileCertification>();
    for (const cert of list) byKey.set(certificationKey(cert), cert);
    return sortCertifications([...byKey.values()]);
  });

/** 同じ種類があれば置き換え、無ければ追加する。 */
export function upsertCertification(
  list: ProfileCertification[],
  cert: ProfileCertification,
): ProfileCertification[] {
  const key = certificationKey(cert);
  return sortCertifications([...list.filter((item) => certificationKey(item) !== key), cert]);
}

export function removeCertification(list: ProfileCertification[], key: string): ProfileCertification[] {
  return list.filter((item) => certificationKey(item) !== key);
}

/**
 * DB・キャッシュから読んだ値を安全に配列へ。
 * 1件でも壊れていたら全部を捨てるのではなく、読めるものだけ残す。
 */
export function parseStoredCertifications(value: unknown): ProfileCertification[] {
  if (!Array.isArray(value)) return [];
  const valid: ProfileCertification[] = [];
  for (const item of value) {
    const parsed = certificationSchema.safeParse(item);
    if (parsed.success) valid.push(parsed.data);
  }
  return certificationListSchema.parse(valid.slice(0, MAX_PROFILE_CERTIFICATIONS));
}

export type CertificationDisplay = { label: string; detail: string };

/** 表示用ラベル。例: { label: '英検', detail: '準1級 · CSE 2400' } */
export function formatCertification(cert: ProfileCertification): CertificationDisplay {
  switch (cert.type) {
    case 'eiken':
      return {
        label: '英検',
        detail: cert.cse != null ? `${EIKEN_GRADE_LABELS[cert.grade]} · CSE ${cert.cse}` : EIKEN_GRADE_LABELS[cert.grade],
      };
    case 'toefl':
      return {
        label: cert.scale === 'ibt' ? 'TOEFL iBT' : 'TOEFL',
        detail: cert.scale === 'band' ? cert.score.toFixed(1) : String(cert.score),
      };
    case 'toeic':
      return { label: `TOEIC ${TOEIC_TEST_LABELS[cert.test]}`, detail: String(cert.score) };
  }
}
