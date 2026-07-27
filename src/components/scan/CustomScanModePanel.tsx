'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useCustomScanModes } from '@/hooks/use-custom-scan-modes';
import {
  CUSTOM_SCAN_MODE_EXAMPLES,
  MAX_CUSTOM_SCAN_MODE_NAME_LENGTH,
  MAX_CUSTOM_SCAN_MODE_PROMPT_LENGTH,
} from '@/lib/scan/custom-modes';

export interface CustomScanModeSelection {
  /** 保存済みモードを選んでいる場合のID。未保存の入力なら null */
  modeId: string | null;
  /** 実際にAIへ渡す抽出指示 */
  prompt: string;
}

/**
 * カスタム抽出モード（ユーザ定義プロンプト）の入力・保存・選択UI。
 * モバイル(ScanCapturePanel)とデスクトップ(DesktopScan)で共有する。
 *
 * 「どの単語を抽出するか」だけをユーザが書く。出力フォーマットはサーバー側の
 * テンプレートが固定するため、ここでの入力がJSON契約を壊すことはない。
 */
export function CustomScanModePanel({
  selection,
  onChange,
}: {
  selection: CustomScanModeSelection;
  onChange: (selection: CustomScanModeSelection) => void;
}) {
  const { modes, loading, error, canSaveMore, limit, createMode, deleteMode } = useCustomScanModes();
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const promptLength = selection.prompt.length;
  const promptTooLong = promptLength > MAX_CUSTOM_SCAN_MODE_PROMPT_LENGTH;
  const canSave = selection.prompt.trim().length > 0 && !promptTooLong;

  const handlePromptChange = (value: string) => {
    // 保存済みモードの文面を編集したら「その場限りの入力」に切り替える
    onChange({ modeId: null, prompt: value });
  };

  const handleSelectSaved = (id: string, prompt: string) => {
    if (selection.modeId === id) {
      onChange({ modeId: null, prompt: '' });
      return;
    }
    onChange({ modeId: id, prompt });
  };

  const handleSave = async () => {
    setActionError(null);
    setSaving(true);
    try {
      const created = await createMode({ name: saveName, prompt: selection.prompt });
      onChange({ modeId: created.id, prompt: created.prompt });
      setSaveOpen(false);
      setSaveName('');
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setActionError(null);
    try {
      await deleteMode(id);
      if (selection.modeId === id) {
        onChange({ modeId: null, prompt: selection.prompt });
      }
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : '削除に失敗しました');
    }
  };

  return (
    <div className="mt-2.5 pt-2.5" style={{ borderTop: '1px dashed var(--solid-ink)' }}>
      {/* 保存済みモード */}
      {(modes.length > 0 || loading) && (
        <>
          <div className="mb-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
            保存したモード（{modes.length}/{limit}）
          </div>
          {loading && modes.length === 0 ? (
            <p className="mb-2 text-[10px] text-[var(--color-muted)]">読み込み中...</p>
          ) : (
            <div className="mb-2.5 flex flex-wrap gap-[6px]">
              {modes.map((mode) => {
                const on = selection.modeId === mode.id;
                return (
                  <span
                    key={mode.id}
                    className="inline-flex items-center gap-1 rounded-[8px] border-2 py-1.5 pl-2.5 pr-1.5 text-[11px] font-bold transition-all"
                    style={{
                      borderColor: on ? 'var(--solid-ink)' : 'var(--color-border)',
                      background: on ? 'var(--color-accent)' : '#fff',
                      color: on ? '#fff' : 'var(--solid-ink)',
                      boxShadow: on ? '1.5px 1.5px 0 var(--solid-ink)' : 'none',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectSaved(mode.id, mode.prompt)}
                      className="max-w-[160px] truncate text-left"
                      title={mode.prompt}
                    >
                      {mode.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(mode.id)}
                      aria-label={`${mode.name}を削除`}
                      className="opacity-60 transition-opacity hover:opacity-100"
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* プロンプト入力 */}
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
          抽出プロンプト
        </span>
        <span
          className="font-mono text-[9px] font-bold"
          style={{ color: promptTooLong ? 'var(--color-error)' : 'var(--color-muted)' }}
        >
          {promptLength}/{MAX_CUSTOM_SCAN_MODE_PROMPT_LENGTH}
        </span>
      </div>
      <textarea
        value={selection.prompt}
        onChange={(event) => handlePromptChange(event.target.value)}
        rows={4}
        placeholder="例: 赤ペンで書かれた単語だけを抽出してください。黒字の単語は抽出しないでください。"
        className="w-full rounded-[10px] border-2 bg-white px-3 py-2.5 text-[12px] leading-[1.6] text-[var(--solid-ink)] outline-none"
        style={{ borderColor: promptTooLong ? 'var(--color-error)' : 'var(--color-border)' }}
      />
      <p className="mt-1 text-[10px] leading-[1.5] text-[var(--color-muted)]">
        「どの単語を抽出するか」を書いてください。訳・品詞・例文の形式はアプリ側で自動的に整えます。
      </p>
      {!canSave && selection.modeId === null && (
        <p className="mt-1 text-[10px] font-bold text-[var(--color-muted)]">
          {promptTooLong
            ? `プロンプトは${MAX_CUSTOM_SCAN_MODE_PROMPT_LENGTH}文字以内にしてください`
            : 'プロンプトを入力するか、保存したモードを選ぶとスキャンできます'}
        </p>
      )}

      {/* 入力例 */}
      {selection.prompt.trim().length === 0 && (
        <div className="mt-2 flex flex-wrap gap-[6px]">
          {CUSTOM_SCAN_MODE_EXAMPLES.map((example) => (
            <button
              key={example.name}
              type="button"
              onClick={() => onChange({ modeId: null, prompt: example.prompt })}
              className="rounded-[8px] border border-dashed border-[var(--color-border)] bg-white px-2.5 py-1.5 text-[10px] font-bold text-[var(--color-muted)]"
            >
              {example.name}
            </button>
          ))}
        </div>
      )}

      {/* モードとして保存 */}
      {selection.modeId === null && canSave && (
        saveOpen ? (
          <div className="mt-2.5 rounded-[10px] border-2 border-[var(--color-border)] bg-white p-2.5">
            <input
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              maxLength={MAX_CUSTOM_SCAN_MODE_NAME_LENGTH}
              placeholder="モード名（例: 赤ペンの単語だけ）"
              className="w-full rounded-[8px] border-2 border-[var(--color-border)] px-2.5 py-2 text-[12px] text-[var(--solid-ink)] outline-none"
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => { setSaveOpen(false); setActionError(null); }}
                className="flex-1 rounded-[8px] border-2 border-[var(--color-border)] py-2 text-[11px] font-bold text-[var(--color-muted)]"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || saveName.trim().length === 0}
                className="flex-1 rounded-[8px] border-2 border-[var(--solid-ink)] bg-[var(--color-accent)] py-2 text-[11px] font-bold text-white disabled:opacity-40"
              >
                {saving ? '保存中...' : '保存する'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSaveOpen(true)}
            disabled={!canSaveMore}
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-[10px] border-2 border-dashed border-[var(--solid-ink)] bg-white py-2.5 text-[11px] font-bold text-[var(--solid-ink)] disabled:opacity-40"
          >
            <Icon name="bookmark_add" size={14} />
            {canSaveMore ? 'このプロンプトをモードとして保存' : `保存できるのは${limit}個までです`}
          </button>
        )
      )}

      {(actionError || error) && (
        <p className="mt-2 text-[10px] text-[var(--color-error)]">{actionError ?? error}</p>
      )}
    </div>
  );
}
