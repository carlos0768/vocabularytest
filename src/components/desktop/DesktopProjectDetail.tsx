'use client';

import { Fragment, type CSSProperties, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import {
  DesktopButton,
  DesktopDonut,
  DesktopSearchBox,
  DesktopTopbar,
} from '@/components/desktop/DesktopChrome';
import {
  DESKTOP_STATUS_LABEL,
  desktopPosLabel,
  desktopSourceLabel,
  desktopThumbColor,
} from '@/components/desktop/desktop-data';
import type { Project, Word, WordStatus } from '@/types';

const STATUS_FILTERS: { key: 'all' | WordStatus; label: string; dot?: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'mastered', label: '習得', dot: 'c-mastered' },
  { key: 'review', label: '学習中', dot: 'c-review' },
  { key: 'new', label: '未学習', dot: 'c-new' },
];

type SortKey = 'order' | 'en' | 'cefr' | 'status';

export function DesktopProjectDetailView({
  project,
  projectId,
  words,
  wordsLoaded,
  counts,
  onToggleFavorite,
}: {
  project: Project;
  projectId: string;
  words: Word[];
  wordsLoaded: boolean;
  counts: { total: number; mastered: number; learning: number; newCount: number };
  onToggleFavorite: (word: Word) => void;
}) {
  const [filter, setFilter] = useState<'all' | WordStatus>('all');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('order');
  const [sortDir, setSortDir] = useState(1);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const bg = desktopThumbColor(project.id);

  const rows = useMemo(() => {
    const order: Record<WordStatus, number> = { new: 0, review: 1, mastered: 2 };
    const base = words.filter((word) => {
      if (filter !== 'all' && word.status !== filter) return false;
      if (!q) return true;
      return word.english.toLowerCase().includes(q) || word.japanese.toLowerCase().includes(q);
    });
    return [...base].sort((a, b) => {
      let result = 0;
      if (sortKey === 'en') result = a.english.localeCompare(b.english);
      else if (sortKey === 'cefr') result = (a.cefrLevel ?? '').localeCompare(b.cefrLevel ?? '');
      else if (sortKey === 'status') result = order[a.status] - order[b.status];
      else result = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return result * sortDir;
    });
  }, [filter, q, sortDir, sortKey, words]);

  const selectedWord = selectedWordId ? words.find((word) => word.id === selectedWordId) ?? null : null;
  const pctMastered = counts.total > 0 ? Math.round((counts.mastered / counts.total) * 100) : 0;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((current) => -current);
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  const sortHead = (key: SortKey, label: string, extra?: CSSProperties) => (
    <th onClick={() => toggleSort(key)} style={extra}>
      {label} {sortKey === key && <Icon name={sortDir === 1 ? 'arrow_downward' : 'arrow_upward'} />}
    </th>
  );

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar title={project.title} crumb="単語帳 / 一覧">
        <DesktopButton href={`/quiz/${projectId}`} variant="accent" icon="school">クイズ</DesktopButton>
        <DesktopButton href={`/flashcard/${projectId}`} icon="style">カード</DesktopButton>
        <DesktopButton href={`/scan?projectId=${encodeURIComponent(projectId)}`} icon="photo_camera">追加</DesktopButton>
      </DesktopTopbar>

      <div className="ds-scroll">
        <div className="ds-card" style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 20, marginBottom: 18, flexShrink: 0 }}>
          <div
            className="ds-project-icon ds-project-icon--lg"
            style={{
              background: bg,
              backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined,
            }}
          >
            {!project.iconImage && project.title.charAt(0)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22 }}>
                {counts.total} <span style={{ fontSize: 13 }}>語</span>
              </span>
              <span className="mono muted" style={{ fontSize: 12 }}>{desktopSourceLabel(project)}</span>
              {project.description && <span className="muted" style={{ fontSize: 12 }}>{project.description}</span>}
            </div>
            <div className="ds-dist" style={{ marginTop: 10, maxWidth: 460 }}>
              <span className="c-mastered" style={{ flex: counts.mastered || 0.0001 }} />
              <span className="c-review" style={{ flex: counts.learning || 0.0001 }} />
              <span className="c-new" style={{ flex: counts.newCount || 0.0001 }} />
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              <span className="ds-status mastered"><span className="ds-sdot c-mastered" />習得 {counts.mastered}</span>
              <span className="ds-status review"><span className="ds-sdot c-review" />学習中 {counts.learning}</span>
              <span className="ds-status new"><span className="ds-sdot c-new" />未学習 {counts.newCount}</span>
            </div>
          </div>
          <DesktopDonut mastered={counts.mastered} review={counts.learning} total={counts.total} size={84} stroke={11} percent={pctMastered} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 7 }}>
            {STATUS_FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={'ds-chip' + (filter === item.key ? ' active' : '')}
                onClick={() => setFilter(item.key)}
              >
                {item.dot && <span className={'ds-sdot ' + item.dot} />}
                {item.label}
                {item.key !== 'all' && (
                  <span className="tnum" style={{ opacity: 0.7 }}>
                    {item.key === 'mastered' ? counts.mastered : item.key === 'review' ? counts.learning : counts.newCount}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <DesktopSearchBox
            placeholder="英単語・日本語を検索"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ minWidth: 240 }}
          />
        </div>

        <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="ds-table">
            <thead>
              <tr>
                <th style={{ width: 42 }} />
                {sortHead('en', '英単語', { minWidth: 150 })}
                <th style={{ width: 70 }}>品詞</th>
                <th>日本語</th>
                {sortHead('cefr', 'CEFR', { width: 80 })}
                {sortHead('status', 'ステータス', { width: 130 })}
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
                    <Icon
                      name={word.isFavorite ? 'star' : 'star_border'}
                      filled={word.isFavorite}
                      style={word.isFavorite ? { color: 'var(--color-warning)' } : undefined}
                    />
                  </td>
                  <td className="en">
                    {word.english}
                    <div className="mono" style={{ fontSize: 10, color: 'var(--color-muted)', fontWeight: 400 }}>
                      {word.pronunciation || '-'}
                    </div>
                  </td>
                  <td className="pos">{desktopPosLabel(word.partOfSpeechTags)}</td>
                  <td className="ja">{word.japanese}</td>
                  <td className="cefr"><span className="cefr-pill">{word.cefrLevel || '-'}</span></td>
                  <td><span className={'ds-status ' + word.status}><span className={'ds-sdot c-' + word.status} />{DESKTOP_STATUS_LABEL[word.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!wordsLoaded && (
            <div className="muted" style={{ textAlign: 'center', padding: 50, fontSize: 13 }}>
              <Icon name="progress_activity" className="animate-spin" style={{ marginRight: 8 }} />
              単語を読み込み中...
            </div>
          )}
          {wordsLoaded && rows.length === 0 && (
            <div className="muted" style={{ textAlign: 'center', padding: 50, fontSize: 13 }}>該当する単語がありません</div>
          )}
        </div>
        <div className="mono muted" style={{ fontSize: 11, marginTop: 10 }}>
          {rows.length} / {counts.total} 語を表示・行をクリックで詳細を表示
        </div>
      </div>

      {selectedWord && (
        <DesktopWordDetailModal
          word={selectedWord}
          words={rows}
          onClose={() => setSelectedWordId(null)}
          onToggleFavorite={() => onToggleFavorite(selectedWord)}
          onNav={(dir) => {
            const ids = rows.map((row) => row.id);
            const currentIndex = ids.indexOf(selectedWord.id);
            setSelectedWordId(ids[(currentIndex + dir + ids.length) % ids.length] ?? selectedWord.id);
          }}
        />
      )}
    </div>
  );
}

function DesktopWordDetailModal({
  word,
  words,
  onClose,
  onToggleFavorite,
  onNav,
}: {
  word: Word;
  words: Word[];
  onClose: () => void;
  onToggleFavorite: () => void;
  onNav: (dir: -1 | 1) => void;
}) {
  return (
    <div className="ds-overlay">
      <div className="ds-modal">
        <div className="ds-modal-head">
          <div className="lab">単語の詳細</div>
          <div className="nav">
            {words.length > 1 && (
              <>
                <button type="button" className="ds-iconbtn" onClick={() => onNav(-1)} aria-label="前の単語">
                  <Icon name="chevron_left" />
                </button>
                <button type="button" className="ds-iconbtn" onClick={() => onNav(1)} aria-label="次の単語">
                  <Icon name="chevron_right" />
                </button>
              </>
            )}
            <button type="button" className="ds-iconbtn" onClick={onClose} aria-label="閉じる">
              <Icon name="close" />
            </button>
          </div>
        </div>
        <div className="ds-modal-body">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="word-en">{word.english}</div>
              <button type="button" className="ds-btn ghost sm" onClick={onToggleFavorite} aria-label="お気に入り">
                <Icon
                  name={word.isFavorite ? 'star' : 'star_border'}
                  filled={word.isFavorite}
                  style={{ color: word.isFavorite ? 'var(--color-warning)' : 'var(--color-muted)' }}
                />
              </button>
            </div>
            <div className="ds-detail">
              {(word.pronunciation || word.cefrLevel) && (
                <div className="word-ph" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {word.pronunciation && <span>{word.pronunciation}</span>}
                  {word.cefrLevel && <span className="ds-tag plain">{word.cefrLevel}</span>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {(word.partOfSpeechTags?.length ? word.partOfSpeechTags : ['未分類']).map((tag) => (
                  <span key={tag} className="ds-tag accent">{desktopPosLabel([tag])}</span>
                ))}
              </div>
              <div className="word-ja">{word.japanese}</div>
            </div>
          </div>

          {(word.exampleSentence || word.exampleSentenceJa) && (
            <div style={{ paddingTop: 2 }}>
              <div className="mono" style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent-ink)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Icon name="auto_awesome" style={{ fontSize: 14 }} />AI 例文
              </div>
              {word.exampleSentence && (
                <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.75 }}>
                  {renderExample(word.exampleSentence, word.english)}
                </div>
              )}
              {word.exampleSentenceJa && (
                <div style={{ fontSize: 13.5, color: 'var(--color-secondary-text)', lineHeight: 1.75, marginTop: 4 }}>
                  {word.exampleSentenceJa}
                </div>
              )}
            </div>
          )}

          {word.relatedWords && word.relatedWords.length > 0 && (
            <div>
              <div className="muted" style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>関連語</div>
              <div className="ds-rel">
                {word.relatedWords.map((related) => (
                  <div key={`${related.relation}-${related.term}`} className="item">
                    <span className="rel">{related.relation}</span>
                    <span className="tm">{related.term}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function renderExample(sentence: string, word: string) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = sentence.split(new RegExp(`(${escaped})`, 'i'));
  return parts.map((part, index) =>
    part.toLowerCase() === word.toLowerCase() ? <b key={index}>{part}</b> : <Fragment key={index}>{part}</Fragment>,
  );
}
