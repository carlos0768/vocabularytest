'use client';

import { Icon } from '@/components/ui';
import { SolidButton } from '@/components/redesign/SolidPage';
import type { AnnouncementBlocks as AnnouncementBlocksType } from '@/lib/announcements/blocks';

// お知らせ本文(MDSブロックJSON)のレンダラー。
// 管理画面のライブプレビューとユーザー向け表示(HomeAnnouncementSpotlight)で共用。
// 生HTMLは扱わない — announcementBlocksSchema を通ったブロックだけを
// 構造化レンダリングするので、AI生成JSONをそのまま表示しても安全。

const CALLOUT_TONES = {
  info: { border: 'var(--solid-ink)', bg: 'var(--color-accent-subtle, #ecfdf5)', icon: 'info' },
  success: { border: 'var(--color-success, #15803d)', bg: 'var(--color-success-light, #dcfce7)', icon: 'check_circle' },
  warning: { border: 'var(--color-warning, #b45309)', bg: 'var(--color-warning-light, #fef3c7)', icon: 'warning' },
} as const;

export function AnnouncementBlocks({ blocks }: { blocks: AnnouncementBlocksType }) {
  return (
    <div className="space-y-3 text-left" style={{ fontFamily: 'var(--font-body)' }}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'h2':
            return (
              <h2 key={index} className="pt-1 font-display text-[17px] font-extrabold leading-snug text-[var(--solid-ink)]">
                {block.text}
              </h2>
            );
          case 'p':
            return (
              <p key={index} className="text-[13.5px] font-medium leading-relaxed text-[var(--solid-ink)]">
                {block.text}
              </p>
            );
          case 'list':
            return (
              <ul key={index} className="space-y-1.5">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="flex items-start gap-2 text-[13.5px] font-medium leading-relaxed text-[var(--solid-ink)]">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]" />
                    <span className="min-w-0">{item}</span>
                  </li>
                ))}
              </ul>
            );
          case 'note':
            return (
              <p key={index} className="text-[12px] font-medium leading-relaxed text-[var(--color-muted)]">
                {block.text}
              </p>
            );
          case 'callout': {
            const tone = CALLOUT_TONES[block.tone ?? 'info'];
            return (
              <div
                key={index}
                className="flex items-start gap-2.5 rounded-[12px] border-2 p-3"
                style={{ borderColor: tone.border, background: tone.bg }}
              >
                <Icon name={block.icon ?? tone.icon} size={18} className="mt-0.5 shrink-0 text-[var(--solid-ink)]" />
                <div className="min-w-0">
                  {block.title && (
                    <div className="font-display text-[13px] font-extrabold text-[var(--solid-ink)]">{block.title}</div>
                  )}
                  <div className="text-[13px] font-medium leading-relaxed text-[var(--solid-ink)]">{block.text}</div>
                </div>
              </div>
            );
          }
          case 'image':
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={index}
                src={block.src}
                alt={block.alt}
                className="w-full rounded-[12px] border-2 border-[var(--solid-ink)]"
                loading="lazy"
              />
            );
          case 'button':
            return (
              <div key={index} className="pt-1">
                <SolidButton
                  href={block.href}
                  variant={block.variant ?? 'accent'}
                  size="md"
                  className="w-full"
                  iconRight="arrow_forward"
                >
                  {block.label}
                </SolidButton>
              </div>
            );
          case 'feature':
            return (
              <div key={index} className="flex items-start gap-3 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-background)] p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-accent)] text-white">
                  <Icon name={block.icon} size={17} />
                </span>
                <div className="min-w-0">
                  <div className="font-display text-[14px] font-extrabold text-[var(--solid-ink)]">{block.title}</div>
                  <div className="mt-0.5 text-[12.5px] font-medium leading-relaxed text-[var(--color-muted)]">
                    {block.description}
                  </div>
                </div>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
