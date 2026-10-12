'use client';

// デスクトップのスキャン結果確認画面 (`/scan/confirm` の PC 表示)。
import { useState } from 'react';
import type { AIWordExtraction } from '@/types';
import { DesktopButton, DesktopTopbar } from '@/components/desktop/DesktopChrome';
import { STRIPE_BG, desktopPosShort } from '@/components/desktop/desktop-data';
import { Icon } from '@/components/ui/Icon';
import { TranslationDisplay } from '@/components/word/TranslationDisplay';
import { formatMorphologyFormula, hasDisplayableMorphology } from '@/lib/morphology/format';

type EditableScanWord = AIWordExtraction & {
  tempId: string;
  isEditing: boolean;
  isSelected: boolean;
};

export function DesktopScanConfirmView({
  words,
  projectTitle,
  isAddingToExisting,
  selectedCount,
  availableSlots,
  showLimitWarning,
  excessCount,
  currentWordCount,
  saving,
  isPro,
  onProjectTitleChange,
  onToggleWord,
  onEditWord,
  onSaveWord,
  onCancelEdit,
  onDeleteWord,
  onAddManualWord,
  onBack,
  onSaveProject,
}: {
  words: EditableScanWord[];
  projectTitle: string;
  isAddingToExisting: boolean;
  selectedCount: number;
  availableSlots: number;
  showLimitWarning: boolean;
  excessCount: number;
  currentWordCount: number;
  saving: boolean;
  isPro: boolean;
  onProjectTitleChange: (title: string) => void;
  onToggleWord: (tempId: string) => void;
  onEditWord: (tempId: string) => void;
  onSaveWord: (tempId: string, english: string, japanese: string) => void;
  onCancelEdit: (tempId: string) => void;
  onDeleteWord: (tempId: string) => void;
  onAddManualWord: () => void;
  onBack: () => void;
  onSaveProject: () => void;
}) {
  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar title="抽出結果の確認" crumb="スキャン / 単語の抽出">
        <DesktopButton variant="ghost" icon="close" onClick={onBack}>キャンセル</DesktopButton>
        <button type="button" className="ds-btn accent" disabled={saving || selectedCount === 0 || (!isPro && excessCount > 0)} onClick={onSaveProject} style={saving || selectedCount === 0 || (!isPro && excessCount > 0) ? { opacity: 0.55 } : undefined}>
          {saving ? <Icon name="progress_activity" className="animate-spin" /> : <Icon name="check" />}
          {saving ? '保存中...' : isAddingToExisting ? `${selectedCount}語を追加` : `${selectedCount}語を保存`}
        </button>
      </DesktopTopbar>
      <div className="ds-scroll" style={{ display: 'grid', gridTemplateColumns: isAddingToExisting ? 'minmax(0, 1fr)' : '380px minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
        {!isAddingToExisting && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 0 }}>
            <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ aspectRatio: '3/4', background: STRIPE_BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--color-secondary-text)' }}>
                <Icon name="image" style={{ fontSize: 40, color: 'var(--color-muted)' }} />
                <span className="mono" style={{ fontSize: 12 }}>撮影した写真</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--color-muted)' }}>scan_result.jpg</span>
              </div>
            </div>
            <div className="ds-card" style={{ padding: '18px 20px' }}>
              <div className="muted" style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>保存先の単語帳</div>
              <input className="ds-input" value={projectTitle} onChange={(event) => onProjectTitleChange(event.target.value)} placeholder="単語帳名" />
            </div>

            <div className="ds-card" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: isPro ? '1fr 1fr' : '1fr 1fr 1fr', gap: 10 }}>
                <ConfirmMetric label="抽出" value={words.length} />
                <ConfirmMetric label="選択中" value={selectedCount} accent="var(--color-accent)" />
                {!isPro && <ConfirmMetric label="残り" value={availableSlots} accent={showLimitWarning ? 'var(--color-warning)' : 'var(--color-ink)'} />}
              </div>
              {showLimitWarning && (
                <div style={{ marginTop: 14, color: 'var(--color-error)', fontSize: 12.5, fontWeight: 700, lineHeight: 1.6 }}>
                  <Icon name="warning" style={{ fontSize: 16, verticalAlign: '-3px', marginRight: 5 }} />
                  現在 {currentWordCount}語。保存すると上限を {excessCount}語超過します。
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <Icon name="auto_awesome" style={{ color: 'var(--color-accent)', fontSize: 22 }} />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19 }}>{words.length} 語</span>
            <span className="muted" style={{ fontSize: 13 }}>を抽出しました</span>
            {isAddingToExisting && (
              <>
                <span className="ds-tag plain">選択中 {selectedCount}</span>
                {!isPro && <span className="ds-tag plain">残り {availableSlots}</span>}
                {showLimitWarning && (
                  <span style={{ color: 'var(--color-error)', fontSize: 12.5, fontWeight: 700 }}>
                    現在 {currentWordCount}語。{excessCount}語超過します。
                  </span>
                )}
              </>
            )}
            <div style={{ flex: 1 }} />
            <button type="button" className="ds-btn sm" onClick={onAddManualWord}><Icon name="add" />手動で追加</button>
            {!isAddingToExisting && <span className="mono muted" style={{ fontSize: 12 }}>{selectedCount} 語を選択中</span>}
          </div>
          <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="ds-table">
              <thead>
                <tr>
                  <th style={{ width: 46 }} />
                  <th style={{ minWidth: 140 }}>英単語</th>
                  <th style={{ width: 80 }}>品詞</th>
                  <th>日本語訳</th>
                  <th style={{ width: 70 }}>CEFR</th>
                  <th style={{ width: 86 }} />
                </tr>
              </thead>
              <tbody>
                {words.map((word, index) => (
                  <DesktopScanConfirmRow
                    key={word.tempId}
                    word={word}
                    index={index}
                    onToggleWord={onToggleWord}
                    onEditWord={onEditWord}
                    onSaveWord={onSaveWord}
                    onCancelEdit={onCancelEdit}
                    onDeleteWord={onDeleteWord}
                  />
                ))}
              </tbody>
            </table>
            {words.length === 0 && (
              <div className="muted" style={{ textAlign: 'center', padding: 50, fontSize: 13 }}>
                単語がありません。戻って再度スキャンしてください。
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmMetric({ label, value, accent = 'var(--color-ink)' }: { label: string; value: number; accent?: string }) {
  return (
    <div>
      <div className="mono muted" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: accent, lineHeight: 1, marginTop: 5 }}>{value}</div>
    </div>
  );
}

function DesktopScanConfirmRow({
  word,
  index,
  onToggleWord,
  onEditWord,
  onSaveWord,
  onCancelEdit,
  onDeleteWord,
}: {
  word: EditableScanWord;
  index: number;
  onToggleWord: (tempId: string) => void;
  onEditWord: (tempId: string) => void;
  onSaveWord: (tempId: string, english: string, japanese: string) => void;
  onCancelEdit: (tempId: string) => void;
  onDeleteWord: (tempId: string) => void;
}) {
  const [english, setEnglish] = useState(word.english);
  const [japanese, setJapanese] = useState(word.japanese);

  if (word.isEditing) {
    return (
      <tr>
        <td />
        <td><input className="ds-input" value={english} onChange={(event) => setEnglish(event.target.value)} placeholder={`単語 ${index + 1}`} autoFocus /></td>
        <td />
        <td><input className="ds-input" value={japanese} onChange={(event) => setJapanese(event.target.value)} placeholder="日本語訳" /></td>
        <td />
        <td>
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" className="ds-iconbtn" onClick={() => onSaveWord(word.tempId, english, japanese)} aria-label="保存"><Icon name="check" /></button>
            <button type="button" className="ds-iconbtn" onClick={() => onCancelEdit(word.tempId)} aria-label="キャンセル"><Icon name="close" /></button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr onClick={() => onToggleWord(word.tempId)} style={!word.isSelected ? { opacity: 0.45 } : undefined}>
      <td>
        <span className={'ds-check' + (word.isSelected ? ' on' : '')}>
          {word.isSelected && <Icon name="check" style={{ fontSize: 16, color: 'var(--color-on-accent)' }} />}
        </span>
      </td>
      <td className="en">{word.english || `単語 ${index + 1}`}</td>
      <td className="pos">{desktopPosShort(word.partOfSpeechTags)}</td>
      <td className="ja">
        {word.japanese ? <TranslationDisplay word={word} compact /> : '-'}
        {hasDisplayableMorphology(word.morphology) && (
          <div style={{ marginTop: 5, paddingTop: 5, borderTop: '1px dashed var(--color-border)' }}>
            <div className="mono" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--solid-ink)' }}>
              {formatMorphologyFormula(word.morphology)}
            </div>
            <div className="muted" style={{ fontSize: 10.5, lineHeight: 1.5, whiteSpace: 'pre-line', marginTop: 2 }}>
              {word.morphology.explanation}
            </div>
          </div>
        )}
      </td>
      <td className="cefr"><span className="cefr-pill">{word.cefrLevel || '-'}</span></td>
      <td onClick={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" className="ds-iconbtn" onClick={() => onEditWord(word.tempId)} aria-label="編集"><Icon name="edit" /></button>
          <button type="button" className="ds-iconbtn" onClick={() => onDeleteWord(word.tempId)} aria-label="削除"><Icon name="delete" /></button>
        </div>
      </td>
    </tr>
  );
}
