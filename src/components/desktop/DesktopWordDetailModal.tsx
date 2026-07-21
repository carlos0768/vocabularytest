'use client';

import { Fragment } from 'react';
import { Icon } from '@/components/ui/Icon';
import { desktopPosLabel } from '@/components/desktop/desktop-data';
import { MorphologyFormulaChips } from '@/components/word/MorphologyFormulaChips';
import { TranslationDisplay } from '@/components/word/TranslationDisplay';
import { hasDisplayableMorphology } from '@/lib/morphology/format';
import { useMorphologyBackfill } from '@/hooks/use-morphology-backfill';
import type { Word } from '@/types';

export function DesktopWordDetailModal({
  word,
  words,
  onClose,
  onToggleFavorite,
  onDelete,
  onNav,
}: {
  word: Word;
  words: Word[];
  onClose: () => void;
  onToggleFavorite: () => void;
  onDelete?: () => void;
  onNav: (dir: -1 | 1) => void;
}) {
  // word.morphology が無い単語は lexicon 共有キャッシュから表示時に補完する
  const morphology = useMorphologyBackfill(word);

  return (
    <div className="ds-overlay" onClick={onClose}>
      <div className="ds-modal" onClick={(event) => event.stopPropagation()}>
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
            {onDelete && (
              <button type="button" className="ds-iconbtn" onClick={onDelete} aria-label="削除" style={{ color: 'var(--color-error, #cc4d59)' }}>
                <Icon name="delete" />
              </button>
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
              <button type="button" className="ds-btn ghost sm" onClick={onToggleFavorite} aria-label="保存">
                <Icon
                  name="bookmark"
                  filled={word.isFavorite}
                  style={{ color: word.isFavorite ? 'var(--color-accent)' : 'var(--color-muted)' }}
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
              <div className="word-ja"><TranslationDisplay word={word} /></div>
            </div>
          </div>

          <div style={{ paddingTop: 2 }}>
              <div className="mono" style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent-ink)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Icon name="auto_awesome" style={{ fontSize: 14 }} />AI 例文
              </div>
              {word.exampleSentence ? (
                <>
                  <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.75 }}>
                    {renderExample(word.exampleSentence, word.english)}
                  </div>
                  {word.exampleSentenceJa && (
                    <div style={{ fontSize: 13.5, color: 'var(--color-secondary-text)', lineHeight: 1.75, marginTop: 4 }}>
                      {word.exampleSentenceJa}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon name="progress_activity" className="animate-spin" style={{ fontSize: 16, color: 'var(--color-accent)' }} />
                    <span style={{ fontSize: 13, color: 'var(--color-muted)', fontWeight: 500 }}>
                      例文を生成中...
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="ds-shimmer" style={{ height: 14, borderRadius: 6, width: '90%' }} />
                    <div className="ds-shimmer" style={{ height: 14, borderRadius: 6, width: '70%' }} />
                    <div className="ds-shimmer" style={{ height: 12, borderRadius: 6, width: '55%', marginTop: 4 }} />
                  </div>
                </div>
              )}
            </div>

          {hasDisplayableMorphology(morphology) && (
            <div>
              <div className="mono" style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent-ink)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Icon name="account_tree" style={{ fontSize: 14 }} />語源
              </div>
              <MorphologyFormulaChips morphology={morphology} />
              <div style={{ fontSize: 13, color: 'var(--color-secondary-text)', lineHeight: 1.75, marginTop: 12, whiteSpace: 'pre-line' }}>
                {morphology.explanation}
              </div>
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
