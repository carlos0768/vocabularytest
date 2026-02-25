'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AppShell, Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import { getGuestUserId } from '@/lib/utils';
import type { Project, SubscriptionStatus, Word } from '@/types';

export default function WordInsightsPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { user, subscription, isPro, loading: authLoading } = useAuth();

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const [project, setProject] = useState<Project | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    const load = async () => {
      try {
        const userId = user ? user.id : getGuestUserId();
        let proj = await repository.getProject(projectId);

        if (!proj && user) {
          proj = await remoteRepository.getProject(projectId);
        }

        if (!proj || proj.userId !== userId) {
          router.push('/');
          return;
        }

        setProject(proj);

        let wordList = await repository.getWords(projectId);
        if (wordList.length === 0 && user) {
          try {
            wordList = await remoteRepository.getWords(projectId);
          } catch (error) {
            console.error('Remote fallback failed:', error);
          }
        }
        setWords(wordList);
      } catch (error) {
        console.error('Failed to load insights page:', error);
        router.push('/');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [authLoading, projectId, repository, router, user]);

  if (loading || authLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Icon name="progress_activity" size={24} className="animate-spin text-[var(--color-muted)]" />
        </div>
      </AppShell>
    );
  }

  if (!project) {
    return (
      <AppShell>
        <div className="max-w-3xl mx-auto px-4 py-8">
          <p className="text-sm text-[var(--color-muted)]">単語帳が見つかりません。</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <Link
            href={`/project/${projectId}`}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
          >
            <Icon name="arrow_back" size={18} />
            単語帳へ戻る
          </Link>
        </div>

        <div>
          <h1 className="text-xl font-bold text-[var(--color-foreground)]">単語解説</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            関連語・語形と語法パターンを一覧で確認できます。
          </p>
        </div>

        {!isPro ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-sm font-semibold text-[var(--color-foreground)] flex items-center gap-1.5">
              <Icon name="lock" size={14} />
              単語解説はPro機能です
            </p>
            <p className="text-xs text-[var(--color-muted)] mt-1">関連語・語法の表示にはPro登録が必要です。</p>
            <Link
              href="/subscription"
              className="inline-flex mt-3 px-3 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-semibold"
            >
              Proを確認
            </Link>
          </div>
        ) : words.length === 0 ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-sm text-[var(--color-muted)]">単語がありません。</p>
          </div>
        ) : (
          <div className="space-y-3">
            {words.map((word) => {
              const hasInsights = Boolean(
                (word.partOfSpeechTags?.length ?? 0) > 0
                || (word.relatedWords?.length ?? 0) > 0
                || (word.usagePatterns?.length ?? 0) > 0
              );

              return (
                <div
                  key={word.id}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3"
                >
                  <div>
                    <p className="text-lg font-bold text-[var(--color-foreground)]">{word.english}</p>
                    <p className="text-sm text-[var(--color-muted)]">{word.japanese}</p>
                  </div>

                  {!hasInsights ? (
                    <p className="text-xs text-[var(--color-muted)]">解説を生成中...</p>
                  ) : (
                    <div className="space-y-2.5">
                      {(word.partOfSpeechTags?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-[var(--color-muted)] mb-1">品詞</p>
                          <div className="flex flex-wrap gap-1.5">
                            {word.partOfSpeechTags?.map((tag) => (
                              <span
                                key={`${word.id}-${tag}`}
                                className="px-2 py-0.5 rounded-full text-xs border border-[var(--color-border)] text-[var(--color-foreground)]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {(word.relatedWords?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-[var(--color-muted)] mb-1">関連語・語形</p>
                          <div className="space-y-1">
                            {word.relatedWords?.slice(0, 8).map((item, index) => (
                              <p key={`${word.id}-related-${index}`} className="text-sm text-[var(--color-foreground)]">
                                {item.term}
                                <span className="text-[var(--color-muted)] ml-1">({item.relation})</span>
                                {item.noteJa ? <span className="text-[var(--color-muted)] ml-1">- {item.noteJa}</span> : null}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}

                      {(word.usagePatterns?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-[var(--color-muted)] mb-1">使い方（語法）</p>
                          <div className="space-y-2">
                            {word.usagePatterns?.slice(0, 6).map((pattern, index) => (
                              <div
                                key={`${word.id}-usage-${index}`}
                                className="rounded-lg border border-[var(--color-border-light)] bg-[var(--color-background)] px-3 py-2"
                              >
                                <p className="text-sm font-semibold text-[var(--color-foreground)]">{pattern.pattern}</p>
                                <p className="text-xs text-[var(--color-muted)]">{pattern.meaningJa}</p>
                                {pattern.example ? (
                                  <p className="text-xs text-[var(--color-foreground)] mt-1">{pattern.example}</p>
                                ) : null}
                                {pattern.exampleJa ? (
                                  <p className="text-xs text-[var(--color-muted)]">{pattern.exampleJa}</p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
