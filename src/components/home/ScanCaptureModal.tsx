'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';
import { processImageToBase64 } from '@/lib/image-utils';
import { createBrowserClient } from '@/lib/supabase';
import type { ExtractMode } from '@/app/api/extract/route';

interface ScanCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: TopMode;
  /**
   * If set, the scan results will be appended to this existing project
   * instead of creating a new one.
   */
  targetProjectId?: string;
}

type TopMode = 'vocab';
type SubOption = 'circle' | 'eiken' | 'idiom' | 'all';

const MODES: { k: TopMode; label: string; pro?: boolean; icon: React.ReactNode }[] = [
  {
    k: 'vocab',
    label: '単語帳',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h10a4 4 0 014 4v12H8a4 4 0 01-4-4V4z"/>
        <path d="M4 4v12a4 4 0 014-4h10"/>
      </svg>
    ),
  },
];

const SUB_OPTIONS: { k: SubOption; label: string; hint: string; pro?: boolean }[] = [
  { k: 'circle', label: '丸囲み',           hint: '手動マークを優先' },
  { k: 'eiken',  label: '英検',             hint: '級別頻出語を優先', pro: true },
  { k: 'idiom',  label: '熟語・イディオム', hint: '複合語・熟語を抽出' },
  { k: 'all',    label: 'すべての単語',     hint: '全単語を網羅' },
];

function subToExtractMode(sub: SubOption): ExtractMode {
  if (sub === 'circle') return 'circled';
  if (sub === 'eiken') return 'eiken';
  if (sub === 'idiom') return 'idiom';
  return 'all';
}

export function ScanCaptureModal({ isOpen, onClose, defaultMode, targetProjectId }: ScanCaptureModalProps) {
  const router = useRouter();
  const { isPro } = useAuth();
  const [activeMode, setActiveMode] = useState<TopMode>(targetProjectId ? 'vocab' : (defaultMode ?? 'vocab'));
  const [activeSub, setActiveSub] = useState<SubOption>('all');
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setProcessing(true);
    setErrorMsg(null);
    try {
      // Pro: バックグラウンドジョブ送信（確認画面をスキップ）
      if (isPro) {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('ログインが必要です');

        const dateLabel = new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
        const formData = new FormData();
        formData.append('image', file);
        formData.append('projectTitle', `スキャン ${dateLabel}`);
        formData.append('scanMode', subToExtractMode(activeSub));
        if (targetProjectId) {
          formData.append('targetProjectId', targetProjectId);
        }

        const res = await fetch('/api/scan-jobs', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: formData,
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(errBody.error ?? 'スキャンの送信に失敗しました');
        }
        onClose();
        return;
      }

      // Free: 既存フロー（/api/extract → sessionStorage → /scan/confirm）
      const base64 = await processImageToBase64(file, 'default');
      const mode = subToExtractMode(activeSub);
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mode, eikenLevel: null }),
      });
      const result = await res.json() as { success: boolean; words?: unknown[]; sourceLabels?: string[]; lexiconEntries?: unknown[]; error?: string; limitReached?: boolean };
      if (!result.success) throw new Error(result.error ?? '抽出に失敗しました');
      sessionStorage.setItem('scanvocab_extracted_words', JSON.stringify(result.words ?? []));
      sessionStorage.setItem('scanvocab_source_labels', JSON.stringify(result.sourceLabels ?? []));
      sessionStorage.setItem('scanvocab_lexicon_entries', JSON.stringify(result.lexiconEntries ?? []));
      sessionStorage.removeItem('scanvocab_project_name');
      sessionStorage.removeItem('scanvocab_project_icon');
      if (targetProjectId) {
        sessionStorage.setItem('scanvocab_existing_project_id', targetProjectId);
      } else {
        sessionStorage.removeItem('scanvocab_existing_project_id');
      }
      onClose();
      router.replace('/scan/confirm');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '処理に失敗しました');
      setProcessing(false);
    }
  };

  const handleCamera = () => cameraInputRef.current?.click();
  const handleLibrary = () => libraryInputRef.current?.click();

  return (
    <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
      {/* Processing overlay */}
      {processing && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center">
          <div className="flex items-center gap-2.5 rounded-2xl border-[1.5px] border-[var(--solid-ink)] bg-[#faf7f1] px-5 py-3.5 shadow-[3px_3px_0_var(--solid-ink)]">
            <Icon name="progress_activity" size={16} className="animate-spin text-[var(--solid-ink)]" />
            <span className="text-[13px] font-bold text-[var(--solid-ink)]">
              {isPro ? 'スキャンを送信中...' : 'AI が単語を抽出中...'}
            </span>
          </div>
        </div>
      )}
      {/* Hidden file inputs */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="sr-only"
        onChange={(e) => void handleFileSelected(e.target.files)} />
      <input ref={libraryInputRef} type="file" accept="image/*" className="sr-only"
        onChange={(e) => void handleFileSelected(e.target.files)} />

      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
        onClick={processing ? undefined : onClose}
      />

      {/* Bottom sheet — centered, max 480px */}
      {!processing && <div className="absolute bottom-0 left-0 right-0 flex justify-center">
        <div
          className="w-full animate-fade-in-up"
          style={{
            maxWidth: 480,
            background: '#faf7f1',
            border: '1.5px solid var(--solid-ink)',
            borderBottomWidth: 0,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: '14px 18px max(28px, env(safe-area-inset-bottom))',
            boxShadow: '0 -8px 24px rgba(26,26,26,0.18)',
          }}
        >
          {/* Drag handle */}
          <div className="mb-2.5 flex justify-center">
            <div className="h-1 w-10 rounded-full bg-[rgba(26,26,26,0.2)]" />
          </div>

          {/* Title row */}
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
                NEW SCAN
              </div>
              <div className="mt-0.5 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
                何をスキャンする？
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border-[1.25px] border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
            >
              <Icon name="close" size={14} />
            </button>
          </div>

          {/* Top-level modes (hidden when scanning into an existing word book) */}
          {!targetProjectId && <div className="mb-3 flex flex-col gap-[7px]">
            {MODES.map(m => {
              const active = m.k === activeMode;
              return (
                <button
                  key={m.k}
                  type="button"
                  onClick={() => setActiveMode(m.k)}
                  className="flex items-center gap-[11px] rounded-[10px] border-[1.25px] border-[var(--solid-ink)] px-3 py-[11px] text-left transition-all"
                  style={{
                    background: active ? 'var(--solid-ink)' : '#fff',
                    color: active ? '#fff' : 'var(--solid-ink)',
                    boxShadow: active ? '2px 2px 0 var(--solid-ink)' : 'none',
                  }}
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]"
                    style={{
                      background: active ? 'rgba(255,255,255,0.12)' : 'var(--color-surface-secondary)',
                      border: active ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--color-border)',
                    }}
                  >
                    {m.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14px] font-bold">{m.label}</span>
                      {m.pro && !isPro && (
                        <span className="rounded-[3px] bg-[var(--color-accent)] px-[5px] py-[2px] font-mono text-[8px] font-bold tracking-[0.04em] text-white">
                          PRO
                        </span>
                      )}
                    </div>
                  </div>
                  {/* radio */}
                  <div
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                    style={{ border: active ? '1.5px solid #fff' : '1.5px solid var(--solid-ink)' }}
                  >
                    {active && <div className="h-[7px] w-[7px] rounded-full bg-white" />}
                  </div>
                </button>
              );
            })}
          </div>}

          {/* Sub-options (vocab only) */}
          {activeMode === 'vocab' && (
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
              <div className="flex flex-wrap gap-[5px]">
                {SUB_OPTIONS.map(s => {
                  const on = activeSub === s.k;
                  return (
                    <button
                      key={s.k}
                      type="button"
                      onClick={() => setActiveSub(s.k)}
                      className="inline-flex items-center gap-[5px] rounded-full border-[1.25px] border-[var(--solid-ink)] px-[10px] py-[6px] text-[11px] font-bold transition-colors"
                      style={{
                        background: on ? 'var(--solid-ink)' : '#fff',
                        color: on ? '#fff' : 'var(--solid-ink)',
                      }}
                    >
                      <span
                        className="inline-flex h-[13px] w-[13px] shrink-0 items-center justify-center rounded-full"
                        style={{
                          border: on ? '1.25px solid #fff' : '1.25px solid var(--solid-ink)',
                        }}
                      >
                        {on && <span className="h-[6px] w-[6px] rounded-full bg-white" />}
                      </span>
                      {s.label}
                      {s.pro && !isPro && (
                        <span
                          className="font-mono text-[8px] font-bold tracking-[0.04em]"
                          style={{ color: on ? 'rgba(255,255,255,0.7)' : 'var(--color-accent)' }}
                        >
                          PRO
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Camera / Library buttons */}
          <div className="flex gap-2.5">
            <button type="button" onClick={handleCamera} className="relative flex-1">
              <div className="absolute inset-0 rounded-[12px] bg-[var(--solid-ink)]" style={{ transform: 'translate(2.5px,2.5px)' }} />
              <div className="relative flex flex-col items-center gap-1.5 rounded-[12px] border-[1.25px] border-[var(--solid-ink)] bg-[var(--solid-ink)] py-4 text-white">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 7h3l2-2h6l2 2h3v12H4z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                <span className="text-[13px] font-bold">カメラで撮影</span>
              </div>
            </button>
            <button type="button" onClick={handleLibrary} className="relative flex-1">
              <div className="absolute inset-0 rounded-[12px] bg-[var(--solid-ink)]" style={{ transform: 'translate(2.5px,2.5px)' }} />
              <div className="relative flex flex-col items-center gap-1.5 rounded-[12px] border-[1.25px] border-[var(--solid-ink)] bg-white py-4 text-[var(--solid-ink)]">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2"/>
                  <path d="M3 16l5-5 4 4 3-3 6 6"/>
                </svg>
                <span className="text-[13px] font-bold">写真から選ぶ</span>
              </div>
            </button>
          </div>

          {/* Error */}
          {errorMsg && (
            <p className="mt-2 text-center text-[11px] text-[var(--color-error)]">{errorMsg}</p>
          )}
        </div>
      </div>}
    </div>
  );
}
