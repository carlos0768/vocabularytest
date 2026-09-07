'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui';
import { expandFilesForScan, processImageToBase64 } from '@/lib/image-utils';
import {
  MAX_OFFICIAL_WORDBOOK_SCAN_IMAGES,
  OFFICIAL_WORDBOOK_SCAN_MODES,
  OFFICIAL_WORDBOOK_SCAN_MODE_LABELS,
  appendScannedWords,
  type OfficialWordbookScanMode,
} from '@/lib/official-wordbooks/scan';
import {
  OFFICIAL_WORDBOOK_EIKEN_LEVELS,
  OFFICIAL_WORDBOOK_EIKEN_LEVEL_LABELS,
  type OfficialWordbookEikenLevelValue,
  type OfficialWordbookWordInput,
} from '@/lib/official-wordbooks/editor';

// 公式単語帳エディターのカメラスキャン。撮影/選択した画像を1枚ずつ
// /api/ops/official-wordbooks/scan に送り、返ってきた単語をプレビューしてから
// 表エディターへ流し込む(一括貼り付けと同じく「置き換え」か「末尾に追加」)。
// 画像の圧縮・HEIC変換・PDFのページ分割はユーザー向けスキャンと同じ
// image-utils を使う(Vercelのリクエストサイズ制限に収めるため)。

type Shot = {
  id: string;
  file: File;
  url: string;
};

interface OfficialWordbookScanPanelProps {
  adminSecret: string;
  /** メタ情報で選んでいる英検レベル。英検モードの初期値に使う。 */
  defaultEikenLevel: OfficialWordbookEikenLevelValue | '';
  onApply: (words: OfficialWordbookWordInput[], mode: 'replace' | 'append') => void;
}

let shotSeed = 0;
function nextShotId(): string {
  shotSeed += 1;
  return `shot-${shotSeed}`;
}

export function OfficialWordbookScanPanel({
  adminSecret,
  defaultEikenLevel,
  onApply,
}: OfficialWordbookScanPanelProps) {
  const [open, setOpen] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [mode, setMode] = useState<OfficialWordbookScanMode>('all');
  const [eikenLevel, setEikenLevel] = useState<OfficialWordbookEikenLevelValue | ''>(defaultEikenLevel);
  const [enrich, setEnrich] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [scannedWords, setScannedWords] = useState<OfficialWordbookWordInput[]>([]);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // アンマウント時にプレビューURLを取り消すため、最新の一覧を ref に写しておく。
  const shotsRef = useRef<Shot[]>([]);
  useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);

  useEffect(() => () => {
    for (const shot of shotsRef.current) URL.revokeObjectURL(shot.url);
  }, []);

  // メタ情報の英検レベルを変えたら、まだ触っていないスキャン側にも反映する。
  useEffect(() => {
    setEikenLevel((current) => (current === '' ? defaultEikenLevel : current));
  }, [defaultEikenLevel]);

  const addFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    try {
      // PDFはページごとの画像に割ってから1ページ=1枚として扱う。
      const expanded = await expandFilesForScan(Array.from(fileList));
      setShots((current) => {
        const room = MAX_OFFICIAL_WORDBOOK_SCAN_IMAGES - current.length;
        if (room <= 0) {
          setError(`画像は一度に${MAX_OFFICIAL_WORDBOOK_SCAN_IMAGES}枚までです`);
          return current;
        }
        if (expanded.length > room) {
          setError(`画像は一度に${MAX_OFFICIAL_WORDBOOK_SCAN_IMAGES}枚までです(${expanded.length - room}枚は追加しませんでした)`);
        }
        const added = expanded.slice(0, room).map((file) => ({
          id: nextShotId(),
          file,
          url: URL.createObjectURL(file),
        }));
        return [...current, ...added];
      });
    } catch (expandError) {
      console.error('[OfficialWordbookScanPanel] failed to read files', expandError);
      setError(expandError instanceof Error ? expandError.message : '画像を読み込めませんでした');
    }
  };

  const removeShot = (id: string) => {
    setShots((current) => {
      const target = current.find((shot) => shot.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((shot) => shot.id !== id);
    });
  };

  const clearShots = () => {
    setShots((current) => {
      for (const shot of current) URL.revokeObjectURL(shot.url);
      return [];
    });
  };

  const scan = async () => {
    if (shots.length === 0 || !adminSecret || scanning) return;
    if (mode === 'eiken' && !eikenLevel) {
      setError('英検モードでは英検レベルを選んでください');
      return;
    }

    setScanning(true);
    setError(null);
    setWarnings([]);
    setScannedWords([]);

    let collected: OfficialWordbookWordInput[] = [];
    const collectedWarnings: string[] = [];
    let firstFailure: string | null = null;
    let duplicates = 0;

    try {
      for (let index = 0; index < shots.length; index += 1) {
        const shot = shots[index]!;
        setProgress(`画像 ${index + 1}/${shots.length} を解析中...`);
        try {
          const image = await processImageToBase64(shot.file, 'default');
          const response = await fetch('/api/ops/official-wordbooks/scan', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-admin-secret': adminSecret,
            },
            body: JSON.stringify({
              image,
              mode,
              eikenLevel: eikenLevel || null,
              enrich,
            }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result?.success) {
            throw new Error(result?.error ?? `スキャンに失敗しました (${response.status})`);
          }

          // 複数枚に同じ単語が写っていることは普通にあるので、
          // 重ねる時点で英単語キーの重複を潰す。
          const merged = appendScannedWords(collected, result.words as OfficialWordbookWordInput[]);
          collected = merged.words;
          duplicates += merged.duplicates;
          for (const warning of (result.warnings as string[] | undefined) ?? []) {
            if (!collectedWarnings.includes(warning)) collectedWarnings.push(warning);
          }
        } catch (scanError) {
          console.error('[OfficialWordbookScanPanel] failed to scan one image', { index, scanError });
          if (firstFailure === null) {
            firstFailure = scanError instanceof Error ? scanError.message : 'スキャンに失敗しました';
          }
        }
      }

      if (collected.length === 0) {
        setError(firstFailure ?? '画像から単語を読み取れませんでした');
        return;
      }

      if (firstFailure) {
        collectedWarnings.unshift(`一部の画像を解析できませんでした: ${firstFailure}`);
      }
      if (duplicates > 0) {
        collectedWarnings.unshift(`画像をまたいで重複した${duplicates}語をまとめました`);
      }

      setScannedWords(collected);
      setWarnings(collectedWarnings);
    } finally {
      setScanning(false);
      setProgress(null);
    }
  };

  const apply = (target: 'replace' | 'append') => {
    if (scannedWords.length === 0) return;
    onApply(scannedWords, target);
    setScannedWords([]);
    setWarnings([]);
    clearShots();
  };

  return (
    <section className="rounded-2xl border-2 border-b-4 border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-[var(--color-foreground)]">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="photo_camera" size={18} />
            カメラでスキャンして単語を読み込む
          </span>
        </h2>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="rounded-lg border-2 border-[var(--solid-ink)] px-3 py-1.5 text-xs font-bold text-[var(--solid-ink)]"
        >
          {open ? '閉じる' : '開く'}
        </button>
      </div>

      {!open && (
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          紙の単語帳やプリントを撮影すると、AIが英単語と日本語訳を読み取って上の表に流し込みます。
        </p>
      )}

      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-muted)]">抽出モード</span>
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value as OfficialWordbookScanMode)}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[var(--color-foreground)]"
              >
                {OFFICIAL_WORDBOOK_SCAN_MODES.map((value) => (
                  <option key={value} value={value}>
                    {OFFICIAL_WORDBOOK_SCAN_MODE_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-muted)]">
                英検レベル{mode === 'eiken' ? '(必須)' : '(任意・絞り込み)'}
              </span>
              <select
                value={eikenLevel}
                onChange={(event) => setEikenLevel(event.target.value as OfficialWordbookEikenLevelValue | '')}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[var(--color-foreground)]"
              >
                <option value="">指定しない</option>
                {OFFICIAL_WORDBOOK_EIKEN_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {OFFICIAL_WORDBOOK_EIKEN_LEVEL_LABELS[level]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-start gap-2 self-end rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5">
              <input
                type="checkbox"
                checked={enrich}
                onChange={(event) => setEnrich(event.target.checked)}
                className="mt-0.5"
              />
              <span className="text-sm text-[var(--color-foreground)]">
                不足分をAIで補完
                <span className="ml-1 text-xs text-[var(--color-muted)]">
                  (ダミー選択肢・例文・発音・品詞。読み取れた値は上書きしません)
                </span>
              </span>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                void addFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={(event) => {
                void addFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={scanning}
              className="rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon name="photo_camera" size={16} />
                カメラで撮影
              </span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={scanning}
              className="rounded-xl border-2 border-[var(--solid-ink)] px-4 py-2 text-sm font-bold text-[var(--solid-ink)] disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon name="add_photo_alternate" size={16} />
                画像/PDFを選ぶ
              </span>
            </button>
            {shots.length > 0 && (
              <button
                type="button"
                onClick={clearShots}
                disabled={scanning}
                className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-bold text-[var(--color-muted)] disabled:opacity-50"
              >
                すべて取り消す
              </button>
            )}
          </div>

          {shots.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {shots.map((shot, index) => (
                <div
                  key={shot.id}
                  className="relative h-24 w-24 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]"
                >
                  {/* 撮ったばかりのローカル画像なので next/image は使わない */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={shot.url} alt={`スキャン画像 ${index + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeShot(shot.id)}
                    disabled={scanning}
                    aria-label={`スキャン画像 ${index + 1} を削除`}
                    className="absolute right-1 top-1 rounded-full bg-[var(--color-surface)]/90 p-1 text-[var(--color-error)] disabled:opacity-50"
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void scan()}
              disabled={scanning || shots.length === 0 || !adminSecret}
              className="rounded-xl border-2 border-[var(--color-accent-ink,var(--color-accent))] bg-[var(--color-accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {scanning ? '解析中...' : `${shots.length || ''}枚をスキャン`}
            </button>
            {!adminSecret && (
              <span className="text-xs text-[var(--color-muted)]">ADMIN_SECRETを入力してください</span>
            )}
            {progress && <span className="text-xs font-bold text-[var(--color-muted)]">{progress}</span>}
          </div>

          {error && <p className="text-sm font-bold text-[var(--color-error)]">{error}</p>}

          {scannedWords.length > 0 && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
              <p className="text-sm font-bold text-[var(--color-foreground)]">
                {scannedWords.length}語を読み取りました
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-[var(--color-muted)]">
                {scannedWords.slice(0, 12).map((word) => word.english).join(', ')}
                {scannedWords.length > 12 ? ' ...' : ''}
              </p>
              {warnings.map((warning) => (
                <p key={warning} className="mt-1 text-xs font-bold text-[var(--color-muted)]">
                  ⚠ {warning}
                </p>
              ))}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => apply('append')}
                  className="rounded-lg border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-3 py-1.5 text-xs font-bold text-white"
                >
                  末尾に追加
                </button>
                <button
                  type="button"
                  onClick={() => apply('replace')}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-bold text-[var(--color-foreground)]"
                >
                  置き換えて読み込む
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
