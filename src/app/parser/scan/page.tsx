'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

export default function ParserScanPage() {
  const router = useRouter();

  return (
    <div className="relative flex min-h-screen flex-col bg-[var(--color-background)] pt-3 font-[var(--font-body)] lg:pt-0">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-[14px] pb-1.5 pt-1">
        <button type="button" onClick={() => router.back()} className="inline-flex h-8 w-8 items-center justify-center bg-transparent text-[var(--solid-ink)]">
          <Icon name="chevron_left" size={18} />
        </button>
        <div className="mr-8 flex-1 text-center font-display text-base font-bold text-[var(--solid-ink)]">解析スキャン</div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-[18px]">
        <div className="flex h-[200px] w-full items-center justify-center rounded-[18px] border-2 border-dashed border-[var(--solid-ink)] bg-[rgba(26,26,26,0.04)]">
          <div className="text-center">
            <Icon name="photo_camera" size={48} className="text-[var(--color-muted)]" />
            <div className="mt-3 text-sm font-bold text-[var(--solid-ink)]">長文を撮影</div>
            <div className="mt-1 text-[11px] text-[var(--color-muted)]">教科書の長文を AI が読み取り解析します</div>
          </div>
        </div>

        <div className="mt-4 flex gap-2.5">
          <div className="relative flex-1">
            <div className="absolute inset-0 translate-x-[2.5px] translate-y-[2.5px] rounded-xl bg-[var(--solid-ink)]" />
            <div className="relative flex items-center justify-center gap-1.5 rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-[var(--solid-ink)] px-6 py-3.5 text-sm font-bold text-white">
              <Icon name="photo_camera" size={16} />
              カメラ
            </div>
          </div>
          <div className="relative flex-1">
            <div className="absolute inset-0 translate-x-[2.5px] translate-y-[2.5px] rounded-xl bg-[var(--solid-ink)]" />
            <div className="relative flex items-center justify-center gap-1.5 rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-white px-6 py-3.5 text-sm font-bold text-[var(--solid-ink)]">
              <Icon name="image" size={16} />
              写真
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
