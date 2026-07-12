'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { SolidButton } from '@/components/redesign/SolidPage';
import { LevelTestResultCard } from '@/components/level-test/LevelTestResultCard';
import { EIKEN_LEVEL_LABELS } from '@/lib/level-test/engine';
import { decodeLevelTestResult } from '@/lib/level-test/result-code';

// 共有された診断結果の公開ビューアページ。結果はURLのcodeから復元するため
// DBアクセスなし・未ログインで閲覧可能。「自分も測定する」への導線が主目的。

export default function SharedLevelTestResultPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const payload = useMemo(() => decodeLevelTestResult(decodeURIComponent(code)), [code]);

  if (!payload) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] px-4 py-16" style={{ fontFamily: 'var(--font-body)' }}>
        <div className="mx-auto w-full max-w-[420px] rounded-[20px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-8 text-center shadow-[4px_4px_0_var(--solid-ink)]">
          <Icon name="link_off" size={32} className="mx-auto text-[var(--color-muted)]" />
          <div className="mt-3 font-display text-[20px] font-extrabold text-[var(--solid-ink)]">
            この結果リンクは無効です
          </div>
          <p className="mt-2 text-[13px] font-bold leading-relaxed text-[var(--color-muted)]">
            リンクが途中で切れているか、形式が正しくない可能性があります。
          </p>
          <SolidButton variant="accent" size="lg" className="mt-6 w-full" href="/level-test" iconRight="arrow_forward">
            自分の語彙レベルを測定する
          </SolidButton>
        </div>
      </div>
    );
  }

  const grade = EIKEN_LEVEL_LABELS[payload.finalLevel];

  return (
    <div className="min-h-screen bg-[var(--color-background)] px-4 py-8" style={{ fontFamily: 'var(--font-body)' }}>
      <div className="mx-auto w-full max-w-[480px]">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-[13px] font-bold text-[var(--color-muted)]">
          <Icon name="arrow_back" size={16} />
          MERKEN
        </Link>

        <div className="mb-4 text-center font-display text-[20px] font-extrabold text-[var(--solid-ink)]">
          {grade}レベルの診断結果
        </div>

        <LevelTestResultCard payload={payload} variant="viewer" />

        <div className="mt-6 rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-5 text-center shadow-[3px_3px_0_var(--solid-ink)]">
          <div className="font-display text-[17px] font-extrabold text-[var(--solid-ink)]">
            あなたの語彙力は英検何級レベル?
          </div>
          <p className="mt-1 text-[12px] font-bold text-[var(--color-muted)]">
            20問・約3分。無料・登録不要でいますぐ診断できます。
          </p>
          <SolidButton variant="accent" size="lg" className="mt-4 w-full" href="/level-test" iconRight="arrow_forward">
            自分も測定する
          </SolidButton>
          <Link href="/" className="mt-3 inline-block text-[12px] font-bold text-[var(--color-muted)] underline">
            MERKENについて詳しく見る
          </Link>
        </div>
      </div>
    </div>
  );
}
