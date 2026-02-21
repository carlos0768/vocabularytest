'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { StudyModeCard, WordList } from '@/components/home';
import type { Project, Word } from '@/types';

interface StudyTabProps {
  project: Project;
  words: Word[];
  wordsLoaded: boolean;
  isPro: boolean;
  onEditWord: (wordId: string, english: string, japanese: string) => Promise<void>;
  onDeleteWord: (wordId: string) => void;
  onToggleFavorite: (wordId: string) => Promise<void>;
  onAddClick: () => void;
  onScanClick: () => void;
}

export function StudyTab({
  project,
  words,
  wordsLoaded,
  isPro,
  onEditWord,
  onDeleteWord,
  onToggleFavorite,
  onAddClick,
  onScanClick,
}: StudyTabProps) {
  const [editingWordId, setEditingWordId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const total = words.length;
    const mastered = words.filter((w) => w.status === 'mastered').length;
    const review = words.filter((w) => w.status === 'review').length;
    const newWords = words.filter((w) => w.status === 'new').length;
    return { total, mastered, review, newWords };
  }, [words]);

  const returnPath = encodeURIComponent(`/project/${project.id}`);

  const recommendedMode = useMemo(() => {
    if (words.length === 0) return null;

    if (stats.newWords > 0) {
      return {
        title: '未学習の単語を覚える',
        description: 'まずは4択クイズで意味を確認しましょう',
        icon: 'quiz',
        href: `/quiz/${project.id}?from=${returnPath}`,
        buttonText: 'クイズを始める',
        iconBg: 'bg-sky-100',
        iconColor: 'text-sky-600',
        bgClasses: 'bg-[var(--color-primary)] text-white shadow-glow hover:opacity-90',
        btnClasses: 'bg-white/20 text-white hover:bg-white/30',
      };
    }
    if (stats.review > 0) {
      return {
        title: '復習して記憶に定着させる',
        description: isPro ? 'スワイプ式のカードで効率よく復習しましょう' : 'クイズで繰り返し復習しましょう',
        icon: isPro ? 'style' : 'quiz',
        href: isPro ? `/flashcard/${project.id}?from=${returnPath}` : `/quiz/${project.id}?from=${returnPath}`,
        buttonText: isPro ? 'カード学習を始める' : 'クイズを始める',
        iconBg: isPro ? 'bg-indigo-100' : 'bg-sky-100',
        iconColor: isPro ? 'text-indigo-600' : 'text-sky-600',
        bgClasses: isPro ? 'bg-[#3B82F6] text-white shadow-glow hover:opacity-90' : 'bg-[var(--color-primary)] text-white shadow-glow hover:opacity-90',
        btnClasses: 'bg-white/20 text-white hover:bg-white/30',
      };
    }
    return {
      title: '実践力を試す',
      description: isPro ? '例文クイズで実際の使われ方を確認しましょう' : 'クイズで記憶を確実にしましょう',
      icon: isPro ? 'auto_awesome' : 'quiz',
      href: isPro ? `/sentence-quiz/${project.id}?from=${returnPath}` : `/quiz/${project.id}?from=${returnPath}`,
      buttonText: isPro ? '例文クイズを始める' : 'クイズを始める',
      iconBg: isPro ? 'bg-amber-100' : 'bg-sky-100',
      iconColor: isPro ? 'text-amber-600' : 'text-sky-600',
      bgClasses: isPro ? 'bg-[#60A5FA] text-white shadow-glow hover:opacity-90' : 'bg-[var(--color-primary)] text-white shadow-glow hover:opacity-90',
      btnClasses: 'bg-white/20 text-white hover:bg-white/30',
    };
  }, [stats.newWords, stats.review, words.length, project.id, returnPath, isPro]);

  return (
    <>
      {/* 学習の進捗 & 次のステップ */}
      <section>
        {!wordsLoaded ? (
          <div className="card p-6 border-2 border-[var(--color-border)] border-b-4">
            <div className="flex items-center gap-3 text-[var(--color-muted)]">
              <Icon name="progress_activity" size={18} className="animate-spin" />
              <span className="text-sm font-medium">単語データを読み込み中...</span>
            </div>
          </div>
        ) : recommendedMode ? (
          <div className="card overflow-hidden border-2 border-[var(--color-border)] border-b-4">
            <div className={`p-6 lg:p-8 relative overflow-hidden ${recommendedMode.bgClasses}`}>
              <div className="relative z-10">
                <div className="flex items-center gap-4 mb-6">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${recommendedMode.iconBg}`}>
                    <Icon name={recommendedMode.icon} size={28} className={recommendedMode.iconColor} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl lg:text-2xl font-bold mb-1 tracking-tight">{recommendedMode.title}</h2>
                    <p className="text-sm font-medium opacity-90">{recommendedMode.description}</p>
                  </div>
                </div>
                <Link
                  href={recommendedMode.href}
                  className={`block w-full py-4 rounded-xl text-center font-bold text-base transition-transform active:scale-[0.98] ${recommendedMode.btnClasses}`}
                >
                  {recommendedMode.buttonText}
                </Link>
              </div>
              <Icon
                name={recommendedMode.icon}
                size={160}
                className="absolute -right-6 -bottom-6 opacity-[0.08] transform rotate-12 pointer-events-none"
              />
            </div>
            <div className="p-4 bg-[var(--color-surface)] border-t border-[var(--color-border)]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-[var(--color-muted)]">現在の進捗</h3>
                <span className="text-xs font-bold text-[var(--color-foreground)]">
                  {stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0}% 習得
                </span>
              </div>
              <div className="w-full h-2 bg-[var(--color-border-light)] rounded-full overflow-hidden flex mb-2">
                <div className="bg-[var(--color-success)] transition-all duration-500" style={{ width: `${stats.total > 0 ? (stats.mastered / stats.total) * 100 : 0}%` }} />
                <div className="bg-[var(--color-primary)] transition-all duration-500" style={{ width: `${stats.total > 0 ? (stats.review / stats.total) * 100 : 0}%` }} />
              </div>
              <div className="flex justify-between items-center text-[10px] font-semibold text-[var(--color-muted)] px-1">
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />習得 {stats.mastered}</span>
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />復習中 {stats.review}</span>
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[var(--color-border-light)]" />未学習 {stats.newWords}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 card border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt,var(--color-surface))]">
            <div className="w-16 h-16 mx-auto bg-[var(--color-surface)] rounded-full flex items-center justify-center border-2 border-[var(--color-border)] mb-4">
              <Icon name="auto_awesome" size={32} className="text-[var(--color-primary)]" />
            </div>
            <h3 className="text-lg font-bold text-[var(--color-foreground)] mb-2">単語を追加して始めましょう</h3>
            <p className="text-sm text-[var(--color-muted)] mb-8 max-w-[240px] mx-auto">
              カメラでノートをスキャンするか、手動で単語を追加できます
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center px-6">
              <button onClick={onScanClick} className="flex-1 px-5 py-3.5 rounded-xl bg-[var(--color-primary)] text-white font-bold shadow-glow hover:opacity-90 flex items-center justify-center gap-2 active:scale-95 transition-transform">
                <Icon name="document_scanner" size={20} /> カメラでスキャン
              </button>
              <button onClick={onAddClick} className="flex-1 px-5 py-3.5 rounded-xl bg-[var(--color-surface)] border-2 border-[var(--color-border)] text-[var(--color-foreground)] font-bold hover:bg-[var(--color-surface-hover)] flex items-center justify-center gap-2 active:scale-95 transition-transform">
                <Icon name="edit" size={20} /> 手動で追加
              </button>
            </div>
          </div>
        )}
      </section>

      {/* その他の学習モード */}
      {words.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-bold text-[var(--color-foreground)] px-1">その他の学習モード</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StudyModeCard
              title="クイズ"
              description="4択で確認"
              icon="quiz"
              href={`/quiz/${project.id}?from=${returnPath}`}
              variant="primary"
              disabled={words.length === 0}
              layout="vertical"
              styleMode="home"
            />
            <StudyModeCard
              title="クイズ２"
              description="思い出して評価"
              icon="psychology"
              href={isPro ? `/quiz2/${project.id}?from=${returnPath}` : '/subscription'}
              variant="green"
              disabled={words.length === 0}
              badge={!isPro ? 'Pro' : undefined}
              layout="vertical"
              styleMode="home"
            />
            <StudyModeCard
              title="カード"
              description="スワイプ復習"
              icon="style"
              href={isPro ? `/flashcard/${project.id}?from=${returnPath}` : '/subscription'}
              variant="blue"
              disabled={words.length === 0}
              badge={!isPro ? 'Pro' : undefined}
              layout="vertical"
              styleMode="home"
            />
            <StudyModeCard
              title="例文"
              description="例文で定着"
              icon="auto_awesome"
              href={isPro ? `/sentence-quiz/${project.id}?from=${returnPath}` : '/subscription'}
              variant="orange"
              disabled={words.length === 0}
              badge={!isPro ? 'Pro' : undefined}
              layout="vertical"
              styleMode="home"
            />
          </div>
        </section>
      )}

      {/* 単語リスト */}
      <section className="space-y-2.5 lg:space-y-3 pt-2.5 lg:pt-3 border-t border-[var(--color-border-light)]">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-base font-bold text-[var(--color-foreground)]">
            単語一覧 <span className="text-sm font-medium text-[var(--color-muted)] ml-2">{words.length}語</span>
          </h2>
        </div>

        {wordsLoaded ? (
          <WordList
            words={words}
            editingWordId={editingWordId}
            onEditStart={(wordId) => setEditingWordId(wordId)}
            onEditCancel={() => setEditingWordId(null)}
            onSave={(wordId, english, japanese) => {
              onEditWord(wordId, english, japanese);
              setEditingWordId(null);
            }}
            onDelete={(wordId) => onDeleteWord(wordId)}
            onToggleFavorite={(wordId) => onToggleFavorite(wordId)}
            onAddClick={onAddClick}
            onScanClick={onScanClick}
            listMaxHeightClassName="max-h-[48vh] lg:max-h-[56vh]"
          />
        ) : (
          <div className="card p-4 text-sm text-[var(--color-muted)] flex items-center gap-2">
            <Icon name="progress_activity" size={16} className="animate-spin" />
            単語一覧を読み込み中...
          </div>
        )}
      </section>
    </>
  );
}
