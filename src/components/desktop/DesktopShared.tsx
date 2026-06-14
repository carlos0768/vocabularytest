'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { DesktopSearchBox, DesktopTopbar } from '@/components/desktop/DesktopChrome';
import { desktopThumbColor } from '@/components/desktop/desktop-data';
import type { SharedProjectCard, StudyGroupSummary } from '@/lib/shared-projects/types';

export type SharedLibraryTab = 'public' | 'groups';

export function DesktopSharedView({
  activeTab,
  onActiveTabChange,
  publicProjects,
  groupProjects,
  groups,
  selectedGroup,
  selectedGroupId,
  groupsLoading,
  groupProjectsLoading,
  publicNextCursor,
  publicLoadingMore,
  publicError,
  groupsError,
  groupProjectsError,
  createGroupName,
  joinGroupCode,
  groupActionLoading,
  onLoadMorePublic,
  onSelectGroup,
  onCreateGroupNameChange,
  onJoinGroupCodeChange,
  onCreateGroup,
  onJoinGroup,
  onCopyGroupInvite,
}: {
  activeTab: SharedLibraryTab;
  onActiveTabChange: (tab: SharedLibraryTab) => void;
  publicProjects: SharedProjectCard[];
  groupProjects: SharedProjectCard[];
  groups: StudyGroupSummary[];
  selectedGroup: StudyGroupSummary | null;
  selectedGroupId: string | null;
  groupsLoading: boolean;
  groupProjectsLoading: boolean;
  publicNextCursor: string | null;
  publicLoadingMore: boolean;
  publicError: string | null;
  groupsError: string | null;
  groupProjectsError: string | null;
  createGroupName: string;
  joinGroupCode: string;
  groupActionLoading: 'create' | 'join' | null;
  onLoadMorePublic: () => void;
  onSelectGroup: (groupId: string | null) => void;
  onCreateGroupNameChange: (value: string) => void;
  onJoinGroupCodeChange: (value: string) => void;
  onCreateGroup: () => void;
  onJoinGroup: () => void;
  onCopyGroupInvite: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'popular' | 'public'>('all');
  const [query, setQuery] = useState('');
  const [groupPanelOpen, setGroupPanelOpen] = useState(false);
  const q = query.trim().toLowerCase();
  const sourceProjects = activeTab === 'public' ? publicProjects : groupProjects;
  const popularCount = sourceProjects.filter((project) => (project.likeCount ?? 0) > 0).length;
  const rows = useMemo(() => {
    const base = filter === 'popular'
      ? [...sourceProjects].filter((project) => (project.likeCount ?? 0) > 0).sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))
      : sourceProjects;
    return base.filter((project) => !q || project.project.title.toLowerCase().includes(q));
  }, [filter, q, sourceProjects]);

  const emptyMessage = activeTab === 'public'
    ? '公開中の単語帳はまだありません'
    : selectedGroup
      ? 'このグループの単語帳はまだありません'
      : 'グループを選択してください';

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar
        title="共有ライブラリ"
        crumb={activeTab === 'public' ? 'コレクション / みんなの単語帳' : 'コレクション / グループ'}
      >
        <DesktopSearchBox
          placeholder={activeTab === 'public' ? '公開単語帳を検索' : 'グループ内を検索'}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </DesktopTopbar>
      <div className="ds-scroll">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{ display: 'inline-flex', borderRadius: 0, border: '1.5px solid var(--solid-ink)', background: '#fff', padding: 3 }}>
            <button
              type="button"
              onClick={() => onActiveTabChange('public')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
                background: activeTab === 'public' ? 'var(--solid-ink)' : 'transparent',
                color: activeTab === 'public' ? '#fff' : 'var(--solid-ink)',
                transition: 'all 0.15s',
              }}
            >
              <Icon name="public" style={{ fontSize: 16 }} />
              公開
              <span className="tnum" style={{ opacity: 0.6, fontSize: 11 }}>{publicProjects.length}</span>
            </button>
            <button
              type="button"
              onClick={() => onActiveTabChange('groups')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
                background: activeTab === 'groups' ? 'var(--solid-ink)' : 'transparent',
                color: activeTab === 'groups' ? '#fff' : 'var(--solid-ink)',
                transition: 'all 0.15s',
              }}
            >
              <Icon name="group" style={{ fontSize: 16 }} />
              グループ
              <span className="tnum" style={{ opacity: 0.6, fontSize: 11 }}>{groups.length}</span>
            </button>
          </div>

          {activeTab === 'public' && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className={'ds-chip' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>すべて <span className="tnum" style={{ opacity: 0.7 }}>{sourceProjects.length}</span></button>
              <button type="button" className={'ds-chip' + (filter === 'popular' ? ' active' : '')} onClick={() => setFilter('popular')}>人気 <span className="tnum" style={{ opacity: 0.7 }}>{popularCount}</span></button>
              <button type="button" className={'ds-chip' + (filter === 'public' ? ' active' : '')} onClick={() => setFilter('public')}>公開中 <span className="tnum" style={{ opacity: 0.7 }}>{publicProjects.length}</span></button>
            </div>
          )}
        </div>

        {activeTab === 'groups' && !selectedGroupId && (
          <div style={{ display: 'flex', gap: 18, marginBottom: 22 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em' }}>所属グループ</h2>
                  {groupsLoading && <Icon name="progress_activity" className="animate-spin" style={{ fontSize: 16 }} />}
                  {groups.length > 0 && <span className="muted" style={{ fontSize: 11 }}>{groups.length} グループ</span>}
                </div>
                <button
                  type="button"
                  onClick={() => setGroupPanelOpen((v) => !v)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                    border: '1.25px solid var(--solid-ink)', background: '#fff', color: 'var(--solid-ink)',
                    cursor: 'pointer', transition: 'transform 0.1s',
                  }}
                  className="active:translate-x-px active:translate-y-px"
                >
                  <Icon name="settings" style={{ fontSize: 14 }} />
                  管理
                </button>
              </div>

              {groupPanelOpen && (
                <div style={{ position: 'relative', marginBottom: 14 }}>
                  <div style={{ position: 'absolute', inset: 0, transform: 'translate(2.5px, 2.5px)', borderRadius: 12, background: 'var(--solid-ink)' }} />
                  <div style={{ position: 'relative', borderRadius: 12, border: '1.25px solid var(--solid-ink)', background: '#fff', padding: 14 }}>
                    {selectedGroup && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'var(--solid-ink)', color: '#fff' }}>{selectedGroup.role === 'owner' ? 'オーナー' : 'メンバー'}</span>
                        <span className="mono muted" style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatInviteCode(selectedGroup.inviteCode)}</span>
                        <button
                          type="button"
                          onClick={onCopyGroupInvite}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                            border: '1.25px solid var(--solid-ink)', background: '#fff', color: 'var(--solid-ink)',
                            cursor: 'pointer',
                          }}
                        >
                          <Icon name="content_copy" style={{ fontSize: 12 }} />コピー
                        </button>
                      </div>
                    )}
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--color-muted)', marginBottom: 12 }}>グループに参加・作成</div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      <input
                        className="ds-input"
                        value={joinGroupCode}
                        onChange={(event) => onJoinGroupCodeChange(event.target.value)}
                        placeholder="招待コードを入力"
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={onJoinGroup}
                        disabled={groupActionLoading === 'join' || !joinGroupCode.trim()}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                          border: '1.25px solid var(--solid-ink)', background: 'var(--solid-ink)', color: '#fff',
                          cursor: 'pointer', opacity: (groupActionLoading === 'join' || !joinGroupCode.trim()) ? 0.4 : 1,
                        }}
                      >
                        {groupActionLoading === 'join' ? <Icon name="progress_activity" className="animate-spin" style={{ fontSize: 14 }} /> : <Icon name="login" style={{ fontSize: 14 }} />}
                        参加
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        className="ds-input"
                        value={createGroupName}
                        onChange={(event) => onCreateGroupNameChange(event.target.value)}
                        placeholder="新しいグループ名"
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={onCreateGroup}
                        disabled={groupActionLoading === 'create' || !createGroupName.trim()}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                          border: '1.25px solid var(--solid-ink)', background: '#fff', color: 'var(--solid-ink)',
                          cursor: 'pointer', opacity: (groupActionLoading === 'create' || !createGroupName.trim()) ? 0.4 : 1,
                        }}
                      >
                        {groupActionLoading === 'create' ? <Icon name="progress_activity" className="animate-spin" style={{ fontSize: 14 }} /> : <Icon name="add" style={{ fontSize: 14 }} />}
                        作成
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                {groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => onSelectGroup(group.id)}
                    style={{ position: 'relative', display: 'block', textAlign: 'left', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                    className="active:translate-x-px active:translate-y-px"
                  >
                    <div style={{ position: 'absolute', inset: 0, transform: 'translate(2.5px, 2.5px)', borderRadius: 12, background: 'var(--solid-ink)' }} />
                    <div style={{
                      position: 'relative', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '12px 14px', borderRadius: 12,
                      border: '1.25px solid var(--solid-ink)', background: '#fff',
                      transition: 'transform 0.1s',
                    }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: desktopThumbColor(group.id), color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0,
                        border: '1.25px solid var(--solid-ink)',
                      }}>
                        {group.name.charAt(0)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</div>
                        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{group.memberCount}人 · {group.projectCount}冊</div>
                      </div>
                      <Icon name="chevron_right" style={{ fontSize: 20, flexShrink: 0, color: 'var(--color-muted)' }} />
                    </div>
                  </button>
                ))}
              </div>
              {!groupsLoading && groups.length === 0 && (
                <div style={{ position: 'relative', marginTop: 8 }}>
                  <div style={{ position: 'absolute', inset: 0, transform: 'translate(2.5px, 2.5px)', borderRadius: 12, background: 'var(--solid-ink)' }} />
                  <div style={{ position: 'relative', borderRadius: 12, border: '1.25px solid var(--solid-ink)', background: '#fff', padding: '28px 0', textAlign: 'center' }}>
                    <Icon name="group_add" style={{ fontSize: 28, opacity: 0.3, display: 'block', margin: '0 auto 6px' }} />
                    <div className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>グループに参加しましょう</div>
                  </div>
                </div>
              )}

              {groupsError && (
                <div style={{ position: 'relative', marginTop: 10 }}>
                  <div style={{ position: 'absolute', inset: 0, transform: 'translate(2px, 2px)', borderRadius: 12, background: '#991b1b' }} />
                  <div style={{ position: 'relative', borderRadius: 12, border: '1.25px solid #b91c1c', background: '#fef2f2', padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#b91c1c' }}>
                    {groupsError}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'groups' && selectedGroupId && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <button
                type="button"
                onClick={() => onSelectGroup(null)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                  border: '1.25px solid var(--solid-ink)', background: '#fff', color: 'var(--solid-ink)',
                  cursor: 'pointer', transition: 'transform 0.1s',
                }}
                className="active:translate-x-px active:translate-y-px"
              >
                <Icon name="arrow_back" style={{ fontSize: 14 }} />
                戻る
              </button>
              <h2 style={{ flex: 1, fontSize: 16, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-display)' }}>
                {selectedGroup?.name}
              </h2>
              {selectedGroup && (
                <span style={{ flexShrink: 0, padding: '3px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', fontFamily: 'var(--font-mono)', background: 'var(--solid-ink)', color: '#fff' }}>
                  {selectedGroup.role === 'owner' ? 'オーナー' : 'メンバー'}
                </span>
              )}
            </div>
            {selectedGroup && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
                padding: '10px 14px', borderRadius: 12, border: '1.25px solid var(--solid-ink)', background: '#fff',
              }}>
                <span className="mono muted" style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  招待 {formatInviteCode(selectedGroup.inviteCode)}
                </span>
                <button
                  type="button"
                  onClick={onCopyGroupInvite}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
                    padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                    border: '1.25px solid var(--solid-ink)', background: '#fff', color: 'var(--solid-ink)',
                    cursor: 'pointer',
                  }}
                >
                  <Icon name="content_copy" style={{ fontSize: 12 }} />
                  コピー
                </button>
              </div>
            )}
          </div>
        )}

        {!(activeTab === 'groups' && !selectedGroupId) && (
          <>
            {activeTab === 'groups' && groupProjectsLoading && (
              <div className="ds-card" style={{ padding: 18, marginBottom: 16, color: 'var(--color-muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <Icon name="progress_activity" className="animate-spin" />
                読み込み中...
              </div>
            )}

            {groupProjectsError && (
              <div className="ds-card" style={{ marginBottom: 16, padding: 14, color: 'var(--color-error)', borderColor: 'var(--color-error)' }}>
                {groupProjectsError}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
              {rows.map((project) => (
                <DesktopSharedCard key={project.project.id} project={project} />
              ))}
            </div>
            {rows.length === 0 && !groupProjectsLoading && (
              <div className="ds-card" style={{ padding: 42, textAlign: 'center', color: 'var(--color-muted)' }}>
                {emptyMessage}
              </div>
            )}
          </>
        )}
        {publicError && activeTab === 'public' && (
          <div className="ds-card" style={{ marginTop: 16, padding: 14, color: 'var(--color-error)', borderColor: 'var(--color-error)' }}>
            {publicError}
          </div>
        )}
        {publicNextCursor && activeTab === 'public' && (
          <button type="button" onClick={onLoadMorePublic} disabled={publicLoadingMore} className="ds-btn" style={{ marginTop: 18 }}>
            <Icon name={publicLoadingMore ? 'progress_activity' : 'expand_more'} className={publicLoadingMore ? 'animate-spin' : undefined} />
            {publicLoadingMore ? '読み込み中...' : 'もっと見る'}
          </button>
        )}
      </div>
    </div>
  );
}

function DesktopSharedCard({ project }: { project: SharedProjectCard }) {
  const href = project.project.shareId ? `/share/${project.project.shareId}` : '/shared';
  const ownerLabel = project.accessRole === 'owner'
    ? '自分'
    : project.ownerUsername
      ? `@${project.ownerUsername}`
      : '共有ユーザー';
  const subject = project.accessRole === 'owner' ? '公開中' : project.accessRole === 'editor' ? '参加中' : '共有中';

  return (
    <Link href={href} className="ds-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14, color: 'inherit', textDecoration: 'none' }}>
      <div style={{ display: 'flex', gap: 14 }}>
        <div
          className="ds-project-icon ds-project-icon--lg"
          style={{
            background: desktopThumbColor(project.project.id),
            backgroundImage: project.project.iconImage ? `url(${project.project.iconImage})` : undefined,
          }}
        >
          {!project.project.iconImage && project.project.title.charAt(0)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, lineHeight: 1.25 }}>{project.project.title}</div>
          <div className="mono muted" style={{ fontSize: 11, marginTop: 4 }}>{ownerLabel}</div>
        </div>
        <span className="ds-tag plain">{subject}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18 }}>
          {project.wordCount ?? 0}<span style={{ fontSize: 12, color: 'var(--color-secondary-text)' }}> 語</span>
        </span>
        <span className="muted" style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="thumb_up" style={{ fontSize: 15 }} />{project.likeCount ?? 0}
        </span>
      </div>
      <span className="ds-btn" style={{ width: '100%' }}><Icon name="add" />詳細を見る</span>
    </Link>
  );
}

function formatInviteCode(value: string): string {
  const compact = value.replace(/-/g, '');
  const parts: string[] = [];
  for (let index = 0; index < compact.length; index += 4) {
    parts.push(compact.slice(index, index + 4));
  }
  return parts.join('-');
}
