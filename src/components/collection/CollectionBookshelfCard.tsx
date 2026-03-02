'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { getBookCoverColors } from '@/lib/book-cover-utils';


interface PreviewProject {
  id: string;
  title: string;
  iconImage?: string;
}

interface CollectionBookshelfCardProps {
  id: string;
  name: string;
  projectCount: number;
  wordCount: number;
  masteredCount: number;
  previews: PreviewProject[];
}

function MiniBook({ project }: { project: PreviewProject }) {
  const [colorFrom, colorTo] = getBookCoverColors(project.id);
  const initial = project.title.charAt(0).toUpperCase();

  const safeIcon =
    typeof project.iconImage === 'string' && project.iconImage.startsWith('data:image/')
      ? project.iconImage
      : null;

  return (
    <div className="relative w-[40px] h-[56px] rounded-[3px] overflow-hidden shadow-sm shrink-0 dark:brightness-75">
      {safeIcon ? (
        <span
          className="block w-full h-full bg-center bg-cover"
          style={{ backgroundImage: `url(${safeIcon})` }}
        />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center relative"
          style={{ background: `linear-gradient(145deg, ${colorFrom}, ${colorTo})` }}
        >
          <div className="absolute left-0 inset-y-0 w-[2px] bg-black/15" />
          <span className="text-white/90 text-sm font-bold leading-none">{initial}</span>
        </div>
      )}
    </div>
  );
}

export function CollectionBookshelfCard({
  id,
  name,
  projectCount,
  wordCount,
  masteredCount,
  previews,
}: CollectionBookshelfCardProps) {
  const progress = wordCount > 0 ? Math.round((masteredCount / wordCount) * 100) : 0;
  const extraCount = projectCount - previews.length;

  return (
    <Link
      href={`/collections/${id}`}
      className="block rounded-xl border-2 border-[var(--color-border)] border-b-4 bg-[var(--color-surface)] p-3 pb-2.5 active:border-b-2 active:mt-[2px] transition-all"
    >
      {/* Bookshelf area */}
      <div className="flex items-end justify-center gap-0 min-h-[68px] px-2 pt-2 pb-0">
        {previews.length === 0 ? (
          /* Empty state */
          <div className="w-full h-[56px] rounded-md border-2 border-dashed border-[var(--color-border)] flex items-center justify-center">
            <Icon name="shelves" size={20} className="text-[var(--color-muted)]" />
          </div>
        ) : (
          <>
            {previews.map((p, i) => (
              <div key={p.id} className={i > 0 ? '-ml-2' : ''}>
                <MiniBook project={p} />
              </div>
            ))}
            {extraCount > 0 && (
              <div className="-ml-1 w-[40px] h-[56px] rounded-[3px] bg-[var(--color-surface-hover)] border border-[var(--color-border)] flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-[var(--color-muted)]">+{extraCount}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Shelf line */}
      <div className="h-[2px] bg-[var(--color-border)] mt-1.5 mx-1" />

      {/* Title */}
      <p className="mt-2 text-xs font-semibold text-[var(--color-foreground)] text-center line-clamp-2 leading-tight min-h-[2rem]">
        {name}
      </p>

      {/* Stats */}
      <p className="text-[10px] text-[var(--color-muted)] text-center leading-tight">
        {projectCount}冊
        {wordCount > 0 && <> · {wordCount}語</>}
        {progress > 0 && <> · {progress}%</>}
      </p>
    </Link>
  );
}
