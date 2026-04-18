import type { Metadata } from 'next';
import { LandingPageClient } from '@/components/marketing/LandingPageClient';

export const metadata: Metadata = {
  title: 'MERKEN | 手入力ゼロで単語帳を作成',
  description: '紙の勉強を、そのまま単語帳へ。MERKENはノートやプリントの写真から英単語を整理し、復習までつなげる英語学習アプリです。',
  alternates: {
    canonical: '/lp',
  },
  openGraph: {
    title: 'MERKEN | 手入力ゼロで単語帳を作成',
    description: '単語帳を作る前に止まる勉強を終わらせない。紙の教材から復習までを一本の導線に変える英語学習アプリ。',
    url: 'https://www.merken.jp/lp',
    siteName: 'MERKEN',
    type: 'website',
    locale: 'ja_JP',
    images: [
      {
        url: 'https://www.merken.jp/icon-512.png',
        width: 512,
        height: 512,
        alt: 'MERKEN',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MERKEN | 手入力ゼロで単語帳を作成',
    description: 'ノートやプリントを撮るだけ。英単語の抽出から復習までつなげる英語学習アプリ。',
    images: ['https://www.merken.jp/icon-512.png'],
  },
};

export default function LandingPage() {
  return <LandingPageClient />;
}
