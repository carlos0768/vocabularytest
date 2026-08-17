'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { usePageScrolled } from '@/hooks/use-page-scrolled';
import { getRepository } from '@/lib/db';
import { getGuestUserId } from '@/lib/utils';
import { invalidateHomeCache } from '@/lib/home-cache';
import { processProjectIconFile } from '@/lib/image-utils';
import { getCachedBinderIcons, loadBinderIcons, saveBinderIcon } from '@/lib/binders/icons';
import { normalizeBinder, thumbColor } from '@/lib/binders/display';
import { BINDER_NAME_MAX_LENGTH, normalizeBinderName, renameBinder } from '@/lib/binders/rename';
import type { Project, SubscriptionStatus } from '@/types';

// バインダーの設定。バインダー詳細 (/binder/[name]) の右上の歯車から来る。
// 一覧の邪魔になっていたアイコン設定と公開ボタンをここに集め、名前の変更も足した。

export default function BinderSettingsPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: rawName } = use(params);
  const binderName = decodeURIComponent(rawName);
  const router = useRouter();
  const { user, subscription, isPro } = useAuth();
  const { showToast } = useToast();
  const pageScrolled = usePageScrolled();

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [iconImage, setIconImage] = useState<string | null>(
    () => getCachedBinderIcons()?.[binderName] ?? null,
  );
  const [savingIcon, setSavingIcon] = useState(false);
  const [nameDraft, setNameDraft] = useState(binderName);
  const [renaming, setRenaming] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const binderHref = `/binder/${encodeURIComponent(binderName)}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const userId = user ? user.id : getGuestUserId();
        const loaded = await repository.getProjects(userId);
        if (!cancelled) setProjects(loaded);
      } catch {
        if (!cancelled) setProjects([]);
      }
    })();
    return () => { cancelled = true; };
  }, [repository, user]);

  useEffect(() => {
    let cancelled = false;
    void loadBinderIcons().then((icons) => {
      if (!cancelled) setIconImage(icons[binderName] ?? null);
    });
    return () => { cancelled = true; };
  }, [binderName]);

  // URLのバインダー名が変わったら (改名直後の replace など) 入力欄も追従させる
  useEffect(() => {
    setNameDraft(binderName);
  }, [binderName]);

  const inBinder = useMemo(
    () => projects.filter((p) => normalizeBinder(p.binder) === binderName),
    [projects, binderName],
  );

  const handleBack = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push(binderHref);
  }, [binderHref, router]);

  /**
   * バインダーのアイコン。単語帳アイコンと同じ正方形JPEGのdata URLに落として
   * から保存する。null は削除（頭文字＋フォルダアイコンの既定表示に戻る）。
   */
  const handlePickIcon = async (file: File | null) => {
    if (!file || savingIcon) return;
    setSavingIcon(true);
    try {
      const dataUrl = await processProjectIconFile(file);
      await saveBinderIcon(binderName, dataUrl);
      setIconImage(dataUrl);
      invalidateHomeCache();
      showToast({ message: 'アイコンを設定しました', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'アイコンの保存に失敗しました';
      showToast({ message, type: 'error' });
    } finally {
      setSavingIcon(false);
    }
  };

  const handleRemoveIcon = async () => {
    if (savingIcon || !iconImage) return;
    setSavingIcon(true);
    try {
      await saveBinderIcon(binderName, null);
      setIconImage(null);
      invalidateHomeCache();
      showToast({ message: 'アイコンを削除しました', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'アイコンの削除に失敗しました';
      showToast({ message, type: 'error' });
    } finally {
      setSavingIcon(false);
    }
  };

  /**
   * バインダー名の変更。バインダーは projects.binder の文字列でしかないので、
   * 中の単語帳を1冊ずつ新しい名前に付け替える。
   */
  const handleRename = async () => {
    if (renaming) return;
    const parsed = normalizeBinderName(nameDraft);
    if (!parsed.ok) {
      showToast({ message: parsed.error, type: 'error' });
      return;
    }
    if (parsed.value === binderName) return;
    if (inBinder.length === 0) {
      showToast({ message: '単語帳が1冊も入っていないバインダーは名前を変えられません', type: 'error' });
      return;
    }

    // 既存の別のバインダーと同じ名前にすると、そちらに合流することになる
    const mergesInto = projects.some((p) => normalizeBinder(p.binder) === parsed.value);
    if (mergesInto && !window.confirm(`「${parsed.value}」は既にあります。${inBinder.length}冊をそちらに移しますか？`)) {
      return;
    }

    setRenaming(true);
    try {
      const result = await renameBinder({
        repository,
        projects,
        oldName: binderName,
        newName: parsed.value,
      });
      invalidateHomeCache();
      if (result.renamed === 0) {
        showToast({ message: '名前の変更に失敗しました', type: 'error' });
        return;
      }
      if (result.renamed < result.total) {
        showToast({
          message: `${result.renamed}/${result.total}冊だけ変更できました。通信状況を確認してもう一度お試しください`,
          type: 'error',
        });
      } else {
        showToast({ message: '名前を変更しました', type: 'success' });
      }
      router.replace(`/binder/${encodeURIComponent(parsed.value)}/settings`);
    } catch {
      showToast({ message: '名前の変更に失敗しました', type: 'error' });
    } finally {
      setRenaming(false);
    }
  };

  // バインダー内の単語帳をまとめて共有ライブラリに公開する (Pro限定)
  const handlePublishBinder = async () => {
    if (publishing || inBinder.length === 0) return;
    if (!isPro) {
      showToast({ message: '共有ライブラリへの公開はProプラン限定です', type: 'error' });
      return;
    }
    if (!window.confirm(`「${binderName}」内の${inBinder.length}冊を共有ライブラリに公開しますか？`)) return;
    setPublishing(true);
    let ok = 0;
    for (const project of inBinder) {
      try {
        const res = await fetch('/api/shared-projects/share-wordbook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: project.id, sharedTags: [binderName] }),
        });
        const payload = (await res.json().catch(() => null)) as { success?: boolean } | null;
        if (res.ok && payload?.success) ok += 1;
      } catch {
        // 続行して残りを公開する
      }
    }
    setPublishing(false);
    invalidateHomeCache();
    showToast({
      message: ok === inBinder.length ? `${ok}冊を公開しました` : `${ok}/${inBinder.length}冊を公開しました`,
      type: ok > 0 ? 'success' : 'error',
    });
  };

  const nameChanged = nameDraft.trim() !== binderName;

  return (
    <div className="relative mx-auto min-h-screen w-full max-w-[560px] bg-[var(--color-background)] px-[18px] pb-[max(2rem,env(safe-area-inset-bottom))] font-[var(--font-body)] lg:max-w-[720px] lg:px-8">
      {/* ノッチ帯は全体共通の StatusBarCover が覆うので、ここではヘッダだけ固定する */}
      <header
        className={`sticky z-40 -mx-[18px] flex items-center gap-2 border-b-2 bg-[var(--color-background)]/95 px-[18px] py-2.5 backdrop-blur-md lg:-mx-8 lg:px-8 ${pageScrolled ? 'border-[var(--solid-ink)]' : 'border-transparent'}`}
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
      >
        <button
          type="button"
          onClick={handleBack}
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          aria-label="バインダーに戻る"
        >
          <Icon name="chevron_left" size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
            BINDER SETTINGS
          </div>
          <div className="truncate font-display text-xl font-extrabold text-[var(--solid-ink)]">{binderName}</div>
        </div>
      </header>

      <div className="flex flex-col gap-4 pt-3.5">
        <SectionCard icon="image" title="バインダーアイコン" subtitle="ホームのタイルの絵柄になります" accent="#D97340">
          <div className="flex items-center gap-3">
            <span
              className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[12px] border-2 border-[var(--solid-ink)] bg-cover bg-center text-white"
              style={{
                backgroundColor: thumbColor(binderName),
                backgroundImage: iconImage ? `url(${iconImage})` : undefined,
              }}
            >
              {!iconImage && <Icon name="folder" size={24} filled />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-bold text-[var(--color-muted)]">
                {iconImage ? '設定済み' : '未設定（フォルダの絵）'}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <label
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2 text-[12.5px] font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px ${savingIcon ? 'opacity-60' : ''}`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={savingIcon}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      event.target.value = '';
                      void handlePickIcon(file);
                    }}
                  />
                  <Icon
                    name={savingIcon ? 'progress_activity' : 'photo_camera'}
                    size={15}
                    className={savingIcon ? 'animate-spin' : undefined}
                  />
                  {savingIcon ? '保存中...' : iconImage ? '変更' : '画像を選ぶ'}
                </label>
                {iconImage && (
                  <button
                    type="button"
                    disabled={savingIcon}
                    onClick={() => void handleRemoveIcon()}
                    className="inline-flex items-center gap-1.5 rounded-[10px] border-2 border-[var(--color-border)] bg-white px-3 py-2 text-[12.5px] font-bold text-[var(--color-muted)] disabled:opacity-60"
                  >
                    <Icon name="delete" size={15} />
                    削除
                  </button>
                )}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          icon="badge"
          title="バインダー名"
          subtitle={`${inBinder.length}冊すべての行き先が変わります`}
          accent="#137FEC"
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={nameDraft}
              maxLength={BINDER_NAME_MAX_LENGTH}
              disabled={renaming}
              onChange={(event) => setNameDraft(event.target.value)}
              placeholder="バインダー名"
              className="min-w-0 flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2 text-[13.5px] font-bold text-[var(--solid-ink)] outline-none disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => void handleRename()}
              disabled={renaming || !nameChanged}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-3.5 py-2 text-[12.5px] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-40"
            >
              {renaming && <Icon name="progress_activity" size={14} className="animate-spin" />}
              {renaming ? '変更中...' : '保存'}
            </button>
          </div>
        </SectionCard>

        <SectionCard
          icon="public"
          title="共有ライブラリに公開"
          subtitle="バインダー内の単語帳をまとめて公開します（Pro限定）"
          accent="#664DB3"
        >
          <button
            type="button"
            onClick={() => void handlePublishBinder()}
            disabled={publishing || inBinder.length === 0}
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--solid-ink)] bg-white text-[13px] font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-40"
          >
            <Icon name={publishing ? 'progress_activity' : 'public'} size={17} className={publishing ? 'animate-spin' : ''} />
            {publishing ? '公開中...' : `${inBinder.length}冊を公開`}
          </button>
        </SectionCard>
      </div>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  subtitle,
  accent,
  children,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[18px] border-2 border-[var(--solid-ink)] bg-white p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] text-white"
          style={{ backgroundColor: accent }}
        >
          <Icon name={icon} size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[16px] font-extrabold leading-tight text-[var(--solid-ink)]">{title}</h2>
          {subtitle && <div className="text-[11px] font-bold text-[var(--color-muted)]">{subtitle}</div>}
        </div>
      </div>
      {children}
    </section>
  );
}
