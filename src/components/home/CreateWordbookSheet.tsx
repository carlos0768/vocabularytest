'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { SolidButton } from '@/components/redesign/SolidPage';
import { ScanCapturePanel } from '@/components/home/ScanCapturePanel';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { saveManualAddIntent, saveVoiceAddIntent } from '@/lib/home/home-session-storage';
import { getGuestUserId, FREE_WORDBOOK_LIMIT } from '@/lib/utils';
import { thumbColor } from '@/lib/ui/thumb-color';
import type { Project, SubscriptionStatus } from '@/types';

type CreateMethod = 'scan' | 'voice' | 'blank';

/** 名前を付けずに「音声で作成」したときの単語帳名。 */
function defaultVoiceWordbookTitle(now = new Date()): string {
  return `音声で作成 ${now.getMonth() + 1}/${now.getDate()}`;
}

interface MethodOption {
  k: CreateMethod;
  icon: string;
  title: string;
  description: string;
  recommended?: boolean;
}

const METHODS: MethodOption[] = [
  { k: 'scan', icon: 'photo_camera', title: '写真でスキャン', description: 'AIが英単語と意味を自動抽出', recommended: true },
  { k: 'voice', icon: 'mic', title: '音声で作成', description: '読み上げた英単語をまとめて追加' },
  { k: 'blank', icon: 'edit_note', title: '空の単語帳を作成', description: 'あとから手動で追加' },
];

interface CreateWordbookSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * "新しい単語帳" creation-method sheet: scan (recommended) / voice /
 * blank word book. Voice creates the word book and opens the voice-input
 * modal on the project page (via a sessionStorage intent). Choosing scan switches the SAME sheet to the scan
 * options step (ScanCapturePanel) instead of opening a separate modal.
 * The optional name is carried into the scan flow as the new project
 * title, and is required for blank creation.
 */
export function CreateWordbookSheet({ isOpen, onClose }: CreateWordbookSheetProps) {
  const router = useRouter();
  const { user, subscription, isPro } = useAuth();
  // existing = 既存の単語帳を選ぶ段。選んだ単語帳へ、選択中の方法で単語を足す。
  const [step, setStep] = useState<'method' | 'scan' | 'existing'>('method');
  const [method, setMethod] = useState<CreateMethod>(isPro ? 'scan' : 'blank');
  const [name, setName] = useState('');
  // 既存の単語帳へ足すときの入り先。null なら新しい単語帳を作る。
  const [targetProject, setTargetProject] = useState<Project | null>(null);
  const [existingProjects, setExistingProjects] = useState<Project[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      setStep('method');
      setMethod(isPro ? 'scan' : 'blank');
      setName('');
      setTargetProject(null);
      setExistingProjects(null);
      setSubmitting(false);
      setErrorMsg(null);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [isOpen, isPro]);

  if (!isOpen) return null;

  const trimmedName = name.trim();
  const ctaDisabled = submitting || (method === 'blank' && !trimmedName);
  const ctaLabel = method === 'scan'
    ? 'スキャンに進む'
    : submitting
      ? '作成中...'
      : method === 'voice'
        ? '作成して話す'
        : '単語帳を作成';

  const handleSubmit = async () => {
    if (ctaDisabled) return;
    setErrorMsg(null);

    if (method === 'scan') {
      setStep('scan');
      return;
    }

    setSubmitting(true);
    try {
      const userId = user ? user.id : getGuestUserId();
      // Free plan is limited to FREE_WORDBOOK_LIMIT wordbooks (server-enforced by
      // the enforce_free_project_limit trigger). Pre-check for a clean message.
      if (user && !isPro) {
        const existing = await repository.getProjects(userId);
        if (existing.length >= FREE_WORDBOOK_LIMIT) {
          setErrorMsg(`無料プランは単語帳${FREE_WORDBOOK_LIMIT}冊までです。Proにアップグレードすると無制限に作成できます。`);
          setSubmitting(false);
          return;
        }
      }
      const title = trimmedName || (method === 'voice' ? defaultVoiceWordbookTitle() : trimmedName);
      const project = await repository.createProject({ userId, title, kind: 'english' });
      // 単語ゼロで始まるので、遷移先で追加モーダルを自動で開く
      // （音声で作成なら音声追加、空の単語帳なら手入力）
      try {
        if (method === 'voice') saveVoiceAddIntent(sessionStorage, project.id);
        else saveManualAddIntent(sessionStorage, project.id);
      } catch {
        // sessionStorage が使えない環境では自動オープンだけ諦める
      }
      onClose();
      router.push(`/project/${project.id}`);
    } catch (error) {
      console.error('Failed to create project:', error);
      setErrorMsg('単語帳の作成に失敗しました');
      setSubmitting(false);
    }
  };

  const openExistingStep = async () => {
    setErrorMsg(null);
    setStep('existing');
    if (existingProjects) return;
    try {
      const userId = user ? user.id : getGuestUserId();
      setExistingProjects(await repository.getProjects(userId));
    } catch (error) {
      console.error('Failed to load projects:', error);
      setExistingProjects([]);
      setErrorMsg('単語帳一覧を読み込めませんでした');
    }
  };

  // 既存の単語帳を選んだら、選択中の方法でその単語帳へ足す。
  // スキャンはこのシートの中で続け、音声・手入力は単語帳ページの追加モーダルを開く。
  const handlePickExisting = (project: Project) => {
    if (method === 'scan') {
      setTargetProject(project);
      setStep('scan');
      return;
    }
    try {
      if (method === 'voice') saveVoiceAddIntent(sessionStorage, project.id);
      else saveManualAddIntent(sessionStorage, project.id);
    } catch {
      // sessionStorage が使えない環境では自動オープンだけ諦める
    }
    onClose();
    router.push(`/project/${project.id}`);
  };

  const sheetTitle = step === 'scan'
    ? '写真でスキャン'
    : step === 'existing'
      ? '既存の単語帳にインポート'
      : '新しい単語帳';
  const scanSubtitle = targetProject
    ? `「${targetProject.title}」に追加`
    : trimmedName
      ? `「${trimmedName}」として作成`
      : null;

  return (
    <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
        onClick={submitting ? undefined : onClose}
      />

      {/* 全レイアウト共通: 四方に余白のある中央の浮いたカード (単語詳細と同じ形) */}
      <div className="absolute inset-0 flex items-center justify-center p-4 tablet:p-6 desktop:p-6">
        <div
          className="w-full animate-fade-in"
          style={{
            maxWidth: 480,
            maxHeight: '100%',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            background: 'var(--color-paper)',
            border: '2px solid var(--solid-ink)',
            borderRadius: 20,
            padding: '18px 20px 22px',
            boxShadow: '6px 8px 0 var(--solid-ink)',
          }}
        >
          {/* Title row */}
          <div className="mb-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {step !== 'method' && (
                <button
                  type="button"
                  onClick={() => {
                    // スキャンから戻るときは、来た段 (既存の単語帳の選択か方法の選択) へ戻す
                    setStep(step === 'scan' && targetProject ? 'existing' : 'method');
                    setTargetProject(null);
                  }}
                  aria-label="戻る"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)]"
                >
                  <Icon name="arrow_back" size={14} />
                </button>
              )}
              <div>
                <div className="font-display text-[20px] font-extrabold leading-[1.15] text-[var(--solid-ink)]">
                  {sheetTitle}
                </div>
                {step === 'scan' && scanSubtitle && (
                  <div className="mt-0.5 text-[11px] font-bold text-[var(--color-muted)]">
                    {scanSubtitle}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)]"
            >
              <Icon name="close" size={14} />
            </button>
          </div>

          {step === 'scan' ? (
            /* Scan options + capture flow, inside the same sheet */
            <ScanCapturePanel
              targetProjectId={targetProject?.id}
              targetProjectTitle={targetProject?.title}
              newProjectTitle={targetProject ? undefined : trimmedName || undefined}
              onClose={onClose}
            />
          ) : step === 'existing' ? (
            <ExistingWordbookList
              projects={existingProjects}
              // 音声は英語で認識するので、古典の単語帳には足せない
              isDisabled={(project) => method === 'voice' && project.kind === 'classical'}
              onPick={handlePickExisting}
              errorMsg={errorMsg}
            />
          ) : (
            <>
              {/* Name field */}
              <div className="mb-3.5">
                <div className="mb-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
                  単語帳の名前
                  {method !== 'blank' && (
                    <span className="normal-case tracking-normal opacity-70">（任意）</span>
                  )}
                </div>
                <div
                  className="overflow-hidden rounded-[10px] border-2 border-[var(--solid-ink)]"
                  style={{ boxShadow: '2px 2px 0 var(--solid-ink)' }}
                >
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例：鉄壁 Section 13"
                    maxLength={50}
                    disabled={submitting}
                    className="w-full bg-[var(--color-surface)] px-3 py-3 text-[14px] font-medium text-[var(--solid-ink)] placeholder:text-[var(--color-muted)] focus:outline-none"
                  />
                </div>
                {method === 'scan' && !trimmedName && (
                  <p className="mt-1 text-[10px] text-[var(--color-muted)]">未入力の場合はスキャン内容から自動で名前が付きます</p>
                )}

                {method === 'voice' && !trimmedName && (
                  <p className="mt-1 text-[10px] text-[var(--color-muted)]">未入力の場合は「{defaultVoiceWordbookTitle()}」になります</p>
                )}

                <button
                  type="button"
                  onClick={() => void openExistingStep()}
                  disabled={submitting}
                  className="mt-3 flex w-full items-center gap-2.5 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2.5 text-left transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-60"
                  style={{ boxShadow: '2px 2px 0 var(--solid-ink)' }}
                >
                  <Icon name="drive_file_move" size={18} className="shrink-0 text-[var(--solid-ink)]" />
                  <span className="min-w-0 flex-1 text-[13px] font-bold text-[var(--solid-ink)]">既存の単語帳にインポート</span>
                  <Icon name="chevron_right" size={18} className="shrink-0 text-[var(--color-muted)]" />
                </button>
              </div>

              {/* Method cards */}
              <div className="flex flex-col gap-2.5">
                {METHODS.map((m) => {
                  const active = method === m.k;
                  // Scanning is Pro-only: free users see a PRO badge and get
                  // the blank wordbook recommended instead. Voice input is
                  // available on every plan.
                  const showRecommended = m.recommended ? isPro : (m.k === 'blank' && !isPro);
                  const showProBadge = m.k === 'scan' && !isPro;
                  return (
                    <button
                      key={m.k}
                      type="button"
                      onClick={() => {
                        if (m.k === 'scan' && !isPro) {
                          // Scanning is Pro-only: jump straight to the scan step,
                          // where ScanCapturePanel renders the Pro upgrade funnel
                          // instead of the camera UI.
                          setStep('scan');
                          return;
                        }
                        setMethod(m.k);
                        if (m.k === 'blank' && !trimmedName) nameInputRef.current?.focus();
                      }}
                      className="flex items-center gap-3 rounded-[14px] border-2 bg-[var(--color-surface)] px-4 py-3.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60"
                      style={{
                        borderColor: active ? 'var(--solid-ink)' : 'var(--color-border)',
                        boxShadow: active ? '2px 3px 0 var(--solid-ink)' : 'none',
                      }}
                    >
                      <div
                        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[11px]"
                        style={{
                          background: m.k === 'scan' ? 'var(--color-accent-light)' : 'var(--color-surface-secondary)',
                          color: m.k === 'scan' ? 'var(--color-accent-ink)' : 'var(--solid-ink)',
                        }}
                      >
                        <Icon name={m.icon} size={22} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-display text-[14.5px] font-bold text-[var(--solid-ink)]">{m.title}</span>
                          {showRecommended && (
                            <span className="rounded-[3px] bg-[var(--color-accent)] px-[5px] py-[2px] font-mono text-[8px] font-bold tracking-[0.04em] text-[var(--color-on-accent)]">
                              おすすめ
                            </span>
                          )}
                          {showProBadge && (
                            <span className="rounded-[3px] border border-[var(--solid-ink)] bg-[var(--color-surface)] px-[5px] py-[2px] font-mono text-[8px] font-bold tracking-[0.04em] text-[var(--color-accent)]">
                              PRO
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[12px] text-[var(--color-muted)]">{m.description}</div>
                      </div>
                      {/* radio */}
                      <span
                        className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
                        style={{
                          border: `1.5px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                          background: active ? 'var(--color-accent)' : 'var(--color-surface)',
                        }}
                      >
                        {active && <Icon name="check" size={14} className="text-white" />}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* CTA */}
              <SolidButton
                variant="accent"
                size="md"
                iconLeft="arrow_forward"
                disabled={ctaDisabled}
                onClick={() => void handleSubmit()}
                className="mt-4 w-full"
                faceClassName="!w-full !justify-center"
              >
                {ctaLabel}
              </SolidButton>
              {method === 'blank' && !trimmedName && (
                <p className="mt-1.5 text-center text-[10px] text-[var(--color-muted)]">単語帳の名前を入力してください</p>
              )}
              {errorMsg && (
                <p className="mt-2 text-center text-[11px] text-[var(--color-error)]">{errorMsg}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** 「既存の単語帳にインポート」で入り先を選ぶ一覧。 */
function ExistingWordbookList({
  projects,
  isDisabled,
  onPick,
  errorMsg,
}: {
  projects: Project[] | null;
  isDisabled: (project: Project) => boolean;
  onPick: (project: Project) => void;
  errorMsg: string | null;
}) {
  if (projects === null) {
    return (
      <div className="flex items-center justify-center py-10 text-[var(--color-muted)]">
        <Icon name="progress_activity" size={20} className="animate-spin" />
      </div>
    );
  }
  if (projects.length === 0) {
    return (
      <p className="py-8 text-center text-[12px] text-[var(--color-muted)]">
        {errorMsg ?? '単語帳がありません'}
      </p>
    );
  }
  return (
    <div className="flex max-h-[min(420px,60vh)] flex-col gap-1.5 overflow-y-auto">
      {projects.map((project) => {
        const disabled = isDisabled(project);
        return (
          <button
            key={project.id}
            type="button"
            onClick={() => onPick(project)}
            disabled={disabled}
            className="flex items-center gap-2.5 rounded-[10px] border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-left transition-colors hover:border-[var(--solid-ink)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] text-[12px] font-black text-white"
              style={{ background: thumbColor(project.id) }}
            >
              {project.title.slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[var(--solid-ink)]">
              {project.title}
            </span>
            <Icon name="chevron_right" size={16} className="shrink-0 text-[var(--color-muted)]" />
          </button>
        );
      })}
    </div>
  );
}
