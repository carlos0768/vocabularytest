import type { Metadata, Viewport } from 'next';
import { Lexend, Noto_Sans_JP, Zen_Maru_Gothic } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { ToastProvider } from '@/components/ui/toast';
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration';
import { OfflineSyncProvider } from '@/components/pwa/OfflineSyncProvider';
import { StatsSync } from '@/components/StatsSync';
import './globals.css';

const lexend = Lexend({
  variable: '--font-lexend',
  subsets: ['latin'],
  display: 'swap',
});

const notoSansJP = Noto_Sans_JP({
  variable: '--font-noto-sans-jp',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const zenMaruGothic = Zen_Maru_Gothic({
  variable: '--font-zen-maru',
  subsets: ['latin'],
  display: 'swap',
  weight: ['700', '900'],
});

export const metadata: Metadata = {
  title: 'MERKEN - 英語学習・単語帳アプリ｜写真で自動作成',
  description:
    '英語教育向け単語学習アプリ。手書きのノートやプリントを撮影するだけで英単語と日本語訳を自動抽出。4択クイズ・フラッシュカード・例文クイズで効率的に英語を学習できます。',
  keywords: ['英語学習', '単語帳', '英語教育', '教育アプリ', 'English vocabulary', 'クイズ', 'フラッシュカード', '英検対策'],
  category: 'education',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'MERKEN',
  },
  openGraph: {
    title: 'MERKEN - 英語学習・単語帳アプリ｜写真で自動作成',
    description:
      '英語教育向け単語学習アプリ。手書きのノートやプリントを撮影するだけで英単語と日本語訳を自動抽出。4択クイズ・フラッシュカード・例文クイズで効率的に英語を学習できます。',
    siteName: 'MERKEN - 英語学習アプリ',
    url: 'https://merken.jp',
    images: [
      {
        url: 'https://merken.jp/icon-512.png',
        width: 512,
        height: 512,
        alt: 'MERKEN - 英語学習・単語帳アプリ',
      },
    ],
    locale: 'ja_JP',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'MERKEN - 英語学習・単語帳アプリ｜写真で自動作成',
    description:
      '英語教育向け単語学習アプリ。写真を撮るだけで英単語帳を自動作成。4択クイズ・フラッシュカードで効率的に学習。',
    images: ['https://merken.jp/icon-512.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: 'MERKEN',
              url: 'https://merken.jp',
              description: '英語教育向け単語学習アプリ。写真を撮るだけで英単語帳を自動作成し、クイズやフラッシュカードで学習できます。',
              applicationCategory: 'EducationalApplication',
              operatingSystem: 'Web',
              inLanguage: ['ja', 'en'],
              isAccessibleForFree: true,
              educationalUse: ['自主学習', '英語学習', '単語学習', '英検対策'],
              audience: {
                '@type': 'EducationalAudience',
                educationalRole: '学生',
                audienceType: '英語学習者',
              },
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'JPY',
                description: '無料プランで基本機能を利用可能',
              },
            }),
          }}
        />
      </head>
      <body
        className={`${lexend.variable} ${notoSansJP.variable} ${zenMaruGothic.variable} antialiased`}
      >
        <ThemeProvider>
          <ToastProvider>
            <OfflineSyncProvider>{children}</OfflineSyncProvider>
          </ToastProvider>
          <StatsSync />
          <ServiceWorkerRegistration />
        </ThemeProvider>
      </body>
    </html>
  );
}
