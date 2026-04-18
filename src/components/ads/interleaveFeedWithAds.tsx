import type { ReactNode } from 'react';

type InterleaveFeedWithAdsOptions<T> = {
  items: T[];
  every: number;
  renderItem: (item: T, index: number) => ReactNode;
  renderAd: (index: number) => ReactNode;
};

export function interleaveFeedWithAds<T>({
  items,
  every,
  renderItem,
  renderAd,
}: InterleaveFeedWithAdsOptions<T>): ReactNode[] {
  return items.flatMap((item, index) => {
    const nodes: ReactNode[] = [renderItem(item, index)];

    if ((index + 1) % every === 0 && index < items.length - 1) {
      nodes.push(renderAd(index));
    }

    return nodes;
  });
}
