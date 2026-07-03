'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { SolidButton } from '@/components/redesign/SolidPage';
import { ScanCapturePanel } from '@/components/home/ScanCapturePanel';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { getGuestUserId } from '@/lib/utils';
import type { SubscriptionStatus } from '@/types';

type CreateMethod = 'scan' | 'shared' | 'blank';

interface MethodOption {
  k: CreateMethod;
  icon: string;
  title: string;
  description: string;
  recommended?: boolean;
}

const METHODS: MethodOption[] = [
  { k: 'scan', icon: 'photo_camera', title: '写真でスキャン', description: 'AIが英単語と意味を自動抽出', recommended: true },
  { k: 'shared', icon: 'group', title: '共有ライブラリから', description: '公開単語帳をコピー' },
  { k: 'blank', icon: 'edit_note', title: '空の単語帳を作成', description: 'あとから手動で追加' },
];

interface CreateWordbookSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * "新しい単語帳" creation-method sheet: scan (recommended) / copy from the
 * shared library / blank word book. Choosing scan switches the SAME sheet
 * to the scan options step (ScanCapturePanel) instead of opening a separate
 * modal. The optional name is carried into the scan flow as the new project
 * title, and is required for blank creation.
 */
export function CreateWordbookSheet({ isOpen, onClose }: CreateWordbookSheetProps) {
  const router = useRouter();
  const { user, subscription, isPro } = useAuth();
  const [step, setStep] = useState<'method' | 'scan'>('method');
  const [method, setMethod] = useState<CreateMethod>(isPro ? 'scan' : 'blank');
  const [name, setName] = useState('');
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
    : method === 'shared'
      ? '共有ライブラリを開く'
      : submitting
        ? '作成中...'
        : '単語帳を作成';

  const handleSubmit = async () => {
    if (ctaDisabled) return;
    setErrorMsg(null);

    if (method === 'scan') {
      setStep('scan');
      return;
    }

    if (method === 'shared') {
      onClose();
      router.push('/shared');
      return;
    }

    setSubmitting(true);
    try {
      const userId = user ? user.id : getGuestUserId();
      const project = await repository.createProject({ userId, title: trimmedName });
      onClose();
      router.push(`/project/${project.id}`);
    } catch (error) {
      console.error('Failed to create blank project:', error);
      setErrorMsg('単語帳の作成に失敗しました');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
        onClick={submitting ? undefined : onClose}
      />

      {/* Bottom sheet — centered, max 480px */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center">
        <div
          className="w-full animate-fade-in-up"
          style={{
            maxWidth: 480,
            background: '#faf7f1',
            border: '2px solid var(--solid-ink)',
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
          <div className="mb-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {step === 'scan' && (
                <button
                  type="button"
                  onClick={() => setStep('method')}
                  aria-label="戻る"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
                >
                  <Icon name="arrow_back" size={14} />
                </button>
              )}
              <div>
                <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
                  {step === 'scan' ? 'NEW SCAN' : 'NEW'}
                </div>
                <div className="mt-0.5 font-display text-[20px] font-extrabold leading-[1.15] text-[var(--solid-ink)]">
                  {step === 'scan' ? '写真でスキャン' : '新しい単語帳'}
                </div>
                {step === 'method' && (
                  <div className="mt-1 text-[12px] font-medium text-[var(--color-muted)]">
                    作成方法を選んでください
                  </div>
                )}
                {step === 'scan' && trimmedName && (
                  <div className="mt-0.5 text-[11px] font-bold text-[var(--color-muted)]">
                    「{trimmedName}」として作成
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
            >
              <Icon name="close" size={14} />
            </button>
          </div>

          {step === 'scan' ? (
            /* Scan options + capture flow, inside the same sheet */
            <ScanCapturePanel
              newProjectTitle={trimmedName || undefined}
              onClose={onClose}
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
                    className="w-full bg-white px-3 py-3 text-[14px] font-medium text-[var(--solid-ink)] placeholder:text-[var(--color-muted)] focus:outline-none"
                  />
                </div>
                {method === 'scan' && !trimmedName && (
                  <p className="mt-1 text-[10px] text-[var(--color-muted)]">未入力の場合はスキャン内容から自動で名前が付きます</p>
                )}
              </div>

              {/* Method cards */}
              <div className="flex flex-col gap-2.5">
                {METHODS.map((m) => {
                  const active = method === m.k;
                  return (
                    <button
                      key={m.k}
                      type="button"
                      onClick={() => {
                        setMethod(m.k);
                        if (m.k === 'blank' && !trimmedName) nameInputRef.current?.focus();
                      }}
                      className="flex items-center gap-3 rounded-[14px] border-2 bg-white px-4 py-3.5 text-left transition-all"
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
                          {m.recommended && (
                            <span className="rounded-[3px] bg-[var(--color-accent)] px-[5px] py-[2px] font-mono text-[8px] font-bold tracking-[0.04em] text-white">
                              おすすめ
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
                          background: active ? 'var(--color-accent)' : '#fff',
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
