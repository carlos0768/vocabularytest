import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: '英語語彙力レベル診断 | MERKEN',
  description:
    '20問の4択クイズで、あなたの英語語彙力を英検5級〜1級のレベルで診断。推定語彙数も分かります。無料・登録不要。',
  openGraph: {
    title: '英語語彙力レベル診断 | MERKEN',
    description: 'あなたの語彙力は英検何級レベル? 20問でサクッと診断。無料・登録不要。',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '英語語彙力レベル診断 | MERKEN',
    description: 'あなたの語彙力は英検何級レベル? 20問でサクッと診断。無料・登録不要。',
  },
};

export default function LevelTestLayout({ children }: { children: ReactNode }) {
  return children;
}
