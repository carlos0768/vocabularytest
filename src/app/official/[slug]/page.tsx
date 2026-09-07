'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { invalidateHomeCache } from '@/lib/home-cache';
import { resolveUniqueProjectTitle } from '@/lib/projects/unique-title';
import { snapshotTranslationsToWordTranslations } from '@/lib/shared-projects/snapshot-translations';
import type {
  OfficialWordbookCard,
  OfficialWordbookCatalogWord,
} from '@/lib/official-wordbooks/catalog';

/**
 * 公式単語帳の閲覧・取り込みページ。共有ページ (/shared の「公式」タブ) から来る。
 *
 * 一覧は未ログインでも見えるが、単語の全文はログイン必須 (未ログインには
 * 先頭数語のプレビューだけが返る)。取り込みは共有単語帳と同じくプラン不問で、
 * 解約後 (読み取り専用) のアカウントだけ再登録に誘導する。
 */

type DetailResponse = {
  success?: boolean;
  wordbook?: OfficialWordbookCard;
  words?: OfficialWordbookCatalogWord[];
  totalWordCount?: number;
  previewOnly?: boolean;
  error?: string;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; wordbook: OfficialWordbookCard; words: OfficialWordbookCatalogWord[]; totalWordCount: number; previewOnly: boolean }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string };

export default function OfficialWordbookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const { showToast } = useToast();
  const { user, subscription, loading: authLoading } = useAuth();

  const subscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [importing, setImporting] = useState(false);
  const [importedProjectId, setImportedProjectId] = useState<string | null>(null);

  // ログイン状態で返る単語数が変わるので、認証の解決を待ってから取得する。
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/api/official-wordbooks/${encodeURIComponent(slug)}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => null) as DetailResponse | null;
        if (cancelled) return;

        if (response.status === 404) {
          setState({ kind: 'not-found' });
          return;
        }
        if (!response.ok || !payload?.success || !payload.wordbook) {
          setState({ kind: 'error', message: payload?.error || '公式単語帳を取得できませんでした' });
          return;
        }
        setState({
          kind: 'ready',
          wordbook: payload.wordbook,
          words: payload.words ?? [],
          totalWordCount: payload.totalWordCount ?? payload.words?.length ?? 0,
          previewOnly: payload.previewOnly === true,
        });
      } catch {
        if (!cancelled) setState({ kind: 'error', message: '通信に失敗しました' });
      }
    })();

    return () => { cancelled = true; };
  }, [authLoading, slug, user?.id]);

  // 既に取り込み済みなら「単語帳を開く」に切り替える (二重取り込み防止)。
  // 引けなくても取り込み自体は通すので best-effort。
  useEffect(() => {
    if (!user || wasPro) return;
    let cancelled = false;

    (async () => {
      try {
        const projects = await getRepository(subscriptionStatus, wasPro).getProjects(user.id);
        const existing = projects.find((project) => project.importedFromOfficialSlug === slug);
        if (!cancelled && existing) setImportedProjectId(existing.id);
      } catch (error) {
        console.error('Failed to check imported official wordbook:', error);
      }
    })();

    return () => { cancelled = true; };
  }, [slug, subscriptionStatus, user, wasPro]);

  const handleImport = useCallback(async () => {
    if (state.kind !== 'ready' || importing) return;

    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(`/official/${slug}`)}`);
      return;
    }
    // 解約後は読み取り専用リポジトリなので書き込みが失敗する。
    if (wasPro) {
      showToast({ message: '解約後は読み取り専用のため、取り込みにはProプランへの再登録が必要です。', type: 'warning' });
      router.push('/subscription');
      return;
    }
    if (state.words.length === 0) return;

    setImporting(true);
    try {
      const repo = getRepository(subscriptionStatus, wasPro);
      // 同名の単語帳が既にあると一覧で見分けが付かないので「（1）」を付けて逃がす。
      const existingTitles = await repo.getProjects(user.id)
        .then((projects) => projects.map((project) => project.title))
        .catch(() => [] as string[]);
      const importTitle = resolveUniqueProjectTitle(state.wordbook.title, existingTitles);

      const newProject = await repo.createProject({
        userId: user.id,
        title: importTitle,
        sourceLabels: state.wordbook.sourceLabels,
        importedFromOfficialSlug: state.wordbook.slug,
        ...(state.wordbook.iconImage ? { iconImage: state.wordbook.iconImage } : {}),
        ...(state.wordbook.description ? { description: state.wordbook.description } : {}),
      });

      await repo.createWords(
        state.words.map((word) => ({
          projectId: newProject.id,
          english: word.english,
          japanese: word.japanese,
          translations: snapshotTranslationsToWordTranslations(word.translations),
          distractors: word.distractors ?? [],
          pronunciation: word.pronunciation,
          exampleSentence: word.exampleSentence,
          exampleSentenceJa: word.exampleSentenceJa,
          partOfSpeechTags: word.partOfSpeechTags,
          vocabularyType: word.vocabularyType,
        })),
      );

      setImportedProjectId(newProject.id);
      invalidateHomeCache();
      showToast({
        message: importTitle === state.wordbook.title
          ? `${state.words.length}語を追加しました`
          : `「${importTitle}」として${state.words.length}語を追加しました`,
        type: 'success',
      });
    } catch (error) {
      console.error('Failed to import official wordbook:', error);
      showToast({ message: '取り込みに失敗しました', type: 'error' });
    } finally {
      setImporting(false);
    }
  }, [importing, router, showToast, slug, state, subscriptionStatus, user, wasPro]);

  return (
    <div className="relative mx-auto min-h-screen w-full max-w-[560px] bg-[var(--color-background)] px-[18px] pb-12 pt-3 font-[var(--font-body)] lg:max-w-[720px] lg:px-8 lg:pt-10">
      <div className="flex items-center gap-2 pb-3 pt-1">
        <Link
          href="/shared?tab=official"
          className="flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          aria-label="公式単語帳の一覧へ"
        >
          <Icon name="chevron_left" size={16} />
        </Link>
        <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">OFFICIAL WORDBOOK</div>
      </div>

      {state.kind === 'loading' && (
        <div className="h-[260px] animate-pulse rounded-xl border-2 border-[var(--color-border)] bg-white" />
      )}

      {state.kind === 'not-found' && (
        <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-5">
          <p className="m-0 text-[13px] leading-[1.8] text-[var(--solid-ink)]">
            公式単語帳が見つかりません。公開が終了した可能性があります。
          </p>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-5 text-center">
          <p className="m-0 text-[13px] text-[var(--solid-ink)]">{state.message}</p>
        </div>
      )}

      {state.kind === 'ready' && (
        <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-5">
          <div className="flex items-start gap-3">
            <span
              className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[12px] border-2 border-[var(--solid-ink)] bg-cover bg-center text-[var(--solid-ink)]"
              style={{
                backgroundColor: '#faf7f1',
                backgroundImage: state.wordbook.iconImage ? `url(${state.wordbook.iconImage})` : undefined,
              }}
            >
              {!state.wordbook.iconImage && <Icon name="verified" size={22} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-display text-lg font-extrabold leading-[1.3] text-[var(--solid-ink)]">
                {state.wordbook.title}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] tracking-[0.04em] text-[var(--color-muted)]">
                <span className="rounded-[3px] border border-[var(--solid-ink)] bg-white px-1.5 py-[1px] font-bold text-[var(--solid-ink)]">
                  MERKEN公式
                </span>
                {state.wordbook.eikenLabel && <span>{state.wordbook.eikenLabel}</span>}
                <span>全{state.totalWordCount}語</span>
              </div>
            </div>
          </div>

          {state.wordbook.description && (
            <p className="m-0 mt-3 text-[12px] leading-[1.8] text-[var(--solid-ink)]">
              {state.wordbook.description}
            </p>
          )}

          {state.words.length > 0 && (
            <div className="mt-4">
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
                {state.previewOnly ? `単語プレビュー · ${state.words.length}語まで表示` : `単語 · 全${state.totalWordCount}語`}
              </div>
              <ul className="m-0 mt-2 flex max-h-[420px] list-none flex-col gap-2 overflow-y-auto p-0">
                {state.words.map((word, index) => (
                  <li key={`${word.english}-${index}`} className="rounded-lg bg-[#faf7f1] p-3">
                    <div className="text-[13px] font-bold text-[var(--solid-ink)]">{word.english}</div>
                    {word.japanese && (
                      <div className="mt-0.5 text-[12px] leading-[1.7] text-[var(--color-muted)]">{word.japanese}</div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {state.previewOnly ? (
            <div className="mt-5">
              <p className="m-0 text-[12px] leading-[1.8] text-[var(--solid-ink)]">
                残り{Math.max(0, state.totalWordCount - state.words.length)}語はログインすると見られます。取り込みは無料プランでもできます。
              </p>
              <Link
                href={`/login?redirect=${encodeURIComponent(`/official/${slug}`)}`}
                className="mt-3 flex h-11 items-center justify-center rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] font-bold text-white"
              >
                ログインしてすべて見る
              </Link>
            </div>
          ) : importedProjectId ? (
            <Link
              href={`/project/${importedProjectId}`}
              className="mt-5 flex h-12 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--solid-ink)] bg-white font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              <Icon name="check_circle" size={18} />
              追加済み — 単語帳を開く
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={importing || state.words.length === 0}
              className="mt-5 h-12 w-full rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
            >
              {importing ? '追加中...' : `${state.totalWordCount}語を自分の単語帳に追加`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
