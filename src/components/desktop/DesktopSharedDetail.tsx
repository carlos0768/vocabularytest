'use client';

import { useMemo, useState } from 'react';
import { DesktopButton, DesktopSearchBox, DesktopTopbar } from '@/components/desktop/DesktopChrome';
import { desktopPosShort, desktopThumbColor } from '@/components/desktop/desktop-data';
import { Icon } from '@/components/ui/Icon';
import type { Project, Word } from '@/types';

export function DesktopSharedDetailView({
  project,
  words,
  ownerLabel,
  selectMode,
  selectedWordIds,
  likeCount,
  liked,
  importing,
  importedProjectId,
  isPreviewLocked = false,
  totalWordCount = words.length,
  previewClearWordCount = 5,
  onToggleLike,
  onToggleSelectMode,
  onToggleWord,
  onImport,
  onClearSelection,
}: {
  project: Project;
  words: Word[];
  ownerLabel: string;
  selectMode: boolean;
  selectedWordIds: Set<string>;
  likeCount: number;
  liked: boolean;
  importing: boolean;
  importedProjectId: string | null;
  isPreviewLocked?: boolean;
  totalWordCount?: number;
  previewClearWordCount?: number;
  onToggleLike: () => void;
  onToggleSelectMode: () => void;
  onToggleWord: (wordId: string) => void;
  onImport: () => void;
  onClearSelection: () => void;
}) {
  const [ap, setAp] = useState<'all' | 'active' | 'passive'>('all');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const bg = project.iconImage ? undefined : desktopThumbColor(project.id);
  const selectedCount = selectedWordIds.size;
  const hiddenWordCount = isPreviewLocked
    ? Math.max(0, totalWordCount - Math.min(previewClearWordCount, totalWordCount))
    : Math.max(0, totalWordCount - words.length);

  const filtered = useMemo(
    () => {
      if (isPreviewLocked) return words;
      return words.filter((word) => {
        if (ap !== 'all' && (word.vocabularyType || 'none') !== ap) return false;
        if (!q) return true;
        return word.english.toLowerCase().includes(q) || word.japanese.toLowerCase().includes(q);
      });
    },
    [ap, isPreviewLocked, q, words],
  );

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar title={project.title} crumb="共有ライブラリ / 共有単語帳">
        <DesktopButton variant="ghost" icon="thumb_up" onClick={onToggleLike}>
          {liked ? 'いいね済み' : 'いいね'} {likeCount > 0 ? likeCount : ''}
        </DesktopButton>
        {isPreviewLocked ? (
          <DesktopButton href="/subscription" variant="dark" icon="workspace_premium">
            すべて見る
          </DesktopButton>
        ) : (
          <DesktopButton variant={selectMode ? 'dark' : undefined} icon="checklist" onClick={onToggleSelectMode}>
            {selectMode ? '選択を終了' : '選択して追加'}
          </DesktopButton>
        )}
      </DesktopTopbar>

      <div className="ds-scroll" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div className="ds-card" style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 18, marginBottom: 16, flexShrink: 0 }}>
          <div
            className="ds-project-icon"
            style={{
              background: bg,
              backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined,
            }}
          >
            {!project.iconImage && project.title.charAt(0)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18 }}>{project.title}</span>
              <span className="ds-tag plain">共有中</span>
              {importedProjectId && <span className="ds-tag accent">追加済み</span>}
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 5, display: 'flex', gap: 16 }}>
              <span className="mono">{ownerLabel}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="menu_book" style={{ fontSize: 15 }} />{totalWordCount} 語</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="thumb_up" style={{ fontSize: 15 }} />{likeCount}</span>
              <span className="mono">作成 {new Date(project.createdAt).toLocaleDateString('ja-JP')}</span>
            </div>
            {project.description && <div className="muted" style={{ fontSize: 12.5, marginTop: 7 }}>{project.description}</div>}
            {isPreviewLocked && (
              <div className="muted" style={{ fontSize: 12.5, marginTop: 7 }}>
                最初の {Math.min(previewClearWordCount, words.length)} 語は表示し、以降はぼかしています。
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <h2 style={{ fontSize: 19, margin: 0 }}>単語一覧</h2>
            <span className="mono muted" style={{ fontSize: 12 }}>{filtered.length}{filtered.length !== totalWordCount ? ` / ${totalWordCount}` : ''}</span>
          </div>
          <div style={{ flex: 1 }} />
          {!isPreviewLocked && (
            <>
              <div style={{ display: 'flex', gap: 6 }}>
                {([
                  ['all', 'すべて'],
                  ['active', 'アクティブ'],
                  ['passive', 'パッシブ'],
                ] as const).map(([value, label]) => (
                  <button key={value} type="button" className={'ds-chip' + (ap === value ? ' active' : '')} onClick={() => setAp(value)}>{label}</button>
                ))}
              </div>
              <DesktopSearchBox placeholder="単語を検索" value={query} onChange={(event) => setQuery(event.target.value)} style={{ minWidth: 200 }} />
            </>
          )}
        </div>

        <div className="ds-card" style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
          <table className="ds-table">
            <thead>
              <tr>
                {selectMode && <th style={{ width: 44 }} />}
                <th style={{ minWidth: 150 }}>単語</th>
                <th style={{ width: 56, textAlign: 'center' }}>A/P</th>
                <th style={{ width: 90 }}>品詞</th>
                <th>訳</th>
                <th style={{ width: 70 }}>CEFR</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((word, index) => {
                const locked = isPreviewLocked && index >= previewClearWordCount;
                const selected = selectedWordIds.has(word.id);
                const textStyle = locked ? { filter: 'blur(4px)', userSelect: 'none' as const } : undefined;
                return (
                  <tr
                    key={word.id}
                    onClick={selectMode && !locked ? () => onToggleWord(word.id) : undefined}
                    style={selectMode && selected ? { background: 'var(--color-accent-subtle)' } : undefined}
                  >
                    {selectMode && (
                      <td>
                        <span className={'ds-check' + (selected ? ' on' : '')}>
                          {selected && <Icon name="check" style={{ fontSize: 15, color: '#fff' }} />}
                        </span>
                      </td>
                    )}
                    <td className="en">
                      <span style={textStyle}>{word.english}</span>
                      {locked && <Icon name="lock" style={{ marginLeft: 6, fontSize: 14, color: 'var(--color-muted)' }} />}
                    </td>
                    <td style={{ textAlign: 'center' }}><span style={textStyle}><ApBadge value={word.vocabularyType} /></span></td>
                    <td className="pos"><span style={textStyle}>{desktopPosShort(word.partOfSpeechTags)}</span></td>
                    <td className="ja"><span style={textStyle}>{word.japanese}</span></td>
                    <td className="cefr"><span className="cefr-pill" style={textStyle}>{word.cefrLevel || '-'}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="muted" style={{ textAlign: 'center', padding: 50, fontSize: 13 }}>一致する単語がありません</div>}
        </div>

        <div className="ds-actionbar">
          {isPreviewLocked ? (
            <>
              <span className="muted" style={{ fontSize: 13 }}>
                {hiddenWordCount > 0 ? `残り ${hiddenWordCount} 語を含む全体表示はProで利用できます` : '全体表示はProで利用できます'}
              </span>
              <div className="grow" />
              <DesktopButton href="/subscription" variant="accent" icon="workspace_premium">
                Proで全単語を見る
              </DesktopButton>
            </>
          ) : selectMode ? (
            <>
              <span className="muted" style={{ fontSize: 13 }}>{selectedCount} 語を選択中</span>
              <div className="grow" />
              <button type="button" className="ds-btn ghost" onClick={onClearSelection}>選択をクリア</button>
              <button type="button" className="ds-btn accent" disabled={selectedCount === 0 || importing} style={selectedCount === 0 || importing ? { opacity: 0.5 } : undefined} onClick={onImport}>
                {importing ? <Icon name="progress_activity" className="animate-spin" /> : <Icon name="download" />}
                選択した {selectedCount} 語を追加
              </button>
            </>
          ) : (
            <>
              <span className="muted" style={{ fontSize: 13 }}>この単語帳を自分のライブラリにコピーします</span>
              <div className="grow" />
              <button type="button" className="ds-btn accent" disabled={importing} onClick={onImport}>
                {importing ? <Icon name="progress_activity" className="animate-spin" /> : <Icon name="download" />}
                単語帳として追加（全 {words.length} 語）
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ApBadge({ value }: { value?: Word['vocabularyType'] }) {
  return <span className={'ds-ap ' + (value || 'none')}>{value === 'active' ? 'A' : value === 'passive' ? 'P' : '-'}</span>;
}
