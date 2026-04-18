'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ManualWordInputModal } from '@/components/home/ProjectModals';
import { ScanModeModal } from '@/components/home/ScanModeModal';
import { NotebookAuthRequiredState, NotebookChrome, NotebookCard, NotebookErrorState, NotebookLoadingState } from '@/components/notebook';
import { Icon, useToast } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { requestJson } from '@/hooks/api-client';
import { useCollectionItems } from '@/hooks/use-collection-items';
import { useVocabularyAsset } from '@/hooks/use-vocabulary-assets';
import { expandFilesForScan, isPdfFile, processImageFile, type ImageProcessingProfile } from '@/lib/image-utils';
import { cn } from '@/lib/utils';

type ExtractMode = 'all' | 'circled' | 'eiken' | 'idiom';
type EikenLevel = '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1' | null;

type ExtractedWord = {
  english: string;
  japanese: string;
  distractors?: string[];
  vocabularyType?: 'active' | 'passive' | null;
  japaneseSource?: 'scan' | 'ai';
  lexiconEntryId?: string;
  exampleSentence?: string;
  exampleSentenceJa?: string;
  partOfSpeechTags?: string[];
};

type ExtractResponse = {
  success: boolean;
  words: ExtractedWord[];
};

type CreateWordsResponse = {
  success: boolean;
  words: Array<{ id: string }>;
};

type GenerateExamplesResponse = {
  success: boolean;
  generated: number;
  failed: number;
  skipped: number;
  message: string;
};

function getVocabularyBadge(value: 'active' | 'passive' | null | undefined) {
  return value === 'active'
    ? { label: 'A', className: 'bg-emerald-100 text-emerald-700' }
    : { label: 'P', className: 'bg-amber-100 text-amber-700' };
}

function formatPos(word: { partOfSpeechTags?: string[] }) {
  return word.partOfSpeechTags?.[0] ?? '—';
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        reject(new Error('画像の読み取りに失敗しました。'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error('画像の読み取りに失敗しました。'));
    reader.readAsDataURL(file);
  });
}

export function NotebookWordbookPage({
  collectionId,
  assetId,
}: {
  collectionId: string;
  assetId: string;
}) {
  const router = useRouter();
  const { user, isPro, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { items, loading: itemsLoading, error: itemsError } = useCollectionItems(collectionId);
  const { detail, loading, error, refresh } = useVocabularyAsset(assetId);

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [openWordId, setOpenWordId] = useState<string | null>(null);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showScanModeModal, setShowScanModeModal] = useState(false);
  const [selectedScanMode, setSelectedScanMode] = useState<ExtractMode>('all');
  const [selectedEikenLevel, setSelectedEikenLevel] = useState<EikenLevel>(null);
  const [showManualWordModal, setShowManualWordModal] = useState(false);
  const [manualWordEnglish, setManualWordEnglish] = useState('');
  const [manualWordJapanese, setManualWordJapanese] = useState('');
  const [manualWordSaving, setManualWordSaving] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [exampleLoading, setExampleLoading] = useState(false);
  const scanFileInputRef = useRef<HTMLInputElement>(null);

  const filteredWords = useMemo(() => {
    if (!detail) return [];
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return detail.words;

    return detail.words.filter((word) => {
      const english = word.english.toLowerCase();
      const japanese = word.japanese.toLowerCase();
      return english.includes(normalizedQuery) || japanese.includes(normalizedQuery);
    });
  }, [detail, query]);

  const missingExamplesCount = detail
    ? detail.words.filter((word) => !word.exampleSentence?.trim()).length
    : 0;

  const handleGenerateExamples = async () => {
    if (!detail || exampleLoading) return;

    try {
      setExampleLoading(true);
      const payload = await requestJson<GenerateExamplesResponse>('/api/generate-examples', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectId: detail.project.id }),
      });
      showToast({
        message: payload.message || `${payload.generated}件の例文を生成しました`,
        type: 'success',
      });
      await refresh();
    } catch (requestError) {
      showToast({
        message: requestError instanceof Error ? requestError.message : '例文生成に失敗しました。',
        type: 'error',
      });
    } finally {
      setExampleLoading(false);
    }
  };

  const handleManualWordCreate = async () => {
    if (!detail) return;

    try {
      setManualWordSaving(true);
      await requestJson<CreateWordsResponse>('/api/words/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          words: [
            {
              projectId: detail.project.id,
              english: manualWordEnglish,
              japanese: manualWordJapanese,
              distractors: [],
            },
          ],
        }),
      });
      setManualWordEnglish('');
      setManualWordJapanese('');
      setShowManualWordModal(false);
      showToast({ message: '単語を追加しました', type: 'success' });
      await refresh();
    } catch (requestError) {
      showToast({
        message: requestError instanceof Error ? requestError.message : '単語の追加に失敗しました。',
        type: 'error',
      });
    } finally {
      setManualWordSaving(false);
    }
  };

  const handleScanModeSelect = (mode: ExtractMode, eikenLevel: EikenLevel) => {
    if ((mode === 'circled' || mode === 'eiken' || mode === 'idiom') && !isPro) {
      setShowScanModeModal(false);
      router.push('/subscription');
      return;
    }

    setSelectedScanMode(mode);
    setSelectedEikenLevel(eikenLevel);
    scanFileInputRef.current?.click();
  };

  const handleScanFiles = async (files: File[]) => {
    if (!detail || files.length === 0) return;

    setShowScanModeModal(false);
    setShowAddSheet(false);
    setScanLoading(true);

    try {
      let scanFiles = files;
      if (files.some((file) => isPdfFile(file))) {
        scanFiles = await expandFilesForScan(files);
      }

      const extractionProfile: ImageProcessingProfile = 'default';
      const extractedWords: ExtractedWord[] = [];

      for (const file of scanFiles) {
        const processed = await processImageFile(file, extractionProfile);
        const image = await readFileAsDataUrl(processed);
        const payload = await requestJson<ExtractResponse>('/api/extract', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image,
            mode: selectedScanMode,
            eikenLevel: selectedEikenLevel,
          }),
        });
        extractedWords.push(...(payload.words ?? []));
      }

      const uniqueWords = Array.from(
        new Map(
          extractedWords.map((word) => [
            `${word.english.trim().toLowerCase()}::${word.japanese.trim()}`,
            word,
          ]),
        ).values(),
      );

      if (uniqueWords.length === 0) {
        showToast({ message: '追加できる単語が見つかりませんでした', type: 'error' });
        return;
      }

      await requestJson<CreateWordsResponse>('/api/words/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          words: uniqueWords.map((word) => ({
            projectId: detail.project.id,
            english: word.english,
            japanese: word.japanese,
            distractors: word.distractors ?? [],
            vocabularyType: word.vocabularyType ?? null,
            japaneseSource: word.japaneseSource,
            lexiconEntryId: word.lexiconEntryId,
            exampleSentence: word.exampleSentence,
            exampleSentenceJa: word.exampleSentenceJa,
            partOfSpeechTags: word.partOfSpeechTags,
          })),
        }),
      });

      showToast({ message: `${uniqueWords.length}語を追加しました`, type: 'success' });
      await refresh();
    } catch (requestError) {
      showToast({
        message: requestError instanceof Error ? requestError.message : 'スキャン追加に失敗しました。',
        type: 'error',
      });
    } finally {
      setScanLoading(false);
    }
  };

  if (authLoading || loading || itemsLoading) {
    return <NotebookLoadingState />;
  }

  if (!user) {
    return <NotebookAuthRequiredState />;
  }

  if (!detail) {
    return (
      <div className="mx-auto max-w-xl px-4 py-6">
        <NotebookErrorState
          title="単語帳を開けませんでした"
          message={error || itemsError || '指定した単語帳アセットが見つかりません。'}
          action={
            <Link
              href={`/collections/${collectionId}/notes`}
              className="inline-flex items-center justify-center rounded-xl bg-[var(--color-foreground)] px-5 py-2.5 font-semibold text-white transition hover:opacity-90"
            >
              ノート一覧へ戻る
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <>
      <NotebookChrome
        collectionId={collectionId}
        currentKind="vocabulary_project"
        items={items}
        title={detail.project.title}
        subtitle="ノート · 単語"
        crumbLabel="単語帳"
        actionStripItems={[
          {
            icon: 'style',
            label: 'フラッシュカード',
            sub: `${detail.stats.totalWords}語`,
            badge: '今日',
            href: `/flashcard/${detail.project.id}`,
          },
          {
            icon: 'quiz',
            label: '4択クイズ',
            sub: `${detail.stats.masteredWords}語習得`,
            href: `/quiz/${detail.project.id}`,
          },
          {
            icon: 'add_circle_outline',
            label: '単語を追加',
            sub: 'スキャン / 手動',
            onClick: () => setShowAddSheet(true),
          },
        ]}
        headerActions={[
          {
            icon: 'search',
            label: '検索',
            onClick: () => setSearchOpen((current) => !current),
            active: searchOpen,
          },
          {
            icon: exampleLoading ? 'progress_activity' : 'auto_awesome',
            label: '例文生成',
            onClick: handleGenerateExamples,
          },
        ]}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full bg-[var(--color-foreground)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
            {detail.stats.totalWords} 語
          </div>
          <div className="text-[11px] text-[var(--color-muted)]">
            例文あり {detail.stats.exampleCount} 語 / 未生成 {missingExamplesCount} 語
          </div>
        </div>

        {searchOpen && (
          <NotebookCard>
            <label className="relative block">
              <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="単語または意味で検索"
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-3 pl-10 pr-4 text-sm text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-foreground)]"
              />
            </label>
          </NotebookCard>
        )}

        <NotebookCard
          title="単語一覧"
          subtitle={`${filteredWords.length}件を表示`}
          right={
            <button
              type="button"
              onClick={handleGenerateExamples}
              disabled={exampleLoading}
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-muted)] transition hover:border-[var(--color-foreground)] hover:text-[var(--color-foreground)] disabled:opacity-50"
            >
              {exampleLoading ? '生成中...' : '例文を生成'}
            </button>
          }
        >
          <div className="mb-2 flex items-center gap-3 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
            <div className="w-[110px]">単語</div>
            <div className="w-7 text-center">区分</div>
            <div className="w-14">品詞</div>
            <div className="flex-1">意味</div>
          </div>

          <div className="divide-y divide-[var(--color-border)]">
            {filteredWords.map((word) => {
              const badge = getVocabularyBadge(word.vocabularyType);
              const isOpen = openWordId === word.id;

              return (
                <div key={word.id} className="py-2.5">
                  <button
                    type="button"
                    onClick={() => setOpenWordId(isOpen ? null : word.id)}
                    className="flex w-full items-center gap-3 text-left"
                  >
                    <div className="w-[110px] text-[15px] font-semibold tracking-tight text-[var(--color-foreground)]">
                      {word.english}
                    </div>
                    <div className={cn('flex h-7 w-7 items-center justify-center rounded-[4px] text-[10px] font-bold', badge.className)}>
                      {badge.label}
                    </div>
                    <div className="w-14 text-[11px] uppercase tracking-[0.08em] text-[var(--color-muted)]">
                      {formatPos(word)}
                    </div>
                    <div className="flex-1 truncate text-[13px] text-[var(--color-foreground)]">{word.japanese}</div>
                    <Icon name={isOpen ? 'expand_less' : 'expand_more'} size={18} className="text-[var(--color-muted)]" />
                  </button>

                  {isOpen && (
                    <div className="pl-5 pt-3">
                      <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-3">
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                          例文
                        </div>
                        <div className="text-[14px] leading-relaxed text-[var(--color-foreground)]">
                          {word.exampleSentence?.trim() || 'まだ例文はありません。上の「例文を生成」から不足分を作れます。'}
                        </div>
                        {word.exampleSentenceJa?.trim() && (
                          <div className="mt-2 text-[12px] leading-relaxed text-[var(--color-muted)]">
                            {word.exampleSentenceJa}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </NotebookCard>

        <NotebookCard title="熟語" subtitle="複数語で構成される項目">
          {detail.idioms.length === 0 ? (
            <div className="text-sm text-[var(--color-muted)]">この単語帳には熟語項目がまだありません。</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {detail.idioms.map((idiom) => (
                <span
                  key={idiom}
                  className="rounded-full bg-rose-100 px-3 py-1 text-[12px] font-medium text-rose-700"
                >
                  {idiom}
                </span>
              ))}
            </div>
          )}
        </NotebookCard>
      </NotebookChrome>

      {showAddSheet && (
        <div className="fixed inset-0 z-[70]" onClick={() => setShowAddSheet(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-[var(--color-surface)] p-5"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto max-w-xl">
              <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-[var(--color-border)]" />
              <p className="mb-4 text-base font-bold text-[var(--color-foreground)]">単語を追加</p>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowScanModeModal(true)}
                  className="flex w-full items-center gap-3 rounded-xl bg-[var(--color-surface-secondary)] px-4 py-3.5 text-left text-sm font-semibold text-[var(--color-foreground)] transition hover:opacity-80"
                >
                  <Icon name="photo_camera" size={20} />
                  スキャンで追加
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddSheet(false);
                    setShowManualWordModal(true);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl bg-[var(--color-surface-secondary)] px-4 py-3.5 text-left text-sm font-semibold text-[var(--color-foreground)] transition hover:opacity-80"
                >
                  <Icon name="edit" size={20} />
                  手動で追加
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowAddSheet(false)}
                className="mt-3 w-full rounded-xl py-3 text-sm font-semibold text-[var(--color-muted)] transition hover:bg-[var(--color-surface-secondary)]"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      <ManualWordInputModal
        isOpen={showManualWordModal}
        onClose={() => setShowManualWordModal(false)}
        onConfirm={handleManualWordCreate}
        isLoading={manualWordSaving}
        english={manualWordEnglish}
        setEnglish={setManualWordEnglish}
        japanese={manualWordJapanese}
        setJapanese={setManualWordJapanese}
      />

      <ScanModeModal
        isOpen={showScanModeModal}
        onClose={() => setShowScanModeModal(false)}
        onSelectMode={handleScanModeSelect}
        isPro={isPro}
      />

      <input
        ref={scanFileInputRef}
        type="file"
        accept="image/*,.heic,.heif,.pdf,application/pdf"
        multiple
        onChange={(event) => {
          const files = event.target.files;
          if (files && files.length > 0) {
            void handleScanFiles(Array.from(files));
          }
          event.target.value = '';
        }}
        className="hidden"
      />

      {scanLoading && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary-light)]">
              <Icon name="progress_activity" size={28} className="animate-spin text-[var(--color-foreground)]" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-[var(--color-foreground)]">スキャン中...</h2>
            <p className="mt-2 text-sm text-[var(--color-muted)]">OCR と単語追加を順番に処理しています。</p>
          </div>
        </div>
      )}
    </>
  );
}
