'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ManualWordInputModal } from '@/components/home/ProjectModals';
import { ScanModeModal } from '@/components/home/ScanModeModal';
import { MerkenPlusModal, type MerkenNotebookScreenId } from '@/components/notebook/MerkenPlusModal';
import {
  BottomTabs,
  Fab,
  FolderCrumb,
  HeaderStrip,
  MerkenIcon,
  StatusBar,
  TopNav,
} from '@/components/notebook/merken-primitives';
import {
  NotebookAuthRequiredState,
  NotebookErrorState,
  NotebookLoadingState,
} from '@/components/notebook/NotebookPageState';
import { useAuth } from '@/hooks/use-auth';
import { requestJson } from '@/hooks/api-client';
import { useCollectionItems } from '@/hooks/use-collection-items';
import { useNotebookBinding } from '@/hooks/use-notebook-binding';
import { useVocabularyAsset } from '@/hooks/use-vocabulary-assets';
import { expandFilesForScan, isPdfFile, processImageFile, type ImageProcessingProfile } from '@/lib/image-utils';
import {
  getNotebookCreateHref,
  getProjectNotebookCreateHref,
  getStandaloneWordbookHref,
} from '@/lib/notebook';
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

type FlashcardProgress = {
  wordIds: string[];
  currentIndex: number;
  savedAt: number;
};

function getVocabularyBadge(value: 'active' | 'passive' | null | undefined) {
  return value === 'active'
    ? { label: 'A', className: 'bg-moss/15 text-[#3b4632]' }
    : { label: 'P', className: 'bg-ochre/20 text-[#805724]' };
}

function formatPos(word: { partOfSpeechTags?: string[] }) {
  return (word.partOfSpeechTags?.[0] ?? '—').toUpperCase();
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

function getSavedQuizAccuracy(projectId: string): number | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    const raw = window.localStorage.getItem(`quiz_last_accuracy_${projectId}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { percentage?: unknown };
    return typeof parsed.percentage === 'number' ? parsed.percentage : undefined;
  } catch {
    return undefined;
  }
}

function getSavedFlashcardProgress(projectId: string): FlashcardProgress | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    const raw = window.localStorage.getItem(`flashcard_progress_${projectId}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as FlashcardProgress;
    if (!Array.isArray(parsed.wordIds) || typeof parsed.currentIndex !== 'number') return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function fallbackExampleSentence(word: string) {
  return `She continued to ${word} through every setback the project threw her way.`;
}

function resolveBottomTabHref(id: 'home' | 'notes' | 'stats' | 'me', collectionId?: string) {
  switch (id) {
    case 'home':
      return '/';
    case 'stats':
      return '/stats';
    case 'me':
      return '/settings';
    case 'notes':
    default:
      return collectionId ? `/collections/${collectionId}/notes` : '/projects';
  }
}

export function NotebookWordbookPage({
  collectionId,
  assetId,
}: {
  collectionId?: string;
  assetId: string;
}) {
  const router = useRouter();
  const { user, isPro, loading: authLoading } = useAuth();
  const {
    items,
    loading: itemsLoading,
    error: itemsError,
  } = useCollectionItems(collectionId);
  const {
    detail,
    loading,
    error,
    refresh,
  } = useVocabularyAsset(assetId);
  const { binding } = useNotebookBinding(collectionId, {
    assetId: collectionId && detail ? detail.asset.id : null,
  });

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [openWordId, setOpenWordId] = useState<string | null>(null);
  const [showPlusModal, setShowPlusModal] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showScanModeModal, setShowScanModeModal] = useState(false);
  const [selectedScanMode, setSelectedScanMode] = useState<ExtractMode>('all');
  const [selectedEikenLevel, setSelectedEikenLevel] = useState<EikenLevel>(null);
  const [showManualWordModal, setShowManualWordModal] = useState(false);
  const [manualWordEnglish, setManualWordEnglish] = useState('');
  const [manualWordJapanese, setManualWordJapanese] = useState('');
  const [manualWordSaving, setManualWordSaving] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [exampleLoading, setExampleLoading] = useState(false);
  const [lastQuizAccuracy, setLastQuizAccuracy] = useState<number | undefined>(undefined);
  const [flashcardReviewedCount, setFlashcardReviewedCount] = useState<number | undefined>(undefined);
  const scanFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!detail) return;
    setLastQuizAccuracy(getSavedQuizAccuracy(detail.project.id));
    const savedProgress = getSavedFlashcardProgress(detail.project.id);
    setFlashcardReviewedCount(savedProgress?.currentIndex);
  }, [detail]);

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

  const reviewedCount = detail
    ? Math.min(
      detail.stats.totalWords,
      flashcardReviewedCount
      ?? detail.flashcardProgress?.reviewed
      ?? detail.stats.reviewWords + detail.stats.masteredWords,
    )
    : 0;

  const wordbookAssetId = detail?.asset.id;

  const resolveScreenHref = (screen: MerkenNotebookScreenId) => {
    if (!detail) return '/collections';

    if (!collectionId) {
      if (screen === 'wordbook') {
        return getStandaloneWordbookHref(detail.project.id);
      }
      if (screen === 'structure') {
        return getProjectNotebookCreateHref(detail.project.id, 'structure_document');
      }
      return getProjectNotebookCreateHref(detail.project.id, 'correction_document');
    }

    const boundWordbookAssetId = binding?.wordbookAssetId ?? wordbookAssetId;
    if (screen === 'wordbook') {
      return boundWordbookAssetId
        ? `/collections/${collectionId}/notes/wordbook/${boundWordbookAssetId}`
        : getNotebookCreateHref(collectionId, 'vocabulary_project');
    }

    if (screen === 'structure') {
      return binding?.structureAssetId
        ? `/collections/${collectionId}/notes/structure/${binding.structureAssetId}`
        : getNotebookCreateHref(collectionId, 'structure_document', {
          wordbookAssetId: boundWordbookAssetId,
        });
    }

    return binding?.correctionAssetId
      ? `/collections/${collectionId}/notes/correction/${binding.correctionAssetId}`
      : getNotebookCreateHref(collectionId, 'correction_document', {
        wordbookAssetId: boundWordbookAssetId,
      });
  };

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
      window.alert(payload.message || `${payload.generated}件の例文を生成しました`);
      await refresh();
    } catch (requestError) {
      window.alert(requestError instanceof Error ? requestError.message : '例文生成に失敗しました。');
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
      await refresh();
    } catch (requestError) {
      window.alert(requestError instanceof Error ? requestError.message : '単語の追加に失敗しました。');
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
        window.alert('追加できる単語が見つかりませんでした');
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

      await refresh();
    } catch (requestError) {
      window.alert(requestError instanceof Error ? requestError.message : 'スキャン追加に失敗しました。');
    } finally {
      setScanLoading(false);
    }
  };

  if (authLoading || loading || (collectionId && itemsLoading)) {
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
              href={collectionId ? `/collections/${collectionId}/notes` : '/projects'}
              className="inline-flex items-center justify-center rounded-xl bg-[var(--color-foreground)] px-5 py-2.5 font-semibold text-white transition hover:opacity-90"
            >
              戻る
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <>
      <div className="flex min-h-screen flex-col bg-white">
        <div className="mx-auto flex h-screen w-full max-w-[420px] flex-col overflow-hidden bg-white relative">
          <StatusBar />

          <div className="relative">
            <TopNav
              variant="swiss"
              onBack={() => router.push(collectionId ? `/collections/${collectionId}/notes` : '/projects')}
              sub="ノート · 単語"
              title={detail.project.title}
              trailing={(
                <>
                  <button
                    className="press flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5"
                    onClick={() => setSearchOpen((current) => !current)}
                  >
                    <MerkenIcon name="search" size={18} />
                  </button>
                  <button
                    className={cn(
                      'press flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5',
                      showMenu && 'border-[3px] border-[#1662d9]',
                    )}
                    onClick={() => setShowMenu((current) => !current)}
                  >
                    <MerkenIcon name="more_horiz" size={18} />
                  </button>
                </>
              )}
            />

            {showMenu && (
              <div className="absolute right-4 top-16 z-40 w-44 border border-bd bg-white p-1 shadow-[0_14px_24px_-12px_rgba(0,0,0,0.3)]" style={{ borderRadius: 4 }}>
                <button
                  className="press flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold hover:bg-black/5"
                  onClick={() => {
                    setShowMenu(false);
                    void handleGenerateExamples();
                  }}
                >
                  <MerkenIcon name={exampleLoading ? 'progress_activity' : 'auto_awesome'} size={16} />
                  例文を生成
                </button>
                <button
                  className="press flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold hover:bg-black/5"
                  onClick={() => {
                    setShowMenu(false);
                    router.push(`/project/${detail.project.id}/manage`);
                  }}
                >
                  <MerkenIcon name="settings" size={16} />
                  管理を開く
                </button>
              </div>
            )}
          </div>

          <FolderCrumb
            variant="swiss"
            path={collectionId ? ['フォルダ', '単語帳'] : ['ノート', '単語帳']}
          />

          {searchOpen && (
            <div className="px-5 pt-3">
              <label className="relative block">
                <MerkenIcon
                  name="search"
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="単語または意味で検索"
                  className="w-full border border-bd bg-white py-3 pl-10 pr-4 text-sm outline-none"
                  style={{ borderRadius: 2 }}
                />
              </label>
            </div>
          )}

          <HeaderStrip
            variant="swiss"
            items={[
              {
                icon: 'style',
                label: 'フラッシュカード',
                sub: `${reviewedCount} / ${detail.stats.totalWords} 語`,
                badge: '今日',
                onClick: () => router.push(`/flashcard/${detail.project.id}?from=${encodeURIComponent(window.location.pathname)}`),
              },
              {
                icon: 'quiz',
                label: '4択クイズ',
                sub: lastQuizAccuracy !== undefined ? `前回 ${lastQuizAccuracy}%` : '前回 --',
                onClick: () => router.push(`/quiz/${detail.project.id}?from=${encodeURIComponent(window.location.pathname)}`),
              },
              {
                icon: 'add_circle_outline',
                label: '単語を追加',
                sub: '撮影 / 手動 / 生成',
                onClick: () => setShowAddSheet(true),
              },
            ]}
          />

          <div className="screenpad no-sb pb-[120px]">
            <div
              className="mb-1 flex items-center gap-3 px-1 text-[10px] text-muted uppercase tracking-[.14em] font-semibold"
              style={{ fontFamily: '"Inter Tight"' }}
            >
              <div className="w-[96px]">単語</div>
              <div className="w-6 text-center">区分</div>
              <div className="w-9">品詞</div>
              <div className="flex-1">意味</div>
            </div>

            <div className="border-t border-bd">
              {filteredWords.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted">該当する単語がありません。</div>
              ) : (
                filteredWords.map((word, index) => {
                  const isOpen = openWordId === word.id;
                  const badge = getVocabularyBadge(word.vocabularyType);

                  return (
                    <div key={word.id}>
                      <div
                        className={cn('a-fadeup flex items-center gap-3 border-b border-bd py-2.5')}
                        style={{ animationDelay: `${index * 40}ms` }}
                      >
                        <button
                          onClick={() => setOpenWordId(isOpen ? null : word.id)}
                          className="press w-[96px] text-left font-sans text-[15px] font-medium tracking-tight"
                        >
                          {word.english}
                        </button>

                        <div
                          className={cn('flex h-6 w-6 items-center justify-center text-[10px] font-bold', badge.className)}
                          style={{ borderRadius: 2, fontFamily: '"Inter Tight"' }}
                        >
                          {badge.label}
                        </div>

                        <div
                          className="w-9 text-[10px] uppercase tracking-wider text-muted"
                          style={{ fontFamily: '"Inter Tight"' }}
                        >
                          {formatPos(word)}
                        </div>

                        <div className="flex-1 truncate text-[13px] text-ink2">{word.japanese}</div>

                        <button
                          className="press -mr-1 flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/5"
                          onClick={() => setOpenWordId(isOpen ? null : word.id)}
                        >
                          <MerkenIcon name="more_vert" size={16} className="text-muted" />
                        </button>
                      </div>

                      {isOpen && (
                        <div className="a-fadeup pl-8 pr-2 py-3" style={{ animationDuration: '380ms' }}>
                          <div className="border border-bd bg-[#f7f7f4] p-3" style={{ borderRadius: 3 }}>
                            <div
                              className="mb-1 text-[10px] uppercase tracking-[.14em] text-muted font-bold"
                              style={{ fontFamily: '"Inter Tight"' }}
                            >
                              例文
                            </div>
                            <div className="text-[13.5px] leading-relaxed">
                              {word.exampleSentence?.trim() ? (
                                word.exampleSentence
                              ) : (
                                <>
                                  She continued to <span className="hl">{word.english}</span> through every setback the
                                  project threw her way.
                                </>
                              )}
                            </div>
                            {word.exampleSentenceJa?.trim() && (
                              <div className="mt-2 text-[12px] leading-relaxed text-muted">{word.exampleSentenceJa}</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              <div className="mb-2 mt-4 flex items-center gap-2">
                <div className="text-[10px] text-muted" style={{ fontFamily: '"Inter Tight"', fontWeight: 700, letterSpacing: '.14em' }}>
                  熟語
                </div>
                <div className="h-px flex-1 bg-rule" />
              </div>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {detail.idioms.length === 0 ? (
                  <span className="text-[12px] text-muted">熟語はまだありません。</span>
                ) : (
                  detail.idioms.map((idiom) => (
                    <span key={idiom} className="text-[12px] px-2.5 py-1 bg-[#ec489915] text-[#9d1a5b]" style={{ borderRadius: 2, fontFamily: '"Inter Tight"' }}>
                      {idiom}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          <Fab onClick={() => setShowPlusModal(true)} />
          <BottomTabs
            active="notes"
            variant="swiss"
            onSelect={(id) => router.push(resolveBottomTabHref(id, collectionId))}
          />

          <MerkenPlusModal
            open={showPlusModal}
            onClose={() => setShowPlusModal(false)}
            onPick={(screen) => router.push(resolveScreenHref(screen))}
            variant="swiss"
          />
        </div>
      </div>

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
                  <MerkenIcon name="photo_camera" size={20} />
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
                  <MerkenIcon name="edit" size={20} />
                  手動で追加
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddSheet(false);
                    void handleGenerateExamples();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl bg-[var(--color-surface-secondary)] px-4 py-3.5 text-left text-sm font-semibold text-[var(--color-foreground)] transition hover:opacity-80"
                >
                  <MerkenIcon name="auto_awesome" size={20} />
                  例文を生成
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
              <MerkenIcon name="progress_activity" size={28} className="animate-spin text-[var(--color-foreground)]" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-[var(--color-foreground)]">スキャン中...</h2>
            <p className="mt-2 text-sm text-[var(--color-muted)]">OCR と単語追加を順番に処理しています。</p>
          </div>
        </div>
      )}
    </>
  );
}
