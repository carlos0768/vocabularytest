'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DeleteConfirmModal, Icon, useToast } from '@/components/ui';
import { SolidPanel, SolidSectionTitle } from '@/components/redesign/SolidPage';
import { useAuth } from '@/hooks/use-auth';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import {
  MAX_EXAMPLE_GENRES,
  MAX_EXAMPLE_GENRE_LENGTH,
  SUGGESTED_EXAMPLE_GENRES,
} from '@/lib/preferences/example-genres';

type ExampleGenreSettingsProps = {
  variant?: 'mobile' | 'desktop';
};

export function ExampleGenreSettings({ variant = 'mobile' }: ExampleGenreSettingsProps) {
  const { isAuthenticated, isPro } = useAuth();
  const { showToast } = useToast();
  const { exampleGenres, loading, saving, setExampleGenres } = useUserPreferences();
  const [inputValue, setInputValue] = useState('');
  const [removalTarget, setRemovalTarget] = useState<string | null>(null);

  const busy = loading || saving;
  const atLimit = exampleGenres.length >= MAX_EXAMPLE_GENRES;
  const canEdit = isAuthenticated && isPro;

  const detail = !isAuthenticated
    ? 'ログインすると好きなジャンルを保存できます'
    : !isPro
    ? 'Proプラン限定: 例文をあなたの好きなジャンルに寄せて生成します'
    : exampleGenres.length > 0
    ? '例文をこのジャンルに寄せて生成します'
    : '好きなジャンルを登録すると、例文があなた好みになります';

  const saveGenres = async (genres: string[]) => {
    const success = await setExampleGenres(genres);
    if (!success) {
      showToast({ type: 'error', message: 'ジャンル設定の保存に失敗しました' });
    }
    return success;
  };

  const addGenre = async (rawGenre: string) => {
    if (busy) return;
    if (!isAuthenticated) {
      showToast({ type: 'warning', message: 'ジャンルを保存するにはログインしてください' });
      return;
    }
    if (!isPro) {
      showToast({ type: 'warning', message: 'ジャンル設定はProプラン限定です' });
      return;
    }

    const genre = rawGenre.trim();
    if (!genre) return;
    if (genre.length > MAX_EXAMPLE_GENRE_LENGTH) {
      showToast({ type: 'warning', message: `ジャンルは${MAX_EXAMPLE_GENRE_LENGTH}文字以内で入力してください` });
      return;
    }
    if (exampleGenres.includes(genre)) {
      showToast({ type: 'warning', message: '同じジャンルは追加できません' });
      return;
    }
    if (atLimit) {
      showToast({ type: 'warning', message: `ジャンルは最大${MAX_EXAMPLE_GENRES}件までです` });
      return;
    }

    const success = await saveGenres([...exampleGenres, genre]);
    if (success) {
      setInputValue('');
    }
  };

  const confirmRemoveGenre = async () => {
    if (busy || !removalTarget) return;
    const genre = removalTarget;
    await saveGenres(exampleGenres.filter((item) => item !== genre));
    setRemovalTarget(null);
  };

  const suggestions = SUGGESTED_EXAMPLE_GENRES.filter((genre) => !exampleGenres.includes(genre));

  const body = (
    <div className="px-5 py-4">
      {exampleGenres.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {exampleGenres.map((genre) => (
            <span
              key={genre}
              className="inline-flex items-center gap-1 rounded-full border-[1.25px] border-[var(--solid-ink)] bg-[var(--color-accent-light,oklch(0.94_0.06_130))] px-3 py-1.5 font-display text-[13px] font-bold text-[var(--solid-ink)]"
            >
              {genre}
              <button
                type="button"
                aria-label={`${genre}を削除`}
                disabled={busy}
                onClick={() => setRemovalTarget(genre)}
                className="ml-0.5 flex h-4 w-4 items-center justify-center text-[var(--color-muted)] disabled:opacity-40"
              >
                <Icon name="close" size={14} />
              </button>
            </span>
          ))}
        </div>
      )}

      {canEdit && (
        <>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={inputValue}
              maxLength={MAX_EXAMPLE_GENRE_LENGTH}
              disabled={busy || atLimit}
              placeholder={atLimit ? `最大${MAX_EXAMPLE_GENRES}件まで` : '例: サッカー、映画'}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void addGenre(inputValue);
                }
              }}
              className="min-w-0 flex-1 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white px-3 py-2 font-display text-[13px] font-bold text-[var(--solid-ink)] outline-none focus:shadow-[2px_2px_0_var(--color-accent)] disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void addGenre(inputValue)}
              disabled={busy || atLimit || !inputValue.trim()}
              className="flex items-center gap-1 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-[var(--solid-ink)] px-3.5 py-2 font-display text-[13px] font-bold text-white disabled:opacity-50"
            >
              <Icon name="add" size={16} />
              追加
            </button>
          </div>

          {suggestions.length > 0 && !atLimit && (
            <div className="mt-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
                候補から選ぶ
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {suggestions.map((genre) => (
                  <button
                    key={genre}
                    type="button"
                    disabled={busy}
                    onClick={() => void addGenre(genre)}
                    className="rounded-full border-[1.25px] border-[var(--color-border)] bg-white px-3 py-1 text-[12px] font-bold text-[var(--color-secondary-text)] disabled:opacity-40"
                  >
                    + {genre}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {isAuthenticated && !isPro && (
        <div className={exampleGenres.length > 0 ? 'mt-3' : ''}>
          <Link
            href="/subscription"
            className="flex items-center justify-center gap-1.5 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-[var(--solid-ink)] px-3.5 py-2 font-display text-[13px] font-bold text-white"
          >
            <Icon name="workspace_premium" size={16} />
            Proにアップグレードして使う
          </Link>
          {exampleGenres.length > 0 && (
            <p className="mt-2 text-[11px] leading-4 text-[var(--color-muted)]">
              登録済みのジャンルは現在反映されません。削除は可能です。
            </p>
          )}
        </div>
      )}

      <DeleteConfirmModal
        isOpen={removalTarget !== null}
        onClose={() => { if (!busy) setRemovalTarget(null); }}
        onConfirm={confirmRemoveGenre}
        title="ジャンルを削除"
        message={`「${removalTarget ?? ''}」を削除しますか？今後の例文生成に反映されなくなります。`}
        isLoading={saving}
      />
    </div>
  );

  if (variant === 'desktop') {
    return (
      <div className="ds-set-group">
        <div className="gh">例文のパーソナライズ</div>
        <div className="ds-set-row">
          <div className="ic">
            <Icon
              name="interests"
              style={exampleGenres.length > 0 ? { color: 'var(--color-accent)' } : undefined}
            />
          </div>
          <div className="lab">
            <div className="t">好きなジャンル</div>
            <div className="d">{detail}</div>
          </div>
        </div>
        {body}
      </div>
    );
  }

  return (
    <section>
      <SolidSectionTitle icon="interests" title="例文のパーソナライズ" />
      <SolidPanel className="overflow-hidden" faceClassName="!p-0">
        <div className="flex items-center gap-3 border-b border-[var(--color-border-light)] px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-surface-secondary)]">
            <Icon
              name="interests"
              size={19}
              className={exampleGenres.length > 0 ? 'text-[var(--color-accent)]' : 'text-[var(--solid-ink)]'}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--solid-ink)]">好きなジャンル</p>
            <p className="mt-0.5 text-xs leading-5 text-[var(--color-muted)]">{detail}</p>
          </div>
        </div>
        {body}
      </SolidPanel>
    </section>
  );
}
