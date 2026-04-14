'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DesktopAdSlot } from './DesktopAdSlot';

type DesktopAdFrameProps = {
  children: ReactNode;
  label: string;
  sticky?: boolean;
  className?: string;
  contentClassName?: string;
};

export function DesktopAdFrame({
  children,
  label,
  sticky = true,
  className,
  contentClassName,
}: DesktopAdFrameProps) {
  const railPositionClass = sticky ? 'sticky top-24' : 'pt-6';

  return (
    <div
      className={cn(
        'w-full min-[1360px]:grid min-[1360px]:grid-cols-[160px_minmax(0,1fr)_160px] min-[1360px]:gap-6 min-[1360px]:px-4 min-[1600px]:px-6',
        className,
      )}
    >
      <div className="hidden min-[1360px]:flex justify-end">
        <div className={cn('w-[160px]', railPositionClass)}>
          <DesktopAdSlot side="left" label={label} />
        </div>
      </div>

      <div className={cn('min-w-0', contentClassName)}>{children}</div>

      <div className="hidden min-[1360px]:flex justify-start">
        <div className={cn('w-[160px]', railPositionClass)}>
          <DesktopAdSlot side="right" label={label} />
        </div>
      </div>
    </div>
  );
}
