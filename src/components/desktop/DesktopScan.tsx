'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DesktopButton, DesktopTopbar } from '@/components/desktop/DesktopChrome';
import { desktopPosShort, desktopThumbColor } from '@/components/desktop/desktop-data';
import { Icon } from '@/components/ui/Icon';
import { processImageFile, processImageToBase64 } from '@/lib/image-utils';
import {
  addHomeImmediateScanResult,
  buildHomeImmediateScanConfirmResultPayload,
  createHomeImmediateScanResultAccumulator,
  hasNoHomeImmediateScanWords,
} from '@/lib/home/home-immediate-scan-results';
import { saveHomeGeneratingWordbook } from '@/lib/home/home-session-storage';
import {
  prepareScanConfirmForNewProject,
  saveScanConfirmResultPayload,
  setScanConfirmExistingProject,
} from '@/lib/scan/scan-session-storage';
import { createBrowserClient } from '@/lib/supabase';
import type { AIWordExtraction, LexiconEntry, Project } from '@/types';

const STRIPE_BG = 'repeating-linear-gradient(135deg, #ecebe6, #ecebe6 10px, #e3e1da 10px, #e3e1da 20px)';

type EditableScanWord = AIWordExtraction & {
  tempId: string;
  isEditing: boolean;
  isSelected: boolean;
};

type DesktopScanProject = Pick<Project, 'id' | 'title' | 'createdAt' | 'iconImage'>;
type ScanOptionKey = 'all' | 'circled' | 'idiom' | 'eiken';

const SCAN_OPTIONS: {
  key: ScanOptionKey;
  label: string;
  description: string;
  icon: string;
  pro?: boolean;
}[] = [
  { key: 'all', label: 'すべての単語', description: '紙面内の英単語を広く抽出', icon: 'document_scanner' },
  { key: 'circled', label: '丸囲み', description: 'マークした単語を優先', icon: 'gesture' },
  { key: 'idiom', label: '熟語・イディオム', description: '複数語の表現も候補化', icon: 'link' },
  { key: 'eiken', label: '英検', description: '級別の頻出語を優先', icon: 'filter_alt', pro: true },
];

const MAX_SCAN_IMAGE_COUNT = 20;

function createdLabel(project: DesktopScanProject) {
  return new Date(project.createdAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

function randomSuffix(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function uploadExtensionFor(file: File): string {
  if (file.type === 'image/png') return '.png';
  if (file.type === 'image/webp') return '.webp';
  if (file.type === 'image/gif') return '.gif';
  return '.jpg';
}

export function DesktopScanView({
  projects = [],
  loadingProjects = false,
  targetProjectId,
  targetProjectTitle,
  isPro = false,
}: {
  projects?: DesktopScanProject[];
  loadingProjects?: boolean;
  targetProjectId?: string | null;
  targetProjectTitle?: string | null;
  isPro?: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedDest, setSelectedDest] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<ScanOptionKey[]>(['all']);
  const [processing, setProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const hasFixedDestination = Boolean(targetProjectId);
  const projectOptions = useMemo(() => projects.slice(0, 8), [projects]);
  const destination = selectedDest === 'new' || projectOptions.some((project) => project.id === selectedDest)
    ? selectedDest
    : projectOptions[0]?.id ?? 'new';
  const destinationProjectId = hasFixedDestination
    ? targetProjectId ?? null
    : destination === 'new'
      ? null
      : destination;
  const destinationProject = destinationProjectId
    ? projectOptions.find((project) => project.id === destinationProjectId) ?? null
    : null;
  const scanModes = selectedOptions;
  const eikenLevel = scanModes.includes('eiken') ? '3' : null;

  const toggleOption = (key: ScanOptionKey) => {
    setSelectedOptions((current) => {
      if (!current.includes(key)) return [...current, key];
      if (current.length === 1) return current;
      return current.filter((item) => item !== key);
    });
  };

  const createBackgroundScanJob = async (files: readonly File[]) => {
    const supabase = createBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('ログインが必要です');

    const uploadedPaths: string[] = [];
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index]!;
        setProcessingLabel(`画像 ${index + 1}/${files.length} をアップロード中...`);
        const processedFile = await processImageFile(file, 'default');
        const imagePath = `${session.user.id}/${Date.now()}-${index}-${randomSuffix()}${uploadExtensionFor(processedFile)}`;
        const { error: uploadError } = await supabase.storage
          .from('scan-images')
          .upload(imagePath, processedFile, {
            contentType: processedFile.type || 'image/jpeg',
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`画像のアップロードに失敗しました: ${uploadError.message}`);
        }
        uploadedPaths.push(imagePath);
      }

      const dateLabel = new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
      const projectTitle = targetProjectTitle
        ?? destinationProject?.title
        ?? (destinationProjectId ? '選択中の単語帳' : `スキャン ${dateLabel}`);
      setProcessingLabel('スキャンを送信中...');
      const res = await fetch('/api/scan-jobs/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          imagePaths: uploadedPaths,
          projectTitle,
          scanMode: scanModes[0] ?? 'all',
          scanModes,
          eikenLevel,
          targetProjectId: destinationProjectId || undefined,
          clientPlatform: 'web',
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(errBody.error ?? 'スキャンの送信に失敗しました');
      }

      const result = await res.json().catch(() => ({})) as { jobId?: unknown };
      return {
        jobId: typeof result.jobId === 'string' ? result.jobId : undefined,
        projectTitle,
      };
    } catch (error) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from('scan-images').remove(uploadedPaths);
      }
      throw error;
    }
  };

  const extractImagesImmediately = async (files: readonly File[]) => {
    let accumulator = createHomeImmediateScanResultAccumulator();
    const mode = scanModes[0] ?? 'all';

    for (let index = 0; index < files.length; index++) {
      const file = files[index]!;
      setProcessingLabel(`画像 ${index + 1}/${files.length} を解析中...`);
      const base64 = await processImageToBase64(file, 'default');
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          mode,
          scanModes,
          eikenLevel,
        }),
      });
      const result = await res.json().catch(() => ({})) as {
        success?: boolean;
        words?: unknown[];
        sourceLabels?: unknown[];
        lexiconEntries?: LexiconEntry[];
        error?: string;
      };

      if (!res.ok || !result.success) {
        throw new Error(result.error ?? `画像 ${index + 1} の抽出に失敗しました`);
      }

      accumulator = addHomeImmediateScanResult(accumulator, {
        words: result.words,
        sourceLabels: result.sourceLabels,
        lexiconEntries: result.lexiconEntries,
      });
    }

    if (hasNoHomeImmediateScanWords(accumulator)) {
      throw new Error('画像から単語を読み取れませんでした');
    }

    saveScanConfirmResultPayload(
      sessionStorage,
      buildHomeImmediateScanConfirmResultPayload(accumulator),
    );
    if (destinationProjectId) {
      setScanConfirmExistingProject(sessionStorage, destinationProjectId);
    } else {
      prepareScanConfirmForNewProject(sessionStorage);
    }
  };

  const handleFilesSelected = async (files: readonly File[]) => {
    if (files.length === 0 || processing) return;
    if (files.length > MAX_SCAN_IMAGE_COUNT) {
      setSuccessMsg(null);
      setErrorMsg(`一度に選択できる画像は${MAX_SCAN_IMAGE_COUNT}枚までです`);
      return;
    }

    setProcessing(true);
    setProcessingLabel(files.length > 1 ? `画像 1/${files.length} を準備中...` : '画像を準備中...');
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (isPro) {
        const scanJob = await createBackgroundScanJob(files);
        if (scanJob.jobId) {
          saveHomeGeneratingWordbook(sessionStorage, {
            id: `generating-${Date.now()}`,
            title: scanJob.projectTitle,
            linkedJobId: scanJob.jobId,
          });
        }
        setProcessingLabel('ホームへ移動中...');
        router.push('/');
        return;
      }

      await extractImagesImmediately(files);
      setProcessingLabel('結果を表示中...');
      router.replace('/scan/confirm');
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : '処理に失敗しました');
      setProcessing(false);
      setProcessingLabel(null);
    }
  };

  const openFilePicker = () => fileInputRef.current?.click();

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    void handleFilesSelected(files);
  };

  const handleClipboard = async () => {
    try {
      if (!navigator.clipboard?.read) {
        throw new Error('このブラウザではクリップボード画像の読み取りに対応していません');
      }
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith('image/'));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        files.push(new File([blob], `clipboard-${Date.now()}.${imageType.split('/')[1] ?? 'png'}`, { type: imageType }));
      }
      if (files.length === 0) {
        throw new Error('クリップボードに画像が見つかりません');
      }
      await handleFilesSelected(files);
    } catch (error) {
      setSuccessMsg(null);
      setErrorMsg(error instanceof Error ? error.message : 'クリップボードから読み取れませんでした');
    }
  };

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar
        title={hasFixedDestination ? '単語を追加' : 'スキャン'}
        crumb={hasFixedDestination ? `単語帳 / ${targetProjectTitle ?? '追加先'} / スキャン` : 'スキャン / 写真から単語帳を作成'}
      >
        {hasFixedDestination && (
          <DesktopButton href={`/project/${targetProjectId}`} variant="ghost" icon="folder">
            {targetProjectTitle ?? '追加先選択済み'}
          </DesktopButton>
        )}
        <DesktopButton icon="photo_camera" onClick={openFilePicker}>カメラで撮影</DesktopButton>
      </DesktopTopbar>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="sr-only"
        onChange={handleInputChange}
      />
      <div
        className="ds-scroll"
        style={{
          display: 'grid',
          gridTemplateColumns: hasFixedDestination ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 320px',
          gap: 24,
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void handleFilesSelected(Array.from(event.dataTransfer.files ?? []));
            }}
            style={{
              border: `2px dashed ${dragging ? 'var(--color-accent)' : 'var(--solid-ink)'}`,
              borderRadius: 'var(--solid-radius)',
              background: dragging ? 'var(--color-accent-light)' : STRIPE_BG,
              padding: hasFixedDestination ? '70px 48px' : '56px 40px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              textAlign: 'center',
              transition: 'all var(--dur-fast) var(--ease-out)',
              cursor: processing ? 'progress' : 'pointer',
              opacity: processing ? 0.72 : 1,
            }}
            onClick={openFilePicker}
          >
            <div style={{ width: 74, height: 74, borderRadius: 20, background: '#fff', border: '1.5px solid var(--solid-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '3px 4px 0 var(--solid-ink)' }}>
              <Icon name="cloud_upload" style={{ fontSize: 36, color: 'var(--color-accent)' }} />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 21 }}>
                {hasFixedDestination ? `${targetProjectTitle ?? '選択中の単語帳'}に追加` : '写真をドラッグ&ドロップ'}
              </div>
              <div className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>ノート・プリント・単語リストの写真を取り込みます</div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <button
                type="button"
                className="ds-btn dark"
                onClick={(event) => {
                  event.stopPropagation();
                  openFilePicker();
                }}
                disabled={processing}
              >
                <Icon name="image" />ファイルを選択
              </button>
              <button
                type="button"
                className="ds-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleClipboard();
                }}
                disabled={processing}
              >
                <Icon name="content_paste" />クリップボードから
              </button>
            </div>
            <div className="mono muted" style={{ fontSize: 11, marginTop: 4 }}>
              {processing ? (processingLabel ?? '処理中...') : 'JPG · PNG · HEIC — 最大 10MB · 複数枚対応'}
            </div>
            {(errorMsg || successMsg) && (
              <div
                style={{
                  color: errorMsg ? 'var(--color-error)' : 'var(--color-success)',
                  fontSize: 12.5,
                  fontWeight: 700,
                  marginTop: 2,
                }}
              >
                {errorMsg ?? successMsg}
              </div>
            )}
          </div>

          <div>
            <div className="ds-sec-head" style={{ marginBottom: 14 }}>
              <h2 style={{ fontSize: 18 }}>抽出オプション</h2>
              <span className="mono muted" style={{ fontSize: 12 }}>複数選択可</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {SCAN_OPTIONS.map((option) => {
                const selected = selectedOptions.includes(option.key);
                return (
                  <button
                    key={option.key}
                    type="button"
                    className={'ds-method' + (selected ? ' sel' : '')}
                    onClick={() => toggleOption(option.key)}
                    aria-pressed={selected}
                    style={{ minHeight: 108 }}
                  >
                    <div className="mic" style={{ background: selected ? 'var(--color-accent-light)' : 'var(--color-surface-secondary)' }}>
                      <Icon name={option.icon} style={{ color: selected ? 'var(--color-accent-ink)' : 'var(--color-ink)' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="mt">
                        {option.label}
                        {option.pro && !isPro && <span className="ds-tag accent">PRO</span>}
                      </div>
                      <div className="md">{option.description}</div>
                    </div>
                    <span className="mradio">
                      {selected && <Icon name="check" style={{ fontSize: 15 }} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {!hasFixedDestination && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 0, minHeight: 'min(620px, calc(100dvh - 150px))' }}>
            <div className="ds-card" style={{ padding: '18px 20px', flex: 1, minHeight: 460, display: 'flex', flexDirection: 'column' }}>
              <div className="muted" style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>保存先の単語帳</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 2 }}>
                {loadingProjects ? (
                  <div className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '10px 0' }}>
                    <Icon name="progress_activity" className="animate-spin" style={{ fontSize: 16 }} />
                    単語帳を読み込み中...
                  </div>
                ) : projectOptions.length === 0 ? (
                  <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.7, padding: '8px 0' }}>
                    直近の単語帳はまだありません。新しい単語帳として保存できます。
                  </div>
                ) : (
                  projectOptions.map((project) => {
                    const selected = destination === project.id;
                    return (
                      <button
                        key={project.id}
                        type="button"
                        className={'ds-chip' + (selected ? ' active' : '')}
                        style={{ justifyContent: 'flex-start', gap: 10, padding: '9px 11px' }}
                        onClick={() => setSelectedDest(project.id)}
                      >
                        <span
                          className="ds-project-icon ds-project-icon--xs"
                          style={{
                            background: project.iconImage ? undefined : desktopThumbColor(project.id),
                            backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined,
                            border: `1px solid ${selected ? 'rgba(255,255,255,0.7)' : 'var(--solid-ink)'}`,
                          }}
                        />
                        <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.title}</span>
                          <span className="mono" style={{ display: 'block', fontSize: 10, opacity: 0.7, marginTop: 1 }}>
                            {createdLabel(project)}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12, marginTop: 14 }}>
                <button
                  type="button"
                  className={'ds-chip' + (destination === 'new' ? ' active' : '')}
                  style={{ width: '100%', justifyContent: 'flex-start', borderStyle: destination === 'new' ? 'solid' : 'dashed' }}
                  onClick={() => setSelectedDest('new')}
                >
                  <Icon name="add" style={{ fontSize: 16 }} />
                  新しい単語帳を作成
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function DesktopScanConfirmView({
  words,
  projectTitle,
  isAddingToExisting,
  selectedCount,
  availableSlots,
  showLimitWarning,
  excessCount,
  currentWordCount,
  saving,
  isPro,
  onProjectTitleChange,
  onToggleWord,
  onEditWord,
  onSaveWord,
  onCancelEdit,
  onDeleteWord,
  onAddManualWord,
  onBack,
  onSaveProject,
}: {
  words: EditableScanWord[];
  projectTitle: string;
  isAddingToExisting: boolean;
  selectedCount: number;
  availableSlots: number;
  showLimitWarning: boolean;
  excessCount: number;
  currentWordCount: number;
  saving: boolean;
  isPro: boolean;
  onProjectTitleChange: (title: string) => void;
  onToggleWord: (tempId: string) => void;
  onEditWord: (tempId: string) => void;
  onSaveWord: (tempId: string, english: string, japanese: string) => void;
  onCancelEdit: (tempId: string) => void;
  onDeleteWord: (tempId: string) => void;
  onAddManualWord: () => void;
  onBack: () => void;
  onSaveProject: () => void;
}) {
  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar title="抽出結果の確認" crumb="スキャン / 単語の抽出">
        <DesktopButton variant="ghost" icon="close" onClick={onBack}>キャンセル</DesktopButton>
        <button type="button" className="ds-btn accent" disabled={saving || selectedCount === 0 || (!isPro && excessCount > 0)} onClick={onSaveProject} style={saving || selectedCount === 0 || (!isPro && excessCount > 0) ? { opacity: 0.55 } : undefined}>
          {saving ? <Icon name="progress_activity" className="animate-spin" /> : <Icon name="check" />}
          {saving ? '保存中...' : isAddingToExisting ? `${selectedCount}語を追加` : `${selectedCount}語を保存`}
        </button>
      </DesktopTopbar>
      <div className="ds-scroll" style={{ display: 'grid', gridTemplateColumns: isAddingToExisting ? 'minmax(0, 1fr)' : '380px minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
        {!isAddingToExisting && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 0 }}>
            <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ aspectRatio: '3/4', background: STRIPE_BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--color-secondary-text)' }}>
                <Icon name="image" style={{ fontSize: 40, color: 'var(--color-muted)' }} />
                <span className="mono" style={{ fontSize: 12 }}>撮影した写真</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--color-muted)' }}>scan_result.jpg</span>
              </div>
            </div>
            <div className="ds-card" style={{ padding: '18px 20px' }}>
              <div className="muted" style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>保存先の単語帳</div>
              <input className="ds-input" value={projectTitle} onChange={(event) => onProjectTitleChange(event.target.value)} placeholder="単語帳名" />
            </div>

            <div className="ds-card" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: isPro ? '1fr 1fr' : '1fr 1fr 1fr', gap: 10 }}>
                <ConfirmMetric label="抽出" value={words.length} />
                <ConfirmMetric label="選択中" value={selectedCount} accent="var(--color-accent)" />
                {!isPro && <ConfirmMetric label="残り" value={availableSlots} accent={showLimitWarning ? 'var(--color-warning)' : 'var(--color-ink)'} />}
              </div>
              {showLimitWarning && (
                <div style={{ marginTop: 14, color: 'var(--color-error)', fontSize: 12.5, fontWeight: 700, lineHeight: 1.6 }}>
                  <Icon name="warning" style={{ fontSize: 16, verticalAlign: '-3px', marginRight: 5 }} />
                  現在 {currentWordCount}語。保存すると上限を {excessCount}語超過します。
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <Icon name="auto_awesome" style={{ color: 'var(--color-accent)', fontSize: 22 }} />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19 }}>{words.length} 語</span>
            <span className="muted" style={{ fontSize: 13 }}>を抽出しました</span>
            {isAddingToExisting && (
              <>
                <span className="ds-tag plain">選択中 {selectedCount}</span>
                {!isPro && <span className="ds-tag plain">残り {availableSlots}</span>}
                {showLimitWarning && (
                  <span style={{ color: 'var(--color-error)', fontSize: 12.5, fontWeight: 700 }}>
                    現在 {currentWordCount}語。{excessCount}語超過します。
                  </span>
                )}
              </>
            )}
            <div style={{ flex: 1 }} />
            <button type="button" className="ds-btn sm" onClick={onAddManualWord}><Icon name="add" />手動で追加</button>
            {!isAddingToExisting && <span className="mono muted" style={{ fontSize: 12 }}>{selectedCount} 語を選択中</span>}
          </div>
          <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="ds-table">
              <thead>
                <tr>
                  <th style={{ width: 46 }} />
                  <th style={{ minWidth: 140 }}>英単語</th>
                  <th style={{ width: 80 }}>品詞</th>
                  <th>日本語訳</th>
                  <th style={{ width: 70 }}>CEFR</th>
                  <th style={{ width: 86 }} />
                </tr>
              </thead>
              <tbody>
                {words.map((word, index) => (
                  <DesktopScanConfirmRow
                    key={word.tempId}
                    word={word}
                    index={index}
                    onToggleWord={onToggleWord}
                    onEditWord={onEditWord}
                    onSaveWord={onSaveWord}
                    onCancelEdit={onCancelEdit}
                    onDeleteWord={onDeleteWord}
                  />
                ))}
              </tbody>
            </table>
            {words.length === 0 && (
              <div className="muted" style={{ textAlign: 'center', padding: 50, fontSize: 13 }}>
                単語がありません。戻って再度スキャンしてください。
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmMetric({ label, value, accent = 'var(--color-ink)' }: { label: string; value: number; accent?: string }) {
  return (
    <div>
      <div className="mono muted" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: accent, lineHeight: 1, marginTop: 5 }}>{value}</div>
    </div>
  );
}

function DesktopScanConfirmRow({
  word,
  index,
  onToggleWord,
  onEditWord,
  onSaveWord,
  onCancelEdit,
  onDeleteWord,
}: {
  word: EditableScanWord;
  index: number;
  onToggleWord: (tempId: string) => void;
  onEditWord: (tempId: string) => void;
  onSaveWord: (tempId: string, english: string, japanese: string) => void;
  onCancelEdit: (tempId: string) => void;
  onDeleteWord: (tempId: string) => void;
}) {
  const [english, setEnglish] = useState(word.english);
  const [japanese, setJapanese] = useState(word.japanese);

  if (word.isEditing) {
    return (
      <tr>
        <td />
        <td><input className="ds-input" value={english} onChange={(event) => setEnglish(event.target.value)} placeholder={`単語 ${index + 1}`} autoFocus /></td>
        <td />
        <td><input className="ds-input" value={japanese} onChange={(event) => setJapanese(event.target.value)} placeholder="日本語訳" /></td>
        <td />
        <td>
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" className="ds-iconbtn" onClick={() => onSaveWord(word.tempId, english, japanese)} aria-label="保存"><Icon name="check" /></button>
            <button type="button" className="ds-iconbtn" onClick={() => onCancelEdit(word.tempId)} aria-label="キャンセル"><Icon name="close" /></button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr onClick={() => onToggleWord(word.tempId)} style={!word.isSelected ? { opacity: 0.45 } : undefined}>
      <td>
        <span className={'ds-check' + (word.isSelected ? ' on' : '')}>
          {word.isSelected && <Icon name="check" style={{ fontSize: 16, color: '#fff' }} />}
        </span>
      </td>
      <td className="en">{word.english || `単語 ${index + 1}`}</td>
      <td className="pos">{desktopPosShort(word.partOfSpeechTags)}</td>
      <td className="ja">{word.japanese || '-'}</td>
      <td className="cefr"><span className="cefr-pill">{word.cefrLevel || '-'}</span></td>
      <td onClick={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" className="ds-iconbtn" onClick={() => onEditWord(word.tempId)} aria-label="編集"><Icon name="edit" /></button>
          <button type="button" className="ds-iconbtn" onClick={() => onDeleteWord(word.tempId)} aria-label="削除"><Icon name="delete" /></button>
        </div>
      </td>
    </tr>
  );
}
