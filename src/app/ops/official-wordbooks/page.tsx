'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import {
  MAX_OFFICIAL_WORDBOOK_WORDS,
  OFFICIAL_WORDBOOK_AUTHORING_PROMPT,
  OFFICIAL_WORDBOOK_EIKEN_LEVELS,
  OFFICIAL_WORDBOOK_EIKEN_LEVEL_LABELS,
  findDuplicateEnglishTerms,
  formatOfficialWordbookWordsAsText,
  normalizeEnglishKey,
  officialWordbookWordInputSchema,
  parseOfficialWordbookWordsText,
  type OfficialWordbookEikenLevelValue,
  type OfficialWordbookSummary,
  type OfficialWordbookWordInput,
} from '@/lib/official-wordbooks/editor';
import { useAdminSecret } from '../use-admin-secret';

// 公式単語帳エディター。単語は表形式で1語ずつ編集でき、スプレッドシートや
// AIの出力はタブ区切りテキストとして一括で流し込める。
// 「公開」= is_active(英検レベル一致のユーザーに配布対象になる)、
// 「既定」= is_default(サインアップ時の初期単語帳として自動インポートされる)。

type WordRow = {
  key: string;
  english: string;
  japanese: string;
  distractors: string;
  exampleSentence: string;
  exampleSentenceJa: string;
  pronunciation: string;
  partOfSpeechTags: string;
};

type WordbookDetail = OfficialWordbookSummary & { words: OfficialWordbookWordInput[] };

let rowKeySeed = 0;
function nextRowKey(): string {
  rowKeySeed += 1;
  return `row-${rowKeySeed}`;
}

function emptyRow(): WordRow {
  return {
    key: nextRowKey(),
    english: '',
    japanese: '',
    distractors: '',
    exampleSentence: '',
    exampleSentenceJa: '',
    pronunciation: '',
    partOfSpeechTags: '',
  };
}

function toRow(word: OfficialWordbookWordInput): WordRow {
  return {
    key: nextRowKey(),
    english: word.english,
    japanese: word.japanese ?? '',
    distractors: (word.distractors ?? []).join('|'),
    exampleSentence: word.exampleSentence ?? '',
    exampleSentenceJa: word.exampleSentenceJa ?? '',
    pronunciation: word.pronunciation ?? '',
    partOfSpeechTags: (word.partOfSpeechTags ?? []).join('|'),
  };
}

function splitMulti(value: string): string[] {
  return value
    .split(/[|｜]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toWordInput(row: WordRow): OfficialWordbookWordInput {
  return {
    english: row.english.trim(),
    japanese: row.japanese.trim(),
    distractors: splitMulti(row.distractors),
    exampleSentence: row.exampleSentence.trim(),
    exampleSentenceJa: row.exampleSentenceJa.trim(),
    pronunciation: row.pronunciation.trim(),
    partOfSpeechTags: splitMulti(row.partOfSpeechTags),
    vocabularyType: null,
  };
}

/** 完全に空の行はユーザーが追加したまま埋めていないだけなので、保存時に捨てる。 */
function isBlankRow(row: WordRow): boolean {
  return !row.english.trim()
    && !row.japanese.trim()
    && !row.distractors.trim()
    && !row.exampleSentence.trim()
    && !row.exampleSentenceJa.trim()
    && !row.pronunciation.trim()
    && !row.partOfSpeechTags.trim();
}

type WordsState = {
  words: OfficialWordbookWordInput[];
  issues: string[];
  duplicateKeys: Set<string>;
  invalidKeys: Set<string>;
};

function validateRows(rows: WordRow[]): WordsState {
  const words: OfficialWordbookWordInput[] = [];
  const issues: string[] = [];
  const invalidKeys = new Set<string>();

  rows.forEach((row, index) => {
    if (isBlankRow(row)) return;
    const parsed = officialWordbookWordInputSchema.safeParse(toWordInput(row));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path?.length ? `${issue.path.join('.')}: ` : '';
      issues.push(`${index + 1}行目: ${path}${issue?.message ?? 'invalid'}`);
      invalidKeys.add(row.key);
      return;
    }
    words.push(parsed.data);
  });

  const duplicates = new Set(findDuplicateEnglishTerms(words));
  if (duplicates.size > 0) {
    issues.push(`英単語が重複しています: ${[...duplicates].slice(0, 10).join(', ')}`);
  }
  if (words.length > MAX_OFFICIAL_WORDBOOK_WORDS) {
    issues.push(`単語数が上限(${MAX_OFFICIAL_WORDBOOK_WORDS}語)を超えています`);
  }

  const duplicateKeys = new Set<string>();
  if (duplicates.size > 0) {
    for (const row of rows) {
      if (duplicates.has(normalizeEnglishKey(row.english))) duplicateKeys.add(row.key);
    }
  }

  return { words, issues, duplicateKeys, invalidKeys };
}

export default function OpsOfficialWordbooksPage() {
  const [adminSecret, setAdminSecret] = useAdminSecret();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [wordbooks, setWordbooks] = useState<OfficialWordbookSummary[] | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eikenLevel, setEikenLevel] = useState<OfficialWordbookEikenLevelValue | ''>('');
  const [sourceLabels, setSourceLabels] = useState('official');
  const [iconImage, setIconImage] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [isDefault, setIsDefault] = useState(false);

  const [rows, setRows] = useState<WordRow[]>([emptyRow()]);
  const [showDetailColumns, setShowDetailColumns] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const wordsState = useMemo(() => validateRows(rows), [rows]);
  const bulkPreview = useMemo(
    () => (bulkText.trim() ? parseOfficialWordbookWordsText(bulkText) : null),
    [bulkText],
  );

  const canSave = Boolean(adminSecret)
    && Boolean(slug.trim())
    && Boolean(title.trim())
    && wordsState.issues.length === 0
    && !saving;

  const request = async (path: string, init?: RequestInit) => {
    const response = await fetch(path, {
      ...init,
      headers: {
        'x-admin-secret': adminSecret,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.success) {
      throw new Error(result?.error ?? `Request failed (${response.status})`);
    }
    return result;
  };

  const loadList = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await request('/api/ops/official-wordbooks');
      setWordbooks(result.wordbooks as OfficialWordbookSummary[]);
    } catch (loadError) {
      setWordbooks(null);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setSlug('');
    setTitle('');
    setDescription('');
    setEikenLevel('');
    setSourceLabels('official');
    setIconImage('');
    setSortOrder('0');
    setIsDefault(false);
    setRows([emptyRow()]);
    setBulkText('');
    setBulkOpen(false);
  };

  const startEdit = async (wordbook: OfficialWordbookSummary) => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await request(`/api/ops/official-wordbooks/${wordbook.id}`);
      const detail = result.wordbook as WordbookDetail;
      setEditingId(detail.id);
      setSlug(detail.slug);
      setTitle(detail.title);
      setDescription(detail.description ?? '');
      setEikenLevel(detail.eikenLevel ?? '');
      setSourceLabels(detail.sourceLabels.join(', '));
      setIconImage(detail.iconImage ?? '');
      setSortOrder(String(detail.sortOrder));
      setIsDefault(detail.isDefault);
      setRows(detail.words.length > 0 ? detail.words.map(toRow) : [emptyRow()]);
      setBulkText('');
      setBulkOpen(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : 'Failed to load wordbook');
    } finally {
      setLoading(false);
    }
  };

  const buildPayload = (publish: boolean) => ({
    slug: slug.trim(),
    title: title.trim(),
    description: description.trim() || null,
    eikenLevel: eikenLevel || null,
    isDefault,
    isActive: publish,
    sourceLabels: sourceLabels
      .split(',')
      .map((label) => label.trim())
      .filter(Boolean)
      .slice(0, 20),
    iconImage: iconImage.trim() || null,
    sortOrder: Number.parseInt(sortOrder, 10) || 0,
    words: wordsState.words,
  });

  const save = async (publish: boolean) => {
    if (!canSave) return;
    const payload = buildPayload(publish);
    if (payload.sourceLabels.length === 0) payload.sourceLabels = ['official'];
    if (payload.isDefault && !payload.eikenLevel) {
      setError('既定単語帳にするには英検レベルを選んでください');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (editingId) {
        await request(`/api/ops/official-wordbooks/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setNotice(publish ? '更新して公開しました' : '更新しました(非公開)');
      } else {
        await request('/api/ops/official-wordbooks', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setNotice(publish ? '作成して公開しました' : '下書きを作成しました(非公開)');
        resetForm();
      }
      await loadList();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (wordbook: OfficialWordbookSummary) => {
    setError(null);
    setNotice(null);
    try {
      await request(`/api/ops/official-wordbooks/${wordbook.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !wordbook.isActive }),
      });
      await loadList();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Failed to update');
    }
  };

  const toggleDefault = async (wordbook: OfficialWordbookSummary) => {
    setError(null);
    setNotice(null);
    try {
      await request(`/api/ops/official-wordbooks/${wordbook.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isDefault: !wordbook.isDefault }),
      });
      await loadList();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Failed to update');
    }
  };

  const remove = async (wordbook: OfficialWordbookSummary) => {
    if (!window.confirm(`公式単語帳「${wordbook.title}」と収録単語をすべて削除しますか?`)) return;
    setError(null);
    setNotice(null);
    try {
      await request(`/api/ops/official-wordbooks/${wordbook.id}`, { method: 'DELETE' });
      if (editingId === wordbook.id) resetForm();
      await loadList();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete');
    }
  };

  const updateRow = (key: string, field: keyof Omit<WordRow, 'key'>, value: string) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  };

  const removeRow = (key: string) => {
    setRows((current) => {
      const next = current.filter((row) => row.key !== key);
      return next.length > 0 ? next : [emptyRow()];
    });
  };

  const moveRow = (index: number, direction: -1 | 1) => {
    setRows((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const applyBulk = (mode: 'replace' | 'append') => {
    if (!bulkPreview) return;
    const parsedRows = bulkPreview.words.map(toRow);
    setRows((current) => {
      if (mode === 'replace') return parsedRows.length > 0 ? parsedRows : [emptyRow()];
      const kept = current.filter((row) => !isBlankRow(row));
      return [...kept, ...parsedRows];
    });
    setNotice(`${parsedRows.length}語を${mode === 'replace' ? '読み込みました' : '追加しました'}`);
    setBulkText('');
    setBulkOpen(false);
  };

  const copyText = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(message);
    } catch {
      setError('コピーに失敗しました');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] pb-16">
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-background)]/95 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">Ops</p>
            <h1 className="text-xl font-bold text-[var(--color-foreground)]">公式単語帳エディター</h1>
          </div>
          <Link href="/ops" className="text-sm font-bold text-[var(--color-muted)]">
            ダッシュボードに戻る
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-6">
        {/* 認証 + 一覧読み込み */}
        <section className="rounded-2xl border-2 border-b-4 border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_auto_auto]">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-muted)]">ADMIN_SECRET</span>
              <input
                type="password"
                value={adminSecret}
                onChange={(event) => setAdminSecret(event.target.value)}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[var(--color-foreground)]"
                placeholder="x-admin-secret"
              />
            </label>
            <button
              type="button"
              onClick={() => void loadList()}
              disabled={loading || !adminSecret}
              className="self-end rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {loading ? '読み込み中...' : '一覧を読み込む'}
            </button>
            <button
              type="button"
              onClick={() => void copyText(
                OFFICIAL_WORDBOOK_AUTHORING_PROMPT,
                'AIプロンプトをコピーしました。ChatGPT等に貼り付け、末尾にテーマ・レベル・語数を書いてください',
              )}
              className="self-end rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-5 py-2 text-sm font-bold text-[var(--solid-ink)]"
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon name="smart_toy" size={16} />
                AIプロンプトをコピー
              </span>
            </button>
          </div>
          {error && <p className="mt-2 text-sm font-bold text-[var(--color-error)]">{error}</p>}
          {notice && <p className="mt-2 text-sm font-bold text-[var(--color-accent)]">{notice}</p>}
        </section>

        {/* 単語帳のメタ情報 */}
        <section className="rounded-2xl border-2 border-b-4 border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-[var(--color-foreground)]">
              {editingId ? '公式単語帳を編集' : '新しい公式単語帳'}
            </h2>
            {editingId && (
              <button type="button" onClick={resetForm} className="text-xs font-bold text-[var(--color-muted)] underline">
                新規作成に切り替え
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-muted)]">タイトル(ユーザーに表示される単語帳名)</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[var(--color-foreground)]"
                placeholder="例: 英検準1級 必修単語 300"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-muted)]">slug(一意・英小文字/数字/-/_)</span>
              <input
                type="text"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono text-sm text-[var(--color-foreground)]"
                placeholder="eiken-pre1-core-300"
              />
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="text-xs text-[var(--color-muted)]">説明(任意・管理用メモ)</span>
              <input
                type="text"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[var(--color-foreground)]"
                placeholder="例: 過去5年の出題頻度上位から抜粋"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-muted)]">英検レベル(配布対象の判定に使う)</span>
              <select
                value={eikenLevel}
                onChange={(event) => setEikenLevel(event.target.value as OfficialWordbookEikenLevelValue | '')}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[var(--color-foreground)]"
              >
                <option value="">未設定</option>
                {OFFICIAL_WORDBOOK_EIKEN_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {OFFICIAL_WORDBOOK_EIKEN_LEVEL_LABELS[level]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-muted)]">ソースラベル(カンマ区切り)</span>
              <input
                type="text"
                value={sourceLabels}
                onChange={(event) => setSourceLabels(event.target.value)}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[var(--color-foreground)]"
                placeholder="official, eiken:pre1"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-muted)]">アイコン画像(任意・URLまたは絵文字)</span>
              <input
                type="text"
                value={iconImage}
                onChange={(event) => setIconImage(event.target.value)}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[var(--color-foreground)]"
                placeholder="📘"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-muted)]">並び順(小さいほど先)</span>
              <input
                type="number"
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[var(--color-foreground)]"
              />
            </label>
          </div>

          <label className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(event) => setIsDefault(event.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm text-[var(--color-foreground)]">
              既定単語帳にする
              <span className="ml-1 text-xs text-[var(--color-muted)]">
                (このレベルを選んだ新規ユーザーの初期単語帳として自動インポートされます。英検レベルの指定が必要)
              </span>
            </span>
          </label>

          {isDefault && !eikenLevel && (
            <p className="mt-2 text-xs font-bold text-[var(--color-error)]">
              既定単語帳にするには英検レベルを選んでください。
            </p>
          )}
          {!eikenLevel && !isDefault && (
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              英検レベルが未設定の単語帳は、公開してもサインアップ時の配布対象になりません。
            </p>
          )}
        </section>

        {/* 単語エディター */}
        <section className="rounded-2xl border-2 border-b-4 border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-[var(--color-foreground)]">
              収録単語({wordsState.words.length}語)
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                <input
                  type="checkbox"
                  checked={showDetailColumns}
                  onChange={(event) => setShowDetailColumns(event.target.checked)}
                />
                詳細列(発音・品詞)
              </label>
              <button
                type="button"
                onClick={() => setBulkOpen((open) => !open)}
                className="rounded-lg border-2 border-[var(--solid-ink)] px-3 py-1.5 text-xs font-bold text-[var(--solid-ink)]"
              >
                <span className="inline-flex items-center gap-1">
                  <Icon name="content_paste" size={14} />
                  一括貼り付け
                </span>
              </button>
              <button
                type="button"
                onClick={() => void copyText(
                  formatOfficialWordbookWordsAsText(wordsState.words),
                  'TSVをコピーしました',
                )}
                disabled={wordsState.words.length === 0}
                className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-bold text-[var(--color-foreground)] disabled:opacity-50"
              >
                TSVをコピー
              </button>
              <button
                type="button"
                onClick={() => setRows((current) => [...current, emptyRow()])}
                className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-bold text-[var(--color-foreground)]"
              >
                行を追加
              </button>
            </div>
          </div>

          {bulkOpen && (
            <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
              <p className="mb-2 text-xs text-[var(--color-muted)]">
                1行1単語のタブ区切り(スプレッドシートからそのまま貼り付け可):
                <span className="ml-1 font-mono">英単語 → 日本語訳 → ダミー選択肢(| 区切り) → 例文 → 例文和訳 → 発音 → 品詞</span>
              </p>
              <textarea
                value={bulkText}
                onChange={(event) => setBulkText(event.target.value)}
                rows={8}
                spellCheck={false}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs leading-relaxed text-[var(--color-foreground)]"
                placeholder={'abandon\t見捨てる\t受け入れる|支持する|修理する\tHe abandoned the old car.\t彼は古い車を捨てた。'}
              />
              {bulkPreview && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs font-bold text-[var(--color-foreground)]">
                    {bulkPreview.words.length}語を読み取りました
                  </p>
                  {bulkPreview.errors.slice(0, 5).map((issue) => (
                    <p key={issue} className="text-xs font-bold text-[var(--color-error)]">{issue}</p>
                  ))}
                  {bulkPreview.errors.length > 5 && (
                    <p className="text-xs text-[var(--color-muted)]">ほか{bulkPreview.errors.length - 5}件のエラー</p>
                  )}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyBulk('replace')}
                  disabled={!bulkPreview || bulkPreview.words.length === 0}
                  className="rounded-lg border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  置き換えて読み込む
                </button>
                <button
                  type="button"
                  onClick={() => applyBulk('append')}
                  disabled={!bulkPreview || bulkPreview.words.length === 0}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-bold text-[var(--color-foreground)] disabled:opacity-50"
                >
                  末尾に追加
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-muted)]">
                  <th className="w-10 py-2 pr-2 font-semibold">#</th>
                  <th className="py-2 pr-2 font-semibold">英単語</th>
                  <th className="py-2 pr-2 font-semibold">日本語訳</th>
                  <th className="py-2 pr-2 font-semibold">ダミー選択肢(| 区切り)</th>
                  <th className="py-2 pr-2 font-semibold">例文</th>
                  <th className="py-2 pr-2 font-semibold">例文和訳</th>
                  {showDetailColumns && <th className="py-2 pr-2 font-semibold">発音</th>}
                  {showDetailColumns && <th className="py-2 pr-2 font-semibold">品詞(| 区切り)</th>}
                  <th className="w-24 py-2 font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const flagged = wordsState.duplicateKeys.has(row.key) || wordsState.invalidKeys.has(row.key);
                  const cellClass = `w-full rounded-lg border px-2 py-1.5 text-sm text-[var(--color-foreground)] ${
                    flagged ? 'border-[var(--color-error)]' : 'border-[var(--color-border)]'
                  } bg-[var(--color-background)]`;
                  return (
                    <tr key={row.key} className="border-b border-[var(--color-border)]/60 align-top">
                      <td className="py-1.5 pr-2 font-mono text-xs text-[var(--color-muted)]">{index + 1}</td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="text"
                          value={row.english}
                          onChange={(event) => updateRow(row.key, 'english', event.target.value)}
                          className={`${cellClass} min-w-[120px] font-medium`}
                          placeholder="abandon"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="text"
                          value={row.japanese}
                          onChange={(event) => updateRow(row.key, 'japanese', event.target.value)}
                          className={`${cellClass} min-w-[110px]`}
                          placeholder="見捨てる"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="text"
                          value={row.distractors}
                          onChange={(event) => updateRow(row.key, 'distractors', event.target.value)}
                          className={`${cellClass} min-w-[160px]`}
                          placeholder="受け入れる|支持する|修理する"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="text"
                          value={row.exampleSentence}
                          onChange={(event) => updateRow(row.key, 'exampleSentence', event.target.value)}
                          className={`${cellClass} min-w-[180px]`}
                          placeholder="He abandoned the old car."
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="text"
                          value={row.exampleSentenceJa}
                          onChange={(event) => updateRow(row.key, 'exampleSentenceJa', event.target.value)}
                          className={`${cellClass} min-w-[160px]`}
                          placeholder="彼は古い車を捨てた。"
                        />
                      </td>
                      {showDetailColumns && (
                        <td className="py-1.5 pr-2">
                          <input
                            type="text"
                            value={row.pronunciation}
                            onChange={(event) => updateRow(row.key, 'pronunciation', event.target.value)}
                            className={`${cellClass} min-w-[110px] font-mono text-xs`}
                            placeholder="/əˈbændən/"
                          />
                        </td>
                      )}
                      {showDetailColumns && (
                        <td className="py-1.5 pr-2">
                          <input
                            type="text"
                            value={row.partOfSpeechTags}
                            onChange={(event) => updateRow(row.key, 'partOfSpeechTags', event.target.value)}
                            className={`${cellClass} min-w-[90px]`}
                            placeholder="動詞"
                          />
                        </td>
                      )}
                      <td className="py-1.5">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveRow(index, -1)}
                            disabled={index === 0}
                            aria-label="上へ移動"
                            className="rounded-md border border-[var(--color-border)] px-1.5 py-1 text-[var(--color-muted)] disabled:opacity-30"
                          >
                            <Icon name="arrow_upward" size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveRow(index, 1)}
                            disabled={index === rows.length - 1}
                            aria-label="下へ移動"
                            className="rounded-md border border-[var(--color-border)] px-1.5 py-1 text-[var(--color-muted)] disabled:opacity-30"
                          >
                            <Icon name="arrow_downward" size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRow(row.key)}
                            aria-label="行を削除"
                            className="rounded-md border border-[var(--color-error)] px-1.5 py-1 text-[var(--color-error)]"
                          >
                            <Icon name="delete" size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {wordsState.issues.length > 0 && (
            <div className="mt-3 space-y-1">
              {wordsState.issues.slice(0, 5).map((issue) => (
                <p key={issue} className="text-xs font-bold text-[var(--color-error)]">{issue}</p>
              ))}
              {wordsState.issues.length > 5 && (
                <p className="text-xs text-[var(--color-muted)]">ほか{wordsState.issues.length - 5}件のエラー</p>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void save(false)}
              disabled={!canSave}
              className="rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-4 py-2 text-sm font-bold text-[var(--solid-ink)] disabled:opacity-50"
            >
              {saving ? '保存中...' : '非公開で保存'}
            </button>
            <button
              type="button"
              onClick={() => void save(true)}
              disabled={!canSave}
              className="rounded-xl border-2 border-[var(--color-accent-ink,var(--color-accent))] bg-[var(--color-accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存して公開'}
            </button>
            {editingId && (
              <p className="self-center text-xs text-[var(--color-muted)]">
                保存すると収録単語はこの表の内容で総入れ替えされます。
              </p>
            )}
          </div>
        </section>

        {/* 一覧 */}
        {wordbooks && (
          <section className="rounded-2xl border-2 border-b-4 border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h2 className="mb-3 font-bold text-[var(--color-foreground)]">公式単語帳一覧({wordbooks.length}件)</h2>
            {wordbooks.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">
                まだ公式単語帳がありません。上のフォームから作成してください。
              </p>
            ) : (
              <div className="space-y-2">
                {wordbooks.map((wordbook) => (
                  <div
                    key={wordbook.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5"
                  >
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        wordbook.isActive
                          ? 'bg-[var(--color-accent)] text-white'
                          : 'bg-[var(--color-border)] text-[var(--color-muted)]'
                      }`}
                    >
                      {wordbook.isActive ? '公開中' : '非公開'}
                    </span>
                    {wordbook.isDefault && (
                      <span className="rounded-full bg-[var(--solid-ink)] px-2.5 py-0.5 text-[11px] font-bold text-white">
                        既定
                      </span>
                    )}
                    <span className="rounded-full border border-[var(--color-border)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--color-muted)]">
                      {wordbook.eikenLevel
                        ? OFFICIAL_WORDBOOK_EIKEN_LEVEL_LABELS[wordbook.eikenLevel]
                        : 'レベル未設定'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--color-foreground)]">
                      {wordbook.title}
                      <span className="ml-2 font-mono text-[11px] font-normal text-[var(--color-muted)]">
                        {wordbook.slug}
                      </span>
                    </span>
                    <span className="font-mono text-[11px] text-[var(--color-muted)]">
                      {wordbook.wordCount === null ? '-' : `${wordbook.wordCount}語`}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void startEdit(wordbook)}
                        className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-bold text-[var(--color-foreground)]"
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => void togglePublish(wordbook)}
                        className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-bold text-[var(--color-foreground)]"
                      >
                        {wordbook.isActive ? '非公開にする' : '公開する'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleDefault(wordbook)}
                        className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-bold text-[var(--color-foreground)]"
                      >
                        {wordbook.isDefault ? '既定を外す' : '既定にする'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(wordbook)}
                        className="rounded-lg border border-[var(--color-error)] px-2.5 py-1 text-xs font-bold text-[var(--color-error)]"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
