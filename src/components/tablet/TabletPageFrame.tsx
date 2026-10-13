import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * タブレットでスマホ由来のページを中央 760px のカラムに収める明示的な枠。
 *
 * 通常は tablet.css の汎用ルール (`.ds-live-main` 直下を 760px に寄せる) で足りる。
 * ルートが Fragment で複数要素になるページや、枠の幅を変えたいページだけこれで包む。
 * `tb-bleed` を付けた要素は汎用ルールから外れるので、この枠自身は bleed にして
 * 内側で幅を決める。
 */
export function TabletPageFrame({
  children,
  className,
  maxWidth = 760,
}: {
  children: ReactNode;
  className?: string;
  maxWidth?: number;
}) {
  return (
    <div className={cn('tb-bleed mx-auto w-full', className)} style={{ maxWidth }}>
      {children}
    </div>
  );
}
