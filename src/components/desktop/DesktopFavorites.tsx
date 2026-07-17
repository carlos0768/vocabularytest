'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { DesktopButton, DesktopSearchBox, DesktopTopbar } from '@/components/desktop/DesktopChrome';
import { DesktopVocabularyTypeBadge } from '@/components/desktop/DesktopVocabularyTypeBadge';
import { DesktopWordDetailModal } from '@/components/desktop/DesktopWordDetailModal';
import { desktopPosShort, desktopThumbColor } from '@/components/desktop/desktop-data';
import { TranslationDisplay } from '@/components/word/TranslationDisplay';
import { formatJapaneseForDisplay } from '@/lib/words/display';
import type { WrongAnswer } from '@/lib/utils';
import type { Word } from '@/types';

type FavoriteWord = Word & {
  projectTitle: string;
};

type WrongAnswerRow = WrongAnswer & {
  projectTitle?: string;
};

export function DesktopFavoritesView({
  favorites,
  loading,
  error,
  isPro,
  returnPath,
  onToggleFavorite,
  onCycleVocabularyType,
  onDeleteWord,
}: {
  favorites: FavoriteWord[];
  loading: boolean;
  error: string | null;
  isPro: boolean;
  returnPath: string;
  onToggleFavorite: (word: FavoriteWord) => void;
  onCycleVocabularyType: (word: FavoriteWord) => void;
  onDeleteWord?: (word: FavoriteWord) => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      favorites.filter(
        (word) => !q || word.english.toLowerCase().includes(q) || formatJapaneseForDisplay(word).toLowerCase().includes(q),
      ),
    [favorites, q],
  );
  const counts = useMemo(() => ({
    mastered: favorites.filter((word) => word.status === 'mastered').length,
    active: favorites.filter((word) => word.status === 'active').length,
    review: favorites.filter((word) => word.status === 'review').length,
    newCount: favorites.filter((word) => word.status === 'new').length,
  }), [favorites]);

  // Derive from the favorites array so the modal closes itself when the word
  // is removed (unfavorited or deleted) by the parent page.
  const selectedWord = selectedWordId ? favorites.find((word) => word.id === selectedWordId) ?? null : null;
  const modalWords = useMemo(() => {
    if (!selectedWord) return rows;
    return rows.some((word) => word.id === selectedWord.id) ? rows : [selectedWord, ...rows];
  }, [selectedWord, rows]);

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar title="お気に入り" crumb="コレクション">
        <DesktopButton href={isPro ? `/quiz/all?favorites=1&count=10&from=${returnPath}` : '/subscription'} variant="accent" icon="school">
          クイズ
        </DesktopButton>
        <DesktopButton href={isPro ? `/flashcard/all?favorites=true&from=${returnPath}` : '/subscription'} icon="style">
          カード
        </DesktopButton>
      </DesktopTopbar>

      <div className="ds-scroll">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Icon name="star" filled style={{ color: 'var(--color-warning)', fontSize: 22 }} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20 }}>{favorites.length} <span style={{ fontSize: 13 }}>語</span></span>
          <span className="muted" style={{ fontSize: 13 }}>をお気に入り登録中</span>
          <div style={{ display: 'flex', gap: 12, marginLeft: 8 }}>
            <span className="ds-status mastered"><span className="ds-sdot c-mastered" />習得 {counts.mastered}</span>
            <span className="ds-status active"><span className="ds-sdot c-active" />定着中 {counts.active}</span>
            <span className="ds-status review"><span className="ds-sdot c-review" />学習中 {counts.review}</span>
            <span className="ds-status new"><span className="ds-sdot c-new" />未学習 {counts.newCount}</span>
          </div>
          <div style={{ flex: 1 }} />
          <DesktopSearchBox
            placeholder="お気に入りを検索"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ minWidth: 220 }}
          />
        </div>

        {error && (
          <div className="ds-card" style={{ padding: 14, marginBottom: 16, color: 'var(--color-error)', borderColor: 'var(--color-error)' }}>
            {error}
          </div>
        )}

        <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="ds-table">
            <thead>
              <tr>
                <th style={{ width: 42 }} />
                <th style={{ minWidth: 150 }}>英単語</th>
                <th style={{ width: 70 }}>品詞</th>
                <th>日本語</th>
                <th style={{ width: 64, textAlign: 'center' }}>A/P</th>
                <th style={{ width: 220 }}>出典</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((word) => (
                <tr
                  key={word.id}
                  onClick={() => setSelectedWordId(word.id)}
                  style={selectedWordId === word.id ? { background: 'var(--color-accent-subtle)' } : undefined}
                >
                  <td
                    className="star"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleFavorite(word);
                    }}
                  >
                    <Icon name="star" filled style={{ color: 'var(--color-warning)' }} />
                  </td>
                  <td className="en">{word.english}</td>
                  <td className="pos">{desktopPosShort(word.partOfSpeechTags)}</td>
                  <td className="ja"><TranslationDisplay word={word} compact /></td>
                  <td style={{ textAlign: 'center' }} onClick={(event) => event.stopPropagation()}>
                    <DesktopVocabularyTypeBadge
                      vocabularyType={word.vocabularyType}
                      onClick={() => onCycleVocabularyType(word)}
                    />
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--color-secondary-text)' }}>
                      <span className="ds-project-icon ds-project-icon--xs" style={{ background: desktopThumbColor(word.projectId) }} />
                      {word.projectTitle || '単語帳'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && favorites.length === 0 && (
            <div className="muted" style={{ textAlign: 'center', padding: 50, fontSize: 13 }}>
              <Icon name="progress_activity" className="animate-spin" style={{ marginRight: 8 }} />
              読み込み中...
            </div>
          )}
          {!loading && rows.length === 0 && (
            <div className="muted" style={{ textAlign: 'center', padding: 50, fontSize: 13 }}>
              保存済み単語はまだありません
            </div>
          )}
        </div>
        {rows.length > 0 && (
          <div className="mono muted" style={{ fontSize: 11, marginTop: 10 }}>
            行をクリックで詳細を表示
          </div>
        )}
      </div>

      {selectedWord && (
        <DesktopWordDetailModal
          word={selectedWord}
          words={modalWords}
          onClose={() => setSelectedWordId(null)}
          onToggleFavorite={() => onToggleFavorite(selectedWord)}
          onDelete={onDeleteWord ? () => onDeleteWord(selectedWord) : undefined}
          onNav={(dir) => {
            const ids = modalWords.map((row) => row.id);
            const currentIndex = ids.indexOf(selectedWord.id);
            if (currentIndex < 0 || ids.length === 0) return;
            setSelectedWordId(ids[(currentIndex + dir + ids.length) % ids.length] ?? selectedWord.id);
          }}
        />
      )}
    </div>
  );
}

export function DesktopWrongAnswersView({
  wrongAnswers,
  returnPath,
}: {
  wrongAnswers: WrongAnswerRow[];
  returnPath: string;
}) {
  const totalMisses = wrongAnswers.reduce((total, word) => total + word.wrongCount, 0);
  const averageMisses = wrongAnswers.length > 0 ? Math.round((totalMisses / wrongAnswers.length) * 10) / 10 : 0;
  const rows = [...wrongAnswers].sort((a, b) => b.wrongCount - a.wrongCount || b.lastWrongAt - a.lastWrongAt);

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar title="間違えた問題" crumb="コレクション">
        <DesktopButton href={`/quiz/all?wrong=1&count=10&from=${returnPath}`} variant="accent" icon="replay">
          もう一度クイズ
        </DesktopButton>
      </DesktopTopbar>

      <div className="ds-scroll">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 18 }}>
          <div className="ds-card ds-kpi">
            <div className="ic" style={{ background: 'var(--color-error-light)' }}><Icon name="flag" style={{ color: 'var(--color-error)' }} /></div>
            <div className="v">{wrongAnswers.length}<span className="u">語</span></div>
            <div className="l">復習が必要な単語</div>
          </div>
          <div className="ds-card ds-kpi">
            <div className="ic" style={{ background: 'var(--color-surface-secondary)' }}><Icon name="close" style={{ color: 'var(--color-ink)' }} /></div>
            <div className="v">{totalMisses}<span className="u">回</span></div>
            <div className="l">累計の不正解数</div>
          </div>
          <div className="ds-card ds-kpi">
            <div className="ic" style={{ background: 'var(--color-warning-light)' }}><Icon name="trending_up" style={{ color: '#92400e' }} /></div>
            <div className="v">{averageMisses}<span className="u">回</span></div>
            <div className="l">1語あたり平均</div>
          </div>
        </div>

        <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="ds-table">
            <thead>
              <tr>
                <th style={{ minWidth: 150 }}>英単語</th>
                <th>日本語</th>
                <th style={{ width: 180 }}>出典</th>
                <th style={{ width: 110 }}>間違い回数</th>
                <th style={{ width: 90 }}>最終</th>
                <th style={{ width: 110 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((word) => (
                <tr key={word.wordId}>
                  <td className="en">{word.english}</td>
                  <td className="ja"><TranslationDisplay word={word} compact /></td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--color-secondary-text)' }}>
                      <span className="ds-project-icon ds-project-icon--xs" style={{ background: desktopThumbColor(word.projectId || word.wordId) }} />
                      {word.projectTitle || '単語帳'}
                    </span>
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--color-error)' }}>{word.wrongCount}</span>
                      <span className="muted" style={{ fontSize: 11 }}>回</span>
                    </span>
                  </td>
                  <td className="mono" style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>{formatWrongDate(word.lastWrongAt)}</td>
                  <td>
                    <Link href={`/flashcard/${word.projectId || 'all'}?from=${returnPath}`} className="ds-btn ghost sm">
                      <Icon name="style" />復習
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="muted" style={{ textAlign: 'center', padding: 50, fontSize: 13 }}>
              間違えた問題はまだありません
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatWrongDate(timestamp: number) {
  if (!Number.isFinite(timestamp)) return '-';
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(new Date(timestamp));
}
