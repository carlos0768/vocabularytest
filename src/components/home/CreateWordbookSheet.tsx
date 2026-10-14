'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { SolidButton } from '@/components/redesign/SolidPage';
import { ScanCapturePanel } from '@/components/home/ScanCapturePanel';
import { WordbookSelectRow } from '@/components/project/WordbookSelectRow';
import { excludeReelSavedProjects } from '@/lib/reels/saved-words';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { saveManualAddIntent, saveVoiceAddIntent } from '@/lib/home/home-session-storage';
import { getGuestUserId, FREE_WORDBOOK_LIMIT } from '@/lib/utils';
import type { Project, SubscriptionStatus } from '@/types';

type CreateMethod = 'scan' | 'voice' | 'blank';

/**
 * 作るときの単語帳名。名前欄は置かないので日付つきの名前を付け、あとから単語帳の
 * メニューで変えてもらう (スキャンはスキャン内容から名前が付く)。
 */
function defaultWordbookTitle(method: 'voice' | 'blank', now = new Date()): string {
  const date = `${now.getMonth() + 1}/${now.getDate()}`;
  return method === 'voice' ? `音声で作成 ${date}` : `新しい単語帳 ${date}`;
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
 * There is no name field: scan names the book from its contents, voice /
 * blank get a dated default title (renamable from the project menu).
 */
export function CreateWordbookSheet({ isOpen, onClose }: CreateWordbookSheetProps) {
  const router = useRouter();
  const { user, subscription, isPro } = useAuth();
  const [step, setStep] = useState<'method' | 'scan'>('method');
  const [method, setMethod] = useState<CreateMethod>(isPro ? 'scan' : 'blank');
  // 既存の単語帳へ足すときの入り先 (対戦ロビーと同じ選択行でこの画面のまま選ぶ)。
  // '' なら新しい単語帳を作る。
  const [targetProjectId, setTargetProjectId] = useState('');
  const [existingProjects, setExistingProjects] = useState<Project[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      setStep('method');
      setMethod(isPro ? 'scan' : 'blank');
      setTargetProjectId('');
      // existingProjects はここで消さない。下の読み込みの方が先に終わることがあり、
      // 消すと「読み込み中」のまま戻らなくなる (開くたびに読み直すので古い値は残らない)
      setSubmitting(false);
      setErrorMsg(null);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [isOpen, isPro]);

  // 既存の単語帳の候補は開いたときに読む
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const userId = user ? user.id : getGuestUserId();
    repository.getProjects(userId)
      // 保存済み単語の入れ物 (内部用の単語帳) は候補に出さない
      .then((projects) => { if (!cancelled) setExistingProjects(excludeReelSavedProjects(projects)); })
      .catch((error) => {
        console.error('Failed to load projects:', error);
        if (!cancelled) setExistingProjects([]);
      });
    return () => { cancelled = true; };
  }, [isOpen, repository, user]);

  if (!isOpen) return null;

  const targetProject = existingProjects?.find((project) => project.id === targetProjectId) ?? null;
  // 音声は英語で認識するので、古典の単語帳には足せない
  const voiceUnavailable = method === 'voice' && targetProject?.kind === 'classical';
  const ctaDisabled = submitting || voiceUnavailable;
  const ctaLabel = method === 'scan'
    ? 'スキャンに進む'
    : targetProject
      ? 'この単語帳に追加'
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

    // 既存の単語帳へ足すときは作らずに、単語帳ページの追加モーダルを開く
    if (targetProject) {
      try {
        if (method === 'voice') saveVoiceAddIntent(sessionStorage, targetProject.id);
        else saveManualAddIntent(sessionStorage, targetProject.id);
      } catch {
        // sessionStorage が使えない環境では自動オープンだけ諦める
      }
      onClose();
      router.push(`/project/${targetProject.id}`);
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
      const title = defaultWordbookTitle(method);
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

  const sheetTitle = step === 'scan' ? '写真でスキャン' : '新しい単語帳';
  const scanSubtitle = targetProject ? `「${targetProject.title}」に追加` : null;

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
                    setStep('method');
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
                            onClose={onClose}
            />
          ) : (
            <>
              {/* 既存の単語帳にインポート */}
              <div className="mb-3.5">

                <div
                  className={`overflow-hidden rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]`}
                  style={{ boxShadow: '2px 2px 0 var(--solid-ink)' }}
                >
                  <WordbookSelectRow
                    projects={existingProjects ?? []}
                    value={targetProjectId}
                    onChange={setTargetProjectId}
                    label="既存の単語帳にインポート"
                    loading={existingProjects === null}
                    emptyOptionLabel="選ばない (新しく作る)"
                    placeholder="選ばない (新しく作る)"
                    isOptionDisabled={(project) => method === 'voice' && project.kind === 'classical'}
                    disabled={submitting}
                    className="px-3 py-2.5"
                  />
                </div>
                {voiceUnavailable && (
                  <p className="mt-1 text-[10px] font-bold text-[var(--color-error)]">音声で追加できるのは英語の単語帳だけです</p>
                )}
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

