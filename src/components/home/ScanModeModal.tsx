'use client';

import { useState, useEffect } from 'react';
import {
  Check,
  Sparkles,
  Camera,
  CircleDot,
  BookOpen,
  Languages,
  Highlighter,
} from 'lucide-react';
import { Button } from '@/components/ui';
import type { ExtractMode, EikenLevel } from '@/app/api/extract/route';

type ScanMode = ExtractMode;

const EIKEN_LEVELS: { value: EikenLevel; label: string }[] = [
  { value: null, label: 'フィルターなし' },
  { value: '5', label: '5級' },
  { value: '4', label: '4級' },
  { value: '3', label: '3級' },
  { value: 'pre2', label: '準2級' },
  { value: '2', label: '2級' },
  { value: 'pre1', label: '準1級' },
  { value: '1', label: '1級' },
];

export function ScanModeModal({
  isOpen,
  onClose,
  onSelectMode,
  isPro,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectMode: (mode: ScanMode, eikenLevel: EikenLevel) => void;
  isPro: boolean;
}) {
  const [showEikenPicker, setShowEikenPicker] = useState(false);
  const [selectedEiken, setSelectedEiken] = useState<EikenLevel>(null);

  useEffect(() => {
    if (isOpen) {
      setShowEikenPicker(false);
      setSelectedEiken(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  if (showEikenPicker) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="card p-6 w-full max-w-sm animate-fade-in-up">
          <h2 className="text-lg font-bold mb-2 text-center text-[var(--color-foreground)]">
            英検レベルを選択
          </h2>
          <p className="text-sm text-[var(--color-muted)] text-center mb-4">
            抽出する単語のレベルを選んでください
          </p>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {EIKEN_LEVELS.filter(l => l.value !== null).map((level) => (
              <button
                key={level.value}
                onClick={() => setSelectedEiken(level.value)}
                className={`w-full flex items-center justify-between px-4 py-3 border rounded-[var(--radius-lg)] transition-all text-left ${
                  selectedEiken === level.value
                    ? 'border-[var(--color-primary)] bg-[var(--color-peach-light)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'
                }`}
              >
                <span className="font-semibold text-[var(--color-foreground)]">{level.label}</span>
                {selectedEiken === level.value && (
                  <Check className="w-5 h-5 text-[var(--color-primary)]" />
                )}
              </button>
            ))}
          </div>

          <div className="mt-4 flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setShowEikenPicker(false)}
              className="flex-1"
            >
              戻る
            </Button>
            <Button
              onClick={() => {
                if (selectedEiken) {
                  onSelectMode('eiken', selectedEiken);
                }
              }}
              disabled={!selectedEiken}
              className="flex-1"
            >
              スキャン開始
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card p-6 w-full max-w-sm animate-fade-in-up max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold mb-2 text-center text-[var(--color-foreground)]">
          抽出モードを選択
        </h2>
        <p className="text-sm text-[var(--color-muted)] text-center mb-4">
          どのように単語を抽出しますか？
        </p>

        <div className="space-y-3">
          <button
            onClick={() => onSelectMode('all', null)}
            className="w-full flex items-center gap-4 p-4 border border-[var(--color-border)] rounded-[var(--radius-lg)] hover:border-[var(--color-primary)] hover:bg-[var(--color-peach-light)] transition-all text-left group"
          >
            <div className="w-12 h-12 bg-[var(--color-primary)]/10 rounded-full flex items-center justify-center flex-shrink-0 group-hover:bg-[var(--color-primary)]/20 transition-colors">
              <Camera className="w-6 h-6 text-[var(--color-primary)]" />
            </div>
            <div>
              <p className="font-semibold text-[var(--color-foreground)]">すべての単語を抽出</p>
              <p className="text-sm text-[var(--color-muted)]">写真内のすべての英単語を抽出します</p>
            </div>
          </button>

          <button
            onClick={() => onSelectMode('circled', null)}
            className="w-full flex items-center gap-4 p-4 border border-[var(--color-border)] rounded-[var(--radius-lg)] hover:border-[var(--color-warning)] hover:bg-[var(--color-warning-light)] transition-all text-left relative group"
          >
            <div className="w-12 h-12 bg-[var(--color-warning-light)] rounded-full flex items-center justify-center flex-shrink-0 group-hover:bg-[var(--color-warning)]/25 transition-colors">
              <CircleDot className="w-6 h-6 text-[var(--color-warning)]" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-[var(--color-foreground)]">丸をつけた単語だけ</p>
                {!isPro && (
                  <span className="chip chip-pro">
                    <Sparkles className="w-3 h-3" />
                    Pro
                  </span>
                )}
              </div>
              <p className="text-sm text-[var(--color-muted)]">マークした単語だけを抽出します</p>
            </div>
          </button>

          <button
            onClick={() => onSelectMode('highlighted', null)}
            className="w-full flex items-center gap-4 p-4 border border-[var(--color-border)] rounded-[var(--radius-lg)] hover:border-[var(--color-peach)] hover:bg-[var(--color-peach-light)] transition-all text-left relative group"
          >
            <div className="w-12 h-12 bg-[var(--color-peach-light)] rounded-full flex items-center justify-center flex-shrink-0 group-hover:bg-[var(--color-peach)]/25 transition-colors">
              <Highlighter className="w-6 h-6 text-[var(--color-peach)]" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-[var(--color-foreground)]">マーカーを引いた単語だけ</p>
                {!isPro && (
                  <span className="chip chip-pro">
                    <Sparkles className="w-3 h-3" />
                    Pro
                  </span>
                )}
              </div>
              <p className="text-sm text-[var(--color-muted)]">蛍光ペンでハイライトした単語を抽出します</p>
            </div>
          </button>

          <button
            onClick={() => setShowEikenPicker(true)}
            className="w-full flex items-center gap-4 p-4 border border-[var(--color-border)] rounded-[var(--radius-lg)] hover:border-[var(--color-peach)] hover:bg-[var(--color-peach-light)] transition-all text-left group"
          >
            <div className="w-12 h-12 bg-[var(--color-peach-light)] rounded-full flex items-center justify-center flex-shrink-0 group-hover:bg-[var(--color-peach)]/30 transition-colors">
              <BookOpen className="w-6 h-6 text-[var(--color-peach)]" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-[var(--color-foreground)]">英検レベルでフィルター</p>
                {!isPro && (
                  <span className="chip chip-pro">
                    <Sparkles className="w-3 h-3" />
                    Pro
                  </span>
                )}
              </div>
              <p className="text-sm text-[var(--color-muted)]">指定した級の単語だけを抽出します</p>
            </div>
          </button>

          <button
            onClick={() => onSelectMode('idiom', null)}
            className="w-full flex items-center gap-4 p-4 border border-[var(--color-border)] rounded-[var(--radius-lg)] hover:border-[var(--color-success)] hover:bg-[var(--color-success-light)] transition-all text-left group"
          >
            <div className="w-12 h-12 bg-[var(--color-success-light)] rounded-full flex items-center justify-center flex-shrink-0 group-hover:bg-[var(--color-success)]/30 transition-colors">
              <Languages className="w-6 h-6 text-[var(--color-success)]" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-[var(--color-foreground)]">熟語・イディオム</p>
                {!isPro && (
                  <span className="chip chip-pro">
                    <Sparkles className="w-3 h-3" />
                    Pro
                  </span>
                )}
              </div>
              <p className="text-sm text-[var(--color-muted)]">熟語・句動詞を抽出します</p>
            </div>
          </button>

        </div>
        <Button
          variant="secondary"
          onClick={onClose}
          className="mt-4 w-full"
        >
          キャンセル
        </Button>
      </div>
    </div>
  );
}
