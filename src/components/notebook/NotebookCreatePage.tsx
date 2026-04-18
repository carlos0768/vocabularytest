'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProjectNameModal } from '@/components/home/ProjectModals';
import {
  NotebookAuthRequiredState,
  NotebookChrome,
  NotebookCard,
  NotebookErrorState,
  NotebookLoadingState,
} from '@/components/notebook';
import { Button, Icon, useToast } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useCollectionItems } from '@/hooks/use-collection-items';
import { useCreateCorrectionDocument } from '@/hooks/use-correction-documents';
import { useOcrText } from '@/hooks/use-ocr-text';
import { useCreateStructureDocument } from '@/hooks/use-structure-documents';
import { useCreateVocabularyAsset } from '@/hooks/use-vocabulary-assets';
import { expandFilesForScan, isPdfFile, processImageFile, type ImageProcessingProfile } from '@/lib/image-utils';
import {
  getNotebookAssetHref,
  getNotebookCreateHref,
  getNotebookKindFromSegment,
  getNotebookKindLabel,
} from '@/lib/notebook';
import type { LearningAssetKind, StructureSourceType } from '@/types';

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

export function NotebookCreatePage({
  collectionId,
}: {
  collectionId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { items, loading: itemsLoading, error: itemsError } = useCollectionItems(collectionId);
  const { create: createVocabularyAsset, loading: vocabularyLoading } = useCreateVocabularyAsset();
  const { create: createStructureDocument, loading: structureLoading } = useCreateStructureDocument();
  const { create: createCorrectionDocument, loading: correctionLoading } = useCreateCorrectionDocument();
  const { extract, loading: ocrLoading } = useOcrText();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedKind = getNotebookKindFromSegment(searchParams.get('kind'));
  const [wordbookModalOpen, setWordbookModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState<StructureSourceType>('paste');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setWordbookModalOpen(selectedKind === 'vocabulary_project');
  }, [selectedKind]);

  const isBusy = vocabularyLoading || structureLoading || correctionLoading || ocrLoading || submitting;
  const pageTitle = selectedKind ? `${getNotebookKindLabel(selectedKind)}を作成` : 'ノートを作成';

  const handleWordbookCreate = async (name: string, iconImage?: string) => {
    try {
      const result = await createVocabularyAsset({
        title: name,
        collectionId,
        iconImage,
      });
      showToast({ message: '単語帳を作成しました', type: 'success' });
      router.replace(getNotebookAssetHref(collectionId, {
        collectionId,
        assetId: result.asset.id,
        sortOrder: items.length,
        addedAt: result.asset.createdAt,
        asset: result.asset,
        project: {
          id: result.project.id,
          title: result.project.title,
          iconImage: result.project.iconImage,
          sourceLabels: result.project.sourceLabels,
          createdAt: result.project.createdAt,
        },
      }));
    } catch (requestError) {
      showToast({
        message: requestError instanceof Error ? requestError.message : '単語帳の作成に失敗しました。',
        type: 'error',
      });
    }
  };

  const handleScanInput = async (files: File[]) => {
    if (files.length === 0) return;

    try {
      let scanFiles = files;
      if (files.some((file) => isPdfFile(file))) {
        scanFiles = await expandFilesForScan(files);
      }

      const extractionProfile: ImageProcessingProfile = 'default';
      const texts: string[] = [];

      for (const file of scanFiles) {
        const processed = await processImageFile(file, extractionProfile);
        const image = await readFileAsDataUrl(processed);
        const payload = await extract(image);
        if (payload.text.trim()) {
          texts.push(payload.text.trim());
        }
      }

      setText(texts.join('\n\n'));
      if (texts.length > 0) {
        showToast({ message: `${texts.length}ページ分のOCRが完了しました`, type: 'success' });
      }
    } catch (requestError) {
      showToast({
        message: requestError instanceof Error ? requestError.message : 'OCR に失敗しました。',
        type: 'error',
      });
    }
  };

  const handleSubmitDocument = async () => {
    if (!selectedKind || selectedKind === 'vocabulary_project') return;

    try {
      setSubmitting(true);
      const payload = {
        title,
        collectionId,
        text,
        sourceType,
      };

      const result = selectedKind === 'structure_document'
        ? await createStructureDocument(payload)
        : await createCorrectionDocument(payload);

      showToast({
        message: `${getNotebookKindLabel(selectedKind)}を作成しました`,
        type: 'success',
      });
      router.replace(getNotebookAssetHref(collectionId, {
        collectionId,
        assetId: result.asset.id,
        sortOrder: items.length,
        addedAt: result.asset.createdAt,
        asset: result.asset,
      }));
    } catch (requestError) {
      showToast({
        message: requestError instanceof Error ? requestError.message : '作成に失敗しました。',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const modeCards = useMemo(
    () => [
      {
        kind: 'vocabulary_project' as const,
        icon: 'menu_book',
        title: '単語帳',
        description: 'project を作成して単語を追加していきます。',
      },
      {
        kind: 'structure_document' as const,
        icon: 'account_tree',
        title: '構造解析',
        description: '英文のまとまりを解析してノート化します。',
      },
      {
        kind: 'correction_document' as const,
        icon: 'spellcheck',
        title: '添削',
        description: '英作文の添削結果を保存して復習につなげます。',
      },
    ],
    [],
  );

  if (authLoading || itemsLoading) {
    return <NotebookLoadingState />;
  }

  if (!user) {
    return <NotebookAuthRequiredState />;
  }

  if (itemsError) {
    return (
      <div className="mx-auto max-w-xl px-4 py-6">
        <NotebookErrorState
          title="作成画面を開けませんでした"
          message={itemsError}
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
        items={items}
        title={pageTitle}
        subtitle="ノート · 新規作成"
        crumbLabel="新規作成"
        currentKind={selectedKind ?? undefined}
        backHref={`/collections/${collectionId}/notes`}
      >
        {!selectedKind ? (
          <NotebookCard title="種類を選択" subtitle="作りたい面を選んでください">
            <div className="grid gap-3">
              {modeCards.map((card) => (
                <Link
                  key={card.kind}
                  href={getNotebookCreateHref(collectionId, card.kind)}
                  className="flex items-start gap-4 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-4 transition hover:border-[var(--color-foreground)]"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] bg-[var(--color-foreground)] text-white">
                    <Icon name={card.icon} size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[16px] font-bold tracking-tight text-[var(--color-foreground)]">{card.title}</div>
                    <div className="mt-1 text-[12px] leading-relaxed text-[var(--color-muted)]">{card.description}</div>
                  </div>
                  <Icon name="arrow_forward" size={18} className="mt-1 text-[var(--color-muted)]" />
                </Link>
              ))}
            </div>
          </NotebookCard>
        ) : selectedKind === 'vocabulary_project' ? (
          <NotebookCard title="単語帳を作成中" subtitle="モーダルで名前とアイコンを入力してください">
            <div className="text-sm leading-relaxed text-[var(--color-muted)]">
              単語帳名とアイコンを設定すると、collection 配下に wordbook を作成します。
            </div>
          </NotebookCard>
        ) : (
          <>
            <NotebookCard title="基本情報" subtitle="タイトルと入力方法">
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--color-muted)]">タイトル</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={`${getNotebookKindLabel(selectedKind)}のタイトル`}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-foreground)]"
                  />
                </div>

                <div>
                  <div className="mb-2 block text-sm font-medium text-[var(--color-muted)]">入力方法</div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSourceType('paste')}
                      className={sourceType === 'paste'
                        ? 'rounded-xl bg-[var(--color-foreground)] px-4 py-2 text-sm font-semibold text-white'
                        : 'rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-muted)]'}
                    >
                      貼り付け
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSourceType('scan');
                        fileInputRef.current?.click();
                      }}
                      className={sourceType === 'scan'
                        ? 'rounded-xl bg-[var(--color-foreground)] px-4 py-2 text-sm font-semibold text-white'
                        : 'rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-muted)]'}
                    >
                      スキャン
                    </button>
                  </div>
                </div>
              </div>
            </NotebookCard>

            <NotebookCard
              title={sourceType === 'scan' ? 'OCRテキスト' : '本文'}
              subtitle={sourceType === 'scan' ? '画像/PDF を選ぶと OCR 結果が入ります' : '英文を貼り付けてください'}
              right={
                sourceType === 'scan' ? (
                  <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                    {ocrLoading ? 'OCR中...' : '画像を選択'}
                  </Button>
                ) : undefined
              }
            >
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={10}
                placeholder={sourceType === 'scan' ? 'OCR 結果がここに入ります' : '解析したい英文を貼り付けてください'}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm leading-relaxed text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-foreground)]"
              />
            </NotebookCard>

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleSubmitDocument}
                disabled={isBusy || !title.trim() || !text.trim()}
              >
                {isBusy ? '作成中...' : `${getNotebookKindLabel(selectedKind)}を作成`}
              </Button>
            </div>
          </>
        )}
      </NotebookChrome>

      <ProjectNameModal
        isOpen={wordbookModalOpen}
        onClose={() => {
          setWordbookModalOpen(false);
          router.replace(`/collections/${collectionId}/notes`);
        }}
        onConfirm={handleWordbookCreate}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif,.pdf,application/pdf"
        multiple
        onChange={(event) => {
          const files = event.target.files;
          if (files && files.length > 0) {
            void handleScanInput(Array.from(files));
          }
          event.target.value = '';
        }}
        className="hidden"
      />
    </>
  );
}
