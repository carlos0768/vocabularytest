'use client';

import { useId, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import {
  CERTIFICATION_TYPE_LABELS,
  EIKEN_CSE_MAX,
  EIKEN_GRADES,
  EIKEN_GRADE_LABELS,
  TOEFL_BAND_SCORES,
  TOEFL_SCALES,
  TOEFL_SCALE_LABELS,
  TOEFL_SCORE_RULES,
  TOEIC_SCORE_RULES,
  TOEIC_TESTS,
  TOEIC_TEST_LABELS,
  certificationKey,
  certificationSchema,
  describeScoreRule,
  formatCertification,
  removeCertification,
  upsertCertification,
  type CertificationType,
  type EikenGrade,
  type ProfileCertification,
  type ToeflScale,
  type ToeicTest,
} from '@/lib/profile/certifications';

type Draft = {
  type: CertificationType;
  grade: EikenGrade | null;
  cse: string;
  toeflScale: ToeflScale;
  toeflScore: string;
  toeicTest: ToeicTest;
  toeicScore: string;
};

const EMPTY_DRAFT: Draft = {
  type: 'eiken',
  grade: null,
  cse: '',
  toeflScale: 'ibt',
  toeflScore: '',
  toeicTest: 'lr',
  toeicScore: '',
};

function draftFrom(cert: ProfileCertification): Draft {
  switch (cert.type) {
    case 'eiken':
      return { ...EMPTY_DRAFT, type: 'eiken', grade: cert.grade, cse: cert.cse != null ? String(cert.cse) : '' };
    case 'toefl':
      return { ...EMPTY_DRAFT, type: 'toefl', toeflScale: cert.scale, toeflScore: String(cert.score) };
    case 'toeic':
      return { ...EMPTY_DRAFT, type: 'toeic', toeicTest: cert.test, toeicScore: String(cert.score) };
  }
}

/** 入力中の値を検証済みの資格へ。未入力や範囲外ならエラーメッセージを返す。 */
function buildCertification(draft: Draft): { cert: ProfileCertification } | { error: string } {
  const toNumber = (raw: string) => (raw.trim() === '' ? NaN : Number(raw.trim()));
  let candidate: unknown;

  if (draft.type === 'eiken') {
    if (!draft.grade) return { error: '級を選んでください' };
    const cse = draft.cse.trim() === '' ? null : toNumber(draft.cse);
    candidate = { type: 'eiken', grade: draft.grade, cse };
  } else if (draft.type === 'toefl') {
    if (draft.toeflScore.trim() === '') return { error: 'スコアを入力してください' };
    candidate = { type: 'toefl', scale: draft.toeflScale, score: toNumber(draft.toeflScore) };
  } else {
    if (draft.toeicScore.trim() === '') return { error: 'スコアを入力してください' };
    candidate = { type: 'toeic', test: draft.toeicTest, score: toNumber(draft.toeicScore) };
  }

  const parsed = certificationSchema.safeParse(candidate);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください' };
  return { cert: parsed.data };
}

function chipClass(active: boolean): string {
  return `rounded-[9px] border-2 px-2.5 py-2 font-display text-[12.5px] font-bold transition-colors disabled:opacity-50 ${
    active
      ? 'border-[var(--solid-ink)] bg-[var(--solid-ink)] text-[var(--color-on-ink)]'
      : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--solid-ink)]'
  }`;
}

const INPUT_CLASS = 'w-full rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2.5 font-mono text-[16px] font-bold text-[var(--solid-ink)] outline-none transition-shadow placeholder:font-normal placeholder:text-[var(--color-muted)] focus:shadow-[2px_2px_0_var(--color-accent)]';
const SUB_LABEL_CLASS = 'font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]';

/**
 * プロフィールの資格(英検 / TOEFL / TOEIC)を追加・変更・削除する。
 * 英検は級を選択、TOEFL / TOEIC は形式を選んでスコアを入力する。
 * 保存は一覧を丸ごと置き換える(`onSave`)。
 */
export function CertificationEditor({
  certifications,
  loading,
  saving,
  serverError,
  onSave,
}: {
  certifications: ProfileCertification[];
  loading: boolean;
  saving: boolean;
  serverError: string | null;
  onSave: (next: ProfileCertification[]) => Promise<boolean>;
}) {
  // null = フォームを閉じている。editingKey は「既存の資格を編集中」のときその key。
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  // モバイル用とデスクトップ用で同じ画面に2つ描画されるので、input の id は個別に振る
  const idPrefix = useId();

  const update = (patch: Partial<Draft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setFormError(null);
  };

  const openNew = () => {
    // まだ登録していない種類を初期選択にする
    const registered = new Set(certifications.map((cert) => cert.type));
    const type = (['eiken', 'toeic', 'toefl'] as const).find((t) => !registered.has(t)) ?? 'eiken';
    setDraft({ ...EMPTY_DRAFT, type });
    setEditingKey(null);
    setFormError(null);
  };

  const openEdit = (cert: ProfileCertification) => {
    setDraft(draftFrom(cert));
    setEditingKey(certificationKey(cert));
    setFormError(null);
  };

  const close = () => {
    setDraft(null);
    setEditingKey(null);
    setFormError(null);
  };

  const handleSubmit = async () => {
    if (!draft || saving) return;
    const built = buildCertification(draft);
    if ('error' in built) {
      setFormError(built.error);
      return;
    }
    // 編集中に形式(例: TOEIC L&R → S&W)を変えたら、元の登録は置き換えて消す
    const base = editingKey ? removeCertification(certifications, editingKey) : certifications;
    const success = await onSave(upsertCertification(base, built.cert));
    if (success) close();
  };

  const handleRemove = async (key: string) => {
    if (saving) return;
    setRemovingKey(key);
    await onSave(removeCertification(certifications, key));
    setRemovingKey(null);
  };

  // 同じ種類が登録済みなら上書きになることを先に知らせる(編集中の元の資格は除く)
  const replacing = (() => {
    if (!draft) return null;
    const built = buildCertification(draft);
    if ('error' in built) return null;
    const key = certificationKey(built.cert);
    if (key === editingKey) return null;
    return certifications.find((cert) => certificationKey(cert) === key) ?? null;
  })();

  return (
    <div>
      {certifications.length > 0 ? (
        <ul className="flex flex-col gap-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {certifications.map((cert) => {
            const key = certificationKey(cert);
            const { label, detail } = formatCertification(cert);
            return (
              <li
                key={key}
                className="flex items-center gap-2 rounded-[10px] border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
              >
                <Icon name="workspace_premium" size={16} className="shrink-0 text-[var(--color-accent)]" />
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-[10.5px] font-bold text-[var(--color-muted)]">{label}</span>
                  <span className="ml-1.5 font-display text-[14px] font-extrabold text-[var(--solid-ink)]">{detail}</span>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(cert)}
                  disabled={saving}
                  aria-label={`${label}を編集`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--solid-ink)] disabled:opacity-50 active:bg-[var(--color-surface-secondary)]"
                >
                  <Icon name="edit" size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => void handleRemove(key)}
                  disabled={saving}
                  aria-label={`${label}を削除`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-error)] disabled:opacity-50 active:bg-[var(--color-surface-secondary)]"
                >
                  <Icon name={removingKey === key ? 'progress_activity' : 'delete'} size={16} className={removingKey === key ? 'animate-spin' : undefined} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        !draft && (
          <p className="font-display text-[14px] font-bold text-[var(--color-muted)]">
            {loading ? '...' : '未登録'}
          </p>
        )
      )}

      {serverError && !draft && (
        <p className="mt-2 rounded-[8px] border border-[var(--color-error)] bg-[rgba(239,68,68,0.08)] px-2.5 py-2 text-[11px] font-bold text-[var(--color-error)]">
          {serverError}
        </p>
      )}

      {draft ? (
        <div className="mt-3 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-background)] p-3">
          {/* 種類 */}
          <div className={SUB_LABEL_CLASS}>種類</div>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="資格の種類">
            {(['eiken', 'toefl', 'toeic'] as const).map((type) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={draft.type === type}
                onClick={() => update({ type })}
                disabled={saving}
                className={chipClass(draft.type === type)}
              >
                {CERTIFICATION_TYPE_LABELS[type]}
              </button>
            ))}
          </div>

          {draft.type === 'eiken' && (
            <>
              <div className={`${SUB_LABEL_CLASS} mt-3`}>合格した級</div>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="英検の級">
                {[...EIKEN_GRADES].reverse().map((grade) => (
                  <button
                    key={grade}
                    type="button"
                    role="radio"
                    aria-checked={draft.grade === grade}
                    onClick={() => update({ grade })}
                    disabled={saving}
                    className={`${chipClass(draft.grade === grade)} px-1 text-[11.5px]`}
                  >
                    {EIKEN_GRADE_LABELS[grade]}
                  </button>
                ))}
              </div>
              <label htmlFor={`${idPrefix}-cert-eiken-cse`} className={`${SUB_LABEL_CLASS} mt-3 block`}>
                CSEスコア(任意)
              </label>
              <input
                id={`${idPrefix}-cert-eiken-cse`}
                type="number"
                inputMode="numeric"
                min={0}
                max={EIKEN_CSE_MAX}
                step={1}
                value={draft.cse}
                onChange={(event) => update({ cse: event.target.value })}
                placeholder={`0〜${EIKEN_CSE_MAX}`}
                disabled={saving}
                className={`${INPUT_CLASS} mt-1.5`}
              />
            </>
          )}

          {draft.type === 'toefl' && (
            <>
              <div className={`${SUB_LABEL_CLASS} mt-3`}>スコアの形式</div>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="TOEFLのスコア形式">
                {TOEFL_SCALES.map((scale) => (
                  <button
                    key={scale}
                    type="button"
                    role="radio"
                    aria-checked={draft.toeflScale === scale}
                    onClick={() => update({ toeflScale: scale, toeflScore: '' })}
                    disabled={saving}
                    className={chipClass(draft.toeflScale === scale)}
                  >
                    {TOEFL_SCALE_LABELS[scale]}
                  </button>
                ))}
              </div>
              {draft.toeflScale === 'band' ? (
                <>
                  <div className={`${SUB_LABEL_CLASS} mt-3`}>スコア</div>
                  <div className="mt-1.5 grid grid-cols-6 gap-1.5" role="radiogroup" aria-label="TOEFLのスコア">
                    {TOEFL_BAND_SCORES.map((score) => {
                      const value = String(score);
                      return (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={draft.toeflScore === value}
                          onClick={() => update({ toeflScore: value })}
                          disabled={saving}
                          className={`${chipClass(draft.toeflScore === value)} px-0 font-mono`}
                        >
                          {score.toFixed(1)}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <label htmlFor={`${idPrefix}-cert-toefl-score`} className={`${SUB_LABEL_CLASS} mt-3 block`}>
                    スコア
                  </label>
                  <input
                    id={`${idPrefix}-cert-toefl-score`}
                    type="number"
                    inputMode="numeric"
                    min={TOEFL_SCORE_RULES.ibt.min}
                    max={TOEFL_SCORE_RULES.ibt.max}
                    step={TOEFL_SCORE_RULES.ibt.step}
                    value={draft.toeflScore}
                    onChange={(event) => update({ toeflScore: event.target.value })}
                    placeholder={describeScoreRule(TOEFL_SCORE_RULES.ibt)}
                    disabled={saving}
                    className={`${INPUT_CLASS} mt-1.5`}
                  />
                </>
              )}
            </>
          )}

          {draft.type === 'toeic' && (
            <>
              <div className={`${SUB_LABEL_CLASS} mt-3`}>テスト</div>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="TOEICのテスト">
                {TOEIC_TESTS.map((test) => (
                  <button
                    key={test}
                    type="button"
                    role="radio"
                    aria-checked={draft.toeicTest === test}
                    onClick={() => update({ toeicTest: test })}
                    disabled={saving}
                    className={chipClass(draft.toeicTest === test)}
                  >
                    {TOEIC_TEST_LABELS[test]}
                  </button>
                ))}
              </div>
              <label htmlFor={`${idPrefix}-cert-toeic-score`} className={`${SUB_LABEL_CLASS} mt-3 block`}>
                スコア
              </label>
              <input
                id={`${idPrefix}-cert-toeic-score`}
                type="number"
                inputMode="numeric"
                min={TOEIC_SCORE_RULES[draft.toeicTest].min}
                max={TOEIC_SCORE_RULES[draft.toeicTest].max}
                step={TOEIC_SCORE_RULES[draft.toeicTest].step}
                value={draft.toeicScore}
                onChange={(event) => update({ toeicScore: event.target.value })}
                placeholder={describeScoreRule(TOEIC_SCORE_RULES[draft.toeicTest])}
                disabled={saving}
                className={`${INPUT_CLASS} mt-1.5`}
              />
            </>
          )}

          {replacing && (
            <p className="mt-2 text-[11px] text-[var(--color-muted)]">
              登録済みの「{formatCertification(replacing).label} {formatCertification(replacing).detail}」を置き換えます
            </p>
          )}

          {(formError || serverError) && (
            <p className="mt-2 rounded-[8px] border border-[var(--color-error)] bg-[rgba(239,68,68,0.08)] px-2.5 py-2 text-[11px] font-bold text-[var(--color-error)]">
              {formError ?? serverError}
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving}
              className="flex-1 rounded-[9px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-3 py-2.5 font-display text-[13px] font-bold text-[var(--color-on-ink)] shadow-[2px_2px_0_var(--color-accent)] transition-all duration-100 disabled:cursor-not-allowed disabled:opacity-50 active:translate-x-px active:translate-y-px"
            >
              {saving ? '保存中...' : editingKey ? '更新' : '登録'}
            </button>
            <button
              type="button"
              onClick={close}
              disabled={saving}
              className="flex-1 rounded-[9px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2.5 font-display text-[13px] font-bold text-[var(--solid-ink)] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openNew}
          disabled={loading || saving}
          className="mt-2.5 inline-flex items-center gap-1 rounded-[8px] border-2 border-dashed border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2 font-display text-[12px] font-bold text-[var(--solid-ink)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="add" size={15} />
          資格を追加
        </button>
      )}
    </div>
  );
}
