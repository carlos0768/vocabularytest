'use client';

import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { MultiShotCaptureView } from '@/components/home/MultiShotCaptureView';
import { useAuth } from '@/hooks/use-auth';
import { processImageToBase64 } from '@/lib/image-utils';
import { createBrowserClient } from '@/lib/supabase';
import {
  addHomeImmediateScanResult,
  buildHomeImmediateScanConfirmResultPayload,
  createHomeImmediateScanResultAccumulator,
  hasNoHomeImmediateScanWords,
} from '@/lib/home/home-immediate-scan-results';
import {
  saveHomeGeneratingWordbook,
  type HomeGeneratingWordbookPayload,
} from '@/lib/home/home-session-storage';
import { readHomeImmediateScanExtractResponse } from '@/lib/home/home-immediate-scan-response';
import { createHomeBackgroundScanJob } from '@/lib/home/home-background-scan-upload';
import {
  prepareScanConfirmForNewProject,
  saveScanConfirmProjectDraft,
  saveScanConfirmResultPayload,
  setScanConfirmExistingProject,
} from '@/lib/scan/scan-session-storage';
import type { ExtractMode, EikenLevel } from '@/app/api/extract/route';

export const MAX_SCAN_IMAGE_COUNT = 20;

const EIKEN_LEVEL_OPTIONS: { value: Exclude<EikenLevel, null>; label: string }[] = [
  { value: '5', label: '5級' },
  { value: '4', label: '4級' },
  { value: '3', label: '3級' },
  { value: 'pre2', label: '準2級' },
  { value: '2', label: '2級' },
  { value: 'pre1', label: '準1級' },
  { value: '1', label: '1級' },
];

type SubOption = ExtractMode;

const SUB_OPTIONS: { k: SubOption; label: string; hint: string; pro?: boolean }[] = [
  { k: 'circled', label: '丸囲み',           hint: '手動マークを優先' },
  { k: 'eiken',  label: '英検',             hint: '級別頻出語を優先', pro: true },
  { k: 'idiom',  label: '熟語・イディオム', hint: '複合語・熟語を抽出' },
  { k: 'all',    label: 'すべての単語',     hint: '全単語を網羅' },
];

interface HeldShot {
  id: string;
  file: File;
  url: string;
}

interface ScanCapturePanelProps {
  /**
   * If set, the scan results will be appended to this existing project
   * instead of creating a new one.
   */
  targetProjectId?: string;
  targetProjectTitle?: string;
  /**
   * Title for the project created from this scan (used when scanning into a
   * new word book, e.g. when the name was entered in the create sheet).
   */
  newProjectTitle?: string;
  onBackgroundScanStarted?: (payload: HomeGeneratingWordbookPayload) => void;
  /** Called when the scan flow leaves the hosting sheet (before navigation). */
  onClose: () => void;
}

/**
 * Scan options + capture flow, rendered inline inside a bottom sheet
 * (ScanCaptureModal and CreateWordbookSheet both embed this). The
 * multi-shot tray and the processing overlay escape the sheet via a
 * portal so they can cover the whole screen.
 */
export function ScanCapturePanel({
  targetProjectId,
  targetProjectTitle,
  newProjectTitle,
  onBackgroundScanStarted,
  onClose,
}: ScanCapturePanelProps) {
  const router = useRouter();
  const { isPro } = useAuth();
  const [activeSubs, setActiveSubs] = useState<SubOption[]>(['all']);
  const [eikenLevel, setEikenLevel] = useState<EikenLevel>(null);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [processingLabel, setProcessingLabel] = useState<string | null>(null);
  const [captureView, setCaptureView] = useState(false);
  const [heldShots, setHeldShots] = useState<HeldShot[]>([]);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const heldShotsRef = useRef<HeldShot[]>(heldShots);
  heldShotsRef.current = heldShots;

  // The hosting sheets unmount this panel when they close, so unmount
  // cleanup is enough to release held-shot object URLs.
  useEffect(() => {
    return () => {
      heldShotsRef.current.forEach((shot) => URL.revokeObjectURL(shot.url));
    };
  }, []);

  const selectedScanModes = activeSubs;
  const selectedEikenLevel = selectedScanModes.includes('eiken') ? eikenLevel : null;

  // Single-select: exactly one extraction option is active at a time
  // (the scanModes API payload stays an array with one entry).
  const selectSubOption = (option: SubOption) => {
    setActiveSubs([option]);
    if (option !== 'eiken') setEikenLevel(null);
  };

  const createBackgroundScanJob = async (files: readonly File[]) => {
    const supabase = createBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('ログインが必要です');

    return createHomeBackgroundScanJob({
      files,
      userId: session.user.id,
      accessToken: session.access_token,
      storage: supabase.storage,
      scanMode: selectedScanModes[0] ?? 'all',
      scanModes: selectedScanModes,
      eikenLevel: selectedEikenLevel,
      targetProjectId,
      projectTitle: targetProjectTitle ?? newProjectTitle,
      onProgress: setProcessingLabel,
    });
  };

  const extractImagesImmediately = async (files: readonly File[]) => {
    let accumulator = createHomeImmediateScanResultAccumulator();
    const mode = selectedScanModes[0] ?? 'all';

    for (let index = 0; index < files.length; index++) {
      const file = files[index]!;
      try {
        setProcessingLabel(`画像 ${index + 1}/${files.length} を解析中...`);
        const base64 = await processImageToBase64(file, 'default');
        const res = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: base64,
            mode,
            scanModes: selectedScanModes,
            eikenLevel: selectedEikenLevel,
          }),
        });
        const parsed = await readHomeImmediateScanExtractResponse(res, { imageIndex: index });
        if (!parsed.ok) {
          throw new Error(parsed.error);
        }

        accumulator = addHomeImmediateScanResult(accumulator, parsed.result);
      } catch (error) {
        console.error('[ScanCapturePanel] Failed to extract one image from multi-image scan', {
          index,
          fileName: file.name,
          error,
        });
      }
    }

    if (hasNoHomeImmediateScanWords(accumulator)) {
      throw new Error('画像から単語を読み取れませんでした');
    }

    saveScanConfirmResultPayload(
      sessionStorage,
      buildHomeImmediateScanConfirmResultPayload(accumulator),
    );
    if (targetProjectId) {
      setScanConfirmExistingProject(sessionStorage, targetProjectId);
    } else {
      prepareScanConfirmForNewProject(sessionStorage);
      const trimmedTitle = newProjectTitle?.trim();
      if (trimmedTitle) {
        saveScanConfirmProjectDraft(sessionStorage, { projectName: trimmedTitle });
      }
    }
  };

  const handleFilesSelected = async (files: readonly File[]) => {
    if (files.length === 0) return;
    if (files.length > MAX_SCAN_IMAGE_COUNT) {
      setProcessingLabel(null);
      setErrorMsg(`一度に選択できる画像は${MAX_SCAN_IMAGE_COUNT}枚までです`);
      return;
    }

    setProcessing(true);
    setErrorMsg(null);
    setProcessingLabel(files.length > 1 ? `画像 1/${files.length} を準備中...` : null);
    try {
      // Pro: バックグラウンドジョブ送信（確認画面をスキップ）
      if (isPro) {
        const scanJob = await createBackgroundScanJob(files);
        if (scanJob.jobId) {
          const payload: HomeGeneratingWordbookPayload = {
            id: `generating-${Date.now()}`,
            title: scanJob.projectTitle,
            linkedJobId: scanJob.jobId,
          };
          saveHomeGeneratingWordbook(sessionStorage, payload);
          onBackgroundScanStarted?.(payload);
        }
        setProcessingLabel('ホームへ移動中...');
        onClose();
        router.push('/');
        return;
      }

      // Free: 既存フロー（/api/extract → sessionStorage → /scan/confirm）
      await extractImagesImmediately(files);
      setProcessingLabel('結果を表示中...');
      onClose();
      router.replace('/scan/confirm');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '処理に失敗しました');
      setProcessingLabel(null);
      setProcessing(false);
    }
  };

  // Camera shots are HELD in the multi-shot tray instead of being processed
  // immediately, so the user can keep shooting more pages or send the N
  // shots they already have.
  const addHeldShots = (files: readonly File[]) => {
    if (files.length === 0) return;
    const room = MAX_SCAN_IMAGE_COUNT - heldShots.length;
    if (room <= 0) {
      setErrorMsg(`一度にスキャンできるのは${MAX_SCAN_IMAGE_COUNT}枚までです`);
      return;
    }
    setErrorMsg(files.length > room ? `一度にスキャンできるのは${MAX_SCAN_IMAGE_COUNT}枚までです` : null);
    const accepted = files.slice(0, room).map((file) => ({
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
      file,
      url: URL.createObjectURL(file),
    }));
    setHeldShots((prev) => [...prev, ...accepted]);
  };

  const removeHeldShot = (id: string) => {
    setHeldShots((prev) => {
      const target = prev.find((shot) => shot.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((shot) => shot.id !== id);
    });
  };

  // Open the multi-shot tray in its 0-shot state; the pulsing shutter in
  // the tray invites the first shot (the camera is NOT launched here).
  const handleCamera = () => {
    setCaptureView(true);
  };
  const handleLibrary = () => libraryInputRef.current?.click();
  const handleCameraInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    addHeldShots(files);
  };
  const handleLibraryInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (!captureView) {
      setCaptureView(true);
    }
    addHeldShots(files);
  };

  const handleCaptureClose = () => {
    if (heldShots.length > 0 && !window.confirm('撮影した写真を破棄して戻りますか？')) return;
    heldShots.forEach((shot) => URL.revokeObjectURL(shot.url));
    setHeldShots([]);
    setErrorMsg(null);
    setCaptureView(false);
  };

  const handleCaptureConfirm = () => {
    if (heldShots.length === 0) return;
    void handleFilesSelected(heldShots.map((shot) => shot.file));
  };

  const scanDisabled = activeSubs.includes('eiken') && !eikenLevel;

  return (
    <>
      {/* Hidden file inputs */}
      <input ref={cameraInputRef} type="file" accept="image/*,.heic,.heif" capture="environment" className="sr-only"
        onChange={handleCameraInputChange} />
      <input ref={libraryInputRef} type="file" accept="image/*,.heic,.heif" multiple className="sr-only"
        onChange={handleLibraryInputChange} />

      {/* Sub-options */}
      <div
        className="mb-3 rounded-[10px] p-[11px]"
        style={{
          background: 'rgba(26,26,26,0.04)',
          border: '1px dashed var(--solid-ink)',
        }}
      >
        <div className="mb-2 flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6"/>
          </svg>
          抽出オプション
        </div>
        <div className="grid grid-cols-2 gap-[7px]">
          {SUB_OPTIONS.map(s => {
            const on = activeSubs.includes(s.k);
            return (
              <button
                key={s.k}
                type="button"
                onClick={() => selectSubOption(s.k)}
                className="flex items-start gap-2 rounded-[10px] border-[1.25px] bg-white px-3 py-2.5 text-left transition-all"
                style={{
                  borderColor: on ? 'var(--solid-ink)' : 'var(--color-border)',
                  boxShadow: on ? '2px 2px 0 var(--solid-ink)' : 'none',
                }}
              >
                <span
                  className="mt-[1px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                  style={{
                    border: `1.25px solid ${on ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    background: on ? 'var(--color-accent)' : '#fff',
                  }}
                >
                  {on && <Icon name="check" size={11} className="text-white" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-[12px] font-bold text-[var(--solid-ink)]">
                    <span className="truncate">{s.label}</span>
                    {s.pro && !isPro && (
                      <span className="shrink-0 font-mono text-[8px] font-bold tracking-[0.04em] text-[var(--color-accent)]">
                        PRO
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-medium text-[var(--color-muted)]">{s.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* EIKEN level picker (shown when eiken sub-option is selected) */}
        {activeSubs.includes('eiken') && (
          <div className="mt-2.5 pt-2.5" style={{ borderTop: '1px dashed var(--solid-ink)' }}>
            <div className="mb-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
              級を選択
            </div>
            <div className="grid grid-cols-4 gap-[6px]">
              {EIKEN_LEVEL_OPTIONS.map(lvl => {
                const on = eikenLevel === lvl.value;
                return (
                  <button
                    key={lvl.value}
                    type="button"
                    onClick={() => setEikenLevel(lvl.value)}
                    className="rounded-[8px] border-[1.25px] py-2 text-center text-[11px] font-bold transition-all"
                    style={{
                      borderColor: on ? 'var(--solid-ink)' : 'var(--color-border)',
                      background: on ? 'var(--color-accent)' : '#fff',
                      color: on ? '#fff' : 'var(--solid-ink)',
                      boxShadow: on ? '1.5px 1.5px 0 var(--solid-ink)' : 'none',
                    }}
                  >
                    {lvl.label}
                  </button>
                );
              })}
            </div>
            {!eikenLevel && (
              <p className="mt-1.5 text-[10px] text-[var(--color-muted)]">級を選んでからスキャンを開始してください</p>
            )}
          </div>
        )}
      </div>

      {/* Camera / Library buttons */}
      <div className="flex gap-2.5">
        <button type="button" onClick={handleCamera} disabled={scanDisabled} className="relative flex-1 disabled:opacity-40">
          <div className="absolute inset-0 rounded-[12px] bg-[var(--solid-ink)]" style={{ transform: 'translate(2.5px,2.5px)' }} />
          <div className="relative flex flex-col items-center gap-1.5 rounded-[12px] border-[1.25px] border-[var(--solid-ink)] bg-[var(--color-accent)] py-4 text-white">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7h3l2-2h6l2 2h3v12H4z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            <span className="text-[13px] font-bold">カメラで撮影</span>
            <span className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.75)' }}>連続撮影OK</span>
          </div>
        </button>
        <button type="button" onClick={handleLibrary} disabled={scanDisabled} className="relative flex-1 disabled:opacity-40">
          <div className="absolute inset-0 rounded-[12px] bg-[var(--solid-ink)]" style={{ transform: 'translate(2.5px,2.5px)' }} />
          <div className="relative flex flex-col items-center gap-1.5 rounded-[12px] border-[1.25px] border-[var(--solid-ink)] bg-white py-4 text-[var(--solid-ink)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2"/>
              <path d="M3 16l5-5 4 4 3-3 6 6"/>
            </svg>
            <span className="text-[13px] font-bold">写真から選ぶ</span>
            <span className="text-[10px] font-bold text-[var(--color-muted)]">複数枚可</span>
          </div>
        </button>
      </div>

      {/* Error (the tray shows its own copy while open) */}
      {errorMsg && !captureView && (
        <p className="mt-2 text-center text-[11px] text-[var(--color-error)]">{errorMsg}</p>
      )}

      {/* Full-screen layers: multi-shot tray + processing overlay */}
      {(captureView || processing) && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[120]" style={{ fontFamily: 'var(--font-body)' }}>
          {captureView && (
            <MultiShotCaptureView
              shots={heldShots}
              maxCount={MAX_SCAN_IMAGE_COUNT}
              processing={processing}
              errorMsg={errorMsg}
              onShoot={() => cameraInputRef.current?.click()}
              onAddFromLibrary={() => libraryInputRef.current?.click()}
              onRemove={removeHeldShot}
              onConfirm={handleCaptureConfirm}
              onClose={handleCaptureClose}
            />
          )}
          {processing && (
            <div
              className="absolute inset-0 z-[130] flex items-center justify-center"
              style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
            >
              <div className="flex items-center gap-2.5 rounded-2xl border-[1.5px] border-[var(--solid-ink)] bg-[#faf7f1] px-5 py-3.5 shadow-[3px_3px_0_var(--solid-ink)]">
                <Icon name="progress_activity" size={16} className="animate-spin text-[var(--solid-ink)]" />
                <span className="text-[13px] font-bold text-[var(--solid-ink)]">
                  {processingLabel ?? (isPro ? 'スキャンを送信中...' : 'AI が単語を抽出中...')}
                </span>
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
