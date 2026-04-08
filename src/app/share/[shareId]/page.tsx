'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { remoteRepository } from '@/lib/db/remote-repository';
import { getRepository } from '@/lib/db';
import { createBrowserClient } from '@/lib/supabase';
import { getProjectColor } from '@/components/project/ProjectCard';
import { invalidateHomeCache } from '@/lib/home-cache';
import type { Project, Word } from '@/types';

export default function SharedProjectPage() {
  const router = useRouter();
  const params = useParams();
  const shareId = params.shareId as string;
  const { user, subscription, isPro, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [ownerUsername, setOwnerUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [wordsLoaded, setWordsLoaded] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importedProjectId, setImportedProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showImportSheet, setShowImportSheet] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set());

  // Like state
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likeLoading, setLikeLoading] = useState(true);

  // Search / Filter / Sort
  const [wordSearchText, setWordSearchText] = useState('');
  const [wordShowSearch, setWordShowSearch] = useState(false);
  const [wordSortOrder, setWordSortOrder] = useState<'createdAsc' | 'alphabetical' | 'statusAsc'>('createdAsc');
  const [wordFilterActiveness, setWordFilterActiveness] = useState<'all' | 'active' | 'passive'>('all');
  const [wordFilterPos, setWordFilterPos] = useState<string | null>(null);
  const [wordShowFilterSheet, setWordShowFilterSheet] = useState(false);

  const subscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';

  useEffect(() => {
    // Start fetching immediately without waiting for auth.
    // Data and auth resolution happen in parallel.
    // The Pro gate check in render handles non-Pro users.
    const loadData = async () => {
      try {
        const projectData = await remoteRepository.getProjectByShareId(shareId);

        if (!projectData) {
          setError('この単語帳は存在しないか、共有が解除されています');
          return;
        }

        // Fetch words and owner profile in parallel (was sequential before)
        const supabase = createBrowserClient();
        const [wordsData, profileResult] = await Promise.all([
          remoteRepository.getWordsForShareView(projectData.id),
          Promise.resolve(
            supabase
              .from('profiles')
              .select('username')
              .eq('user_id', projectData.userId)
              .maybeSingle()
          ).catch(() => ({ data: null })),
        ]);

        setProject(projectData);
        setWords(wordsData);
        setWordsLoaded(true);
        if (profileResult.data?.username) {
          setOwnerUsername(profileResult.data.username as string);
        }
      } catch (err) {
        console.error('Failed to load shared project:', err);
        setError('単語帳の読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [shareId]);

  const handleImport = async (targetWords: Word[]) => {
    if (!user || !project || targetWords.length === 0) return;

    setImporting(true);
    setShowImportSheet(false);
    try {
      const repo = getRepository(subscriptionStatus, wasPro);

      const newProject = await repo.createProject({
        title: project.title,
        userId: user.id,
        importedFromShareId: shareId,
      });

      await repo.createWords(
        targetWords.map((w) => ({
          projectId: newProject.id,
          english: w.english,
          japanese: w.japanese,
          distractors: w.distractors ?? [],
          exampleSentence: w.exampleSentence ?? undefined,
          exampleSentenceJa: w.exampleSentenceJa ?? undefined,
          pronunciation: w.pronunciation ?? undefined,
          partOfSpeechTags: w.partOfSpeechTags ?? undefined,
          vocabularyType: w.vocabularyType ?? undefined,
        })),
      );

      setImportedProjectId(newProject.id);
      setSelectMode(false);
      setSelectedWordIds(new Set());
      invalidateHomeCache();
      showToast({ message: `${targetWords.length}語を追加しました！`, type: 'success' });
    } catch (err) {
      console.error('Failed to import project:', err);
      showToast({ message: 'インポートに失敗しました', type: 'error' });
    } finally {
      setImporting(false);
    }
  };

  const wordFilterActive = wordFilterActiveness !== 'all' || wordFilterPos !== null;

  const filteredWords = useMemo(() => {
    let result = words;
    if (wordSearchText) {
      const q = wordSearchText.toLowerCase();
      result = result.filter(
        (w) => w.english.toLowerCase().includes(q) || w.japanese.toLowerCase().includes(q),
      );
    }
    if (wordFilterActiveness === 'active') {
      result = result.filter((w) => w.vocabularyType === 'active');
    } else if (wordFilterActiveness === 'passive') {
      result = result.filter((w) => w.vocabularyType === 'passive');
    }
    if (wordFilterPos) {
      result = result.filter((w) =>
        w.partOfSpeechTags?.some((t) => t.toLowerCase().includes(wordFilterPos.toLowerCase())),
      );
    }
    if (wordSortOrder === 'alphabetical') {
      result = [...result].sort((a, b) => a.english.localeCompare(b.english, undefined, { sensitivity: 'base' }));
    } else if (wordSortOrder === 'statusAsc') {
      const statusOrder: Record<string, number> = { new: 0, review: 1, mastered: 2 };
      result = [...result].sort((a, b) => (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0));
    }
    return result;
  }, [words, wordSearchText, wordFilterActiveness, wordFilterPos, wordSortOrder]);

  const availablePartsOfSpeech = useMemo(() => {
    const all = words.flatMap((w) => w.partOfSpeechTags ?? []);
    return [...new Set(all.map((t) => t.trim()).filter(Boolean))].sort();
  }, [words]);

  // Header color — computed before early returns so useEffect hook order is stable
  const HEADER_DARKEN: Record<string, string> = {
    '#ef4444': '#b91c1c',
    '#16a34a': '#166534',
    '#1e3a8a': '#1e40af',
    '#f97316': '#c2410c',
    '#9333ea': '#7e22ce',
    '#0d9488': '#0f766e',
  };
  const headerFrom = getProjectColor(project?.title ?? '');
  const headerTo = HEADER_DARKEN[headerFrom] ?? headerFrom;

  // Set html/body background to header color so iOS PWA safe-area matches header
  useEffect(() => {
    if (!project) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.backgroundColor;
    const prevBody = body.style.backgroundColor;
    html.style.backgroundColor = headerFrom;
    body.style.backgroundColor = headerFrom;
    return () => {
      html.style.backgroundColor = prevHtml;
      body.style.backgroundColor = prevBody;
    };
  }, [headerFrom, project]);

  // Fetch like status when project loads
  useEffect(() => {
    if (!project || !user) { setLikeLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/shared-projects/${project.id}/like`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setLiked(data.liked);
          setLikeCount(data.likeCount ?? 0);
        }
      } catch { /* silent */ }
      finally { if (!cancelled) setLikeLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [project, user]);

  const handleToggleLike = async () => {
    if (!user || !project) return;
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((prev) => prev + (nextLiked ? 1 : -1));
    try {
      const res = await fetch(`/api/shared-projects/${project.id}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liked: nextLiked }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLikeCount(data.likeCount);
    } catch {
      setLiked(!nextLiked);
      setLikeCount((prev) => prev + (nextLiked ? -1 : 1));
      showToast({ message: 'いいねに失敗しました', type: 'error' });
    }
  };

  const posLabel = (tags?: string[]) => {
    if (!tags || tags.length === 0) return null;
    const map: Record<string, string> = { noun: '名', verb: '動', adjective: '形', adverb: '副', phrase: '句', idiom: '熟', phrasal_verb: '句' };
    return map[tags[0]] || tags[0].slice(0, 1);
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--color-muted)]">
        <Icon name="progress_activity" size={20} className="animate-spin" />
        <span className="ml-2">読み込み中...</span>
      </div>
    );
  }

  if (!authLoading && !isPro) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-20 h-20 bg-[var(--color-primary)] rounded-full flex items-center justify-center mb-6">
          <Icon name="workspace_premium" size={40} className="text-white" />
        </div>
        <h1 className="text-xl font-bold text-[var(--color-foreground)] mb-2">Pro機能です</h1>
        <p className="text-[var(--color-muted)] text-center mb-6">
          共有された単語帳を見るには<br />Proプランへのアップグレードが必要です
        </p>
        <div className="flex flex-col gap-3">
          <Link href="/subscription" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[var(--color-foreground)] text-white font-semibold">
            <Icon name="workspace_premium" size={16} />
            Proにアップグレード
          </Link>
          <Link href="/" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-[var(--color-border)] text-[var(--color-muted)] font-semibold">
            <Icon name="arrow_back" size={16} />
            ホームに戻る
          </Link>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
        <h1 className="text-xl font-bold text-[var(--color-foreground)]">単語帳が見つかりません</h1>
        <p className="text-sm text-[var(--color-muted)] mt-2">{error || '一覧から選び直してください。'}</p>
        <Link href="/shared" className="mt-4 px-4 py-2 rounded-full bg-[var(--color-foreground)] text-white font-semibold">
          共有一覧へ戻る
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-[var(--color-background)] pb-28 lg:pb-8">
        {/* Dynamic color header */}
        <div
          className="project-detail-header-safe-top z-[50] sticky top-0"
          style={{ backgroundColor: headerFrom, background: `linear-gradient(135deg, ${headerFrom}, ${headerTo})` }}
        >
          <div className="max-w-lg lg:max-w-xl mx-auto px-5 pt-4 pb-5">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => router.back()} className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center" aria-label="戻る">
                <Icon name="chevron_left" size={24} className="text-white" />
              </button>
              <div className="flex-1 text-center mx-3">
                <p className="text-white font-bold text-sm truncate">{project.title}</p>
                <p className="text-white/70 text-xs">
                  {ownerUsername ? `${ownerUsername}さんの単語帳` : '共有された単語帳'} · {words.length}語
                </p>
              </div>
              <button
                onClick={handleToggleLike}
                disabled={!user || likeLoading}
                className="w-10 h-10 rounded-full bg-white/20 flex flex-col items-center justify-center disabled:opacity-50 transition-transform active:scale-90"
                aria-label={liked ? 'いいねを取り消す' : 'いいね'}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: liked ? "'FILL' 1" : "'FILL' 0", color: liked ? '#f87171' : 'white' }}>
                  favorite
                </span>
                {likeCount > 0 && <span className="text-[9px] font-bold text-white/90 -mt-0.5 leading-none">{likeCount}</span>}
              </button>
            </div>
          </div>
        </div>

        <main className="max-w-lg lg:max-w-2xl mx-auto px-5 pt-4 lg:px-6 lg:-mt-2 space-y-5">
          {/* Word list table */}
          <section>
            {/* Header row: title + toolbar */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-[var(--color-foreground)]">単語一覧 <span className="text-sm font-normal text-[var(--color-muted)]">{words.length}</span></h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => { setWordShowSearch((v) => { if (v) setWordSearchText(''); return !v; }); }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${
                    wordShowSearch || wordSearchText
                      ? 'bg-[var(--color-accent)]/12 border-[var(--color-accent)]/35 text-[var(--color-accent)]'
                      : 'bg-[var(--color-surface)] border-[var(--color-border-light)] text-[var(--color-muted)]'
                  }`}
                  aria-label="検索"
                >
                  <Icon name={wordShowSearch ? 'close' : 'search'} size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setWordShowFilterSheet((v) => !v)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${
                    wordFilterActive
                      ? 'bg-[var(--color-accent)]/12 border-[var(--color-accent)]/35 text-[var(--color-accent)]'
                      : 'bg-[var(--color-surface)] border-[var(--color-border-light)] text-[var(--color-muted)]'
                  }`}
                  aria-label="フィルタ"
                >
                  <Icon name="filter_list" size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setWordSortOrder((v) => v === 'createdAsc' ? 'alphabetical' : v === 'alphabetical' ? 'statusAsc' : 'createdAsc')}
                  className="w-9 h-9 rounded-full flex items-center justify-center border bg-[var(--color-surface)] border-[var(--color-border-light)] text-[var(--color-muted)] transition-colors"
                  aria-label={`ソート: ${wordSortOrder === 'createdAsc' ? '追加順' : wordSortOrder === 'alphabetical' ? 'アルファベット' : '未習得順'}`}
                  title={wordSortOrder === 'createdAsc' ? '追加順' : wordSortOrder === 'alphabetical' ? 'アルファベット' : '未習得順'}
                >
                  <Icon name="swap_vert" size={18} />
                </button>
                {(wordFilterActive || wordSearchText) && (
                  <span className="text-xs font-medium tabular-nums text-[var(--color-accent)]">
                    {filteredWords.length}/{words.length}
                  </span>
                )}
              </div>
            </div>

            {/* Search bar */}
            {wordShowSearch && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border-light)]">
                <Icon name="search" size={16} className="text-[var(--color-muted)] shrink-0" />
                <input
                  type="text"
                  value={wordSearchText}
                  onChange={(e) => setWordSearchText(e.target.value)}
                  placeholder="単語を検索..."
                  className="flex-1 bg-transparent text-sm outline-none text-[var(--color-foreground)] placeholder:text-[var(--color-muted)]"
                  autoFocus
                />
                {wordSearchText && (
                  <button type="button" onClick={() => setWordSearchText('')} className="text-[var(--color-muted)]">
                    <Icon name="cancel" size={16} />
                  </button>
                )}
              </div>
            )}

            {/* Filter panel */}
            {wordShowFilterSheet && (
              <div className="mb-3 p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border-light)] space-y-4">
                <div>
                  <p className="text-xs font-bold text-[var(--color-muted)] mb-2">アクティブ / パッシブ</p>
                  <div className="flex gap-2">
                    {([['all', 'すべて'], ['active', 'アクティブ'], ['passive', 'パッシブ']] as const).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setWordFilterActiveness(val)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                          wordFilterActiveness === val
                            ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                            : 'bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-border-light)]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {availablePartsOfSpeech.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-[var(--color-muted)] mb-2">品詞</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setWordFilterPos(null)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                          !wordFilterPos
                            ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                            : 'bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-border-light)]'
                        }`}
                      >
                        すべて
                      </button>
                      {availablePartsOfSpeech.map((pos) => {
                        const posMap: Record<string, string> = { noun: '名詞', verb: '動詞', adjective: '形容詞', adverb: '副詞', preposition: '前置詞', conjunction: '接続詞', pronoun: '代名詞' };
                        return (
                          <button
                            key={pos}
                            type="button"
                            onClick={() => setWordFilterPos(pos)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                              wordFilterPos === pos
                                ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                                : 'bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-border-light)]'
                            }`}
                          >
                            {posMap[pos.toLowerCase()] || pos}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!wordsLoaded ? (
              <div className="flex items-center gap-3 text-[var(--color-muted)] py-8 justify-center">
                <Icon name="progress_activity" size={18} className="animate-spin" />
                <span className="text-sm">読み込み中...</span>
              </div>
            ) : filteredWords.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-[var(--color-muted)]">{(wordFilterActive || wordSearchText) ? '一致する単語がありません' : '単語がありません'}</p>
              </div>
            ) : (
              <div className="overflow-hidden">
                <table className="w-full border-collapse table-fixed">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-muted)]">
                      {selectMode && <th className="w-8 px-1 py-2 text-center font-medium" />}
                      <th className="px-2 py-2 text-left font-medium">単語</th>
                      <th className="w-8 px-1 py-2 text-center font-medium">A/P</th>
                      <th className="w-10 px-1 py-2 text-center font-medium">品詞</th>
                      <th className="px-2 py-2 text-left font-medium whitespace-nowrap">訳</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-light)]">
                    {filteredWords.map((word) => (
                      <tr
                        key={word.id}
                        className={selectMode ? 'cursor-pointer' : ''}
                        onClick={selectMode ? () => setSelectedWordIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(word.id)) next.delete(word.id); else next.add(word.id);
                          return next;
                        }) : undefined}
                      >
                        {selectMode && (
                          <td className="w-8 px-1 py-2.5 text-center">
                            <span className={`inline-flex items-center justify-center h-5 w-5 rounded border-2 text-xs ${
                              selectedWordIds.has(word.id)
                                ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white'
                                : 'border-[var(--color-border)] bg-transparent'
                            }`}>
                              {selectedWordIds.has(word.id) && <Icon name="check" size={14} />}
                            </span>
                          </td>
                        )}
                        <td className="px-2 py-2.5 max-w-0">
                          <span className="inline-flex items-center gap-1 min-w-0">
                            <span className="text-sm font-medium text-[var(--color-foreground)] truncate">{word.english}</span>
                          </span>
                        </td>
                        <td className="w-8 px-1 py-2.5 text-center">
                          <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-black leading-none border ${
                            word.vocabularyType === 'active'
                              ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                              : word.vocabularyType === 'passive'
                                ? 'bg-[var(--color-muted)]/70 text-white border-[var(--color-muted)]/70'
                                : 'bg-transparent text-[var(--color-muted)] border-[var(--color-border)]'
                          }`}>
                            {word.vocabularyType === 'active' ? 'A' : word.vocabularyType === 'passive' ? 'P' : '—'}
                          </span>
                        </td>
                        <td className="w-10 px-1 py-2.5 text-center text-xs font-bold text-[var(--color-muted)]">
                          {posLabel(word.partOfSpeechTags) || '—'}
                        </td>
                        <td className="px-2 py-2.5 text-xs text-[var(--color-muted)] truncate max-w-0">
                          {word.japanese}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>

        {/* Bottom action bar */}
        {words.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-[var(--color-surface)] border-t border-[var(--color-border)] px-5 py-3 z-40 lg:ml-[280px]" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            <div className="max-w-lg mx-auto">
              {importedProjectId ? (
                <button
                  onClick={() => router.push(`/project/${importedProjectId}`)}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[var(--color-success)] text-white font-semibold text-sm"
                >
                  <Icon name="check_circle" size={18} />
                  追加済み — 単語帳を開く
                </button>
              ) : selectMode ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => { setSelectMode(false); setSelectedWordIds(new Set()); }}
                    className="flex-none px-4 py-3.5 rounded-xl border border-[var(--color-border)] text-sm font-semibold text-[var(--color-muted)]"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={() => void handleImport(words.filter((w) => selectedWordIds.has(w.id)))}
                    disabled={importing || selectedWordIds.size === 0}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[var(--color-foreground)] text-white font-semibold text-sm disabled:opacity-50"
                  >
                    {importing ? (
                      <><Icon name="progress_activity" size={18} className="animate-spin" />追加中...</>
                    ) : (
                      <><Icon name="download" size={18} />選択した {selectedWordIds.size}語を追加</>
                    )}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowImportSheet(true)}
                  disabled={importing}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[var(--color-foreground)] text-white font-semibold text-sm disabled:opacity-50"
                >
                  {importing ? (
                    <><Icon name="progress_activity" size={18} className="animate-spin" />追加中...</>
                  ) : (
                    <><Icon name="download" size={18} />単語帳として追加</>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Import sheet overlay */}
        {showImportSheet && (
          <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowImportSheet(false)}>
            <div className="absolute inset-0 bg-black/30" />
            <div
              className="relative w-full max-w-lg bg-[var(--color-surface)] rounded-t-2xl px-5 pt-5 pb-8 space-y-2"
              style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 rounded-full bg-[var(--color-border)] mx-auto mb-3" />
              <button
                onClick={() => { setShowImportSheet(false); void handleImport(words); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-[var(--color-background)] transition-colors"
              >
                <Icon name="download" size={20} className="text-[var(--color-foreground)]" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-[var(--color-foreground)]">すべて追加</p>
                  <p className="text-xs text-[var(--color-muted)]">{words.length}語</p>
                </div>
              </button>
              {(wordFilterActive || wordSearchText) && filteredWords.length !== words.length && (
                <button
                  onClick={() => { setShowImportSheet(false); void handleImport(filteredWords); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-[var(--color-background)] transition-colors"
                >
                  <Icon name="filter_list" size={20} className="text-[var(--color-accent)]" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-[var(--color-foreground)]">フィルタ結果を追加</p>
                    <p className="text-xs text-[var(--color-muted)]">{filteredWords.length}語</p>
                  </div>
                </button>
              )}
              <button
                onClick={() => { setShowImportSheet(false); setSelectMode(true); setSelectedWordIds(new Set()); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-[var(--color-background)] transition-colors"
              >
                <Icon name="checklist" size={20} className="text-[var(--color-muted)]" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-[var(--color-foreground)]">選択して追加</p>
                  <p className="text-xs text-[var(--color-muted)]">追加する単語を選んでください</p>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
