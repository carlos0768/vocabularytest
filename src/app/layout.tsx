import type { Metadata, Viewport } from 'next';
import { Lexend, Noto_Sans_JP } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { ToastProvider } from '@/components/ui/toast';
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration';
import { OfflineSyncProvider } from '@/components/pwa/OfflineSyncProvider';
import { StatsSync } from '@/components/StatsSync';
import { PersistentAppShell } from '@/components/ui/PersistentAppShell';
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
  weight: ['400', '500', '700'],
});


export const metadata: Metadata = {
  metadataBase: new URL('https://www.merken.jp'),
  title: 'MERKEN - 画像を撮るだけで単語帳登録｜カスタム単語帳アプリ',
  description:
    '画像を撮るだけで英単語を自動抽出して単語帳に登録。マークした単語だけを単語帳に登録することも可能。自分だけのカスタム単語帳を作成し、4択クイズ・フラッシュカード・例文クイズで効率的に学習できます。',
  keywords: ['画像を撮るだけで単語帳登録', 'マークした単語だけ単語帳に登録', 'カスタム単語帳', '英語学習', '単語帳アプリ', '英検対策'],
  category: 'education',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MERKEN',
  },
  openGraph: {
    title: 'MERKEN - 画像を撮るだけで単語帳登録｜カスタム単語帳アプリ',
    description:
      '画像を撮るだけで英単語を自動抽出して単語帳に登録。マークした単語だけを登録することも可能。自分だけのカスタム単語帳で効率的に学習。',
    siteName: 'MERKEN',
    url: 'https://www.merken.jp',
    images: [
      {
        url: 'https://www.merken.jp/icon-512.png',
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
    title: 'MERKEN - 画像を撮るだけで単語帳登録｜カスタム単語帳アプリ',
    description:
      '画像を撮るだけで単語帳登録。マークした単語だけ登録も可能。カスタム単語帳でクイズ・フラッシュカード学習。',
    images: ['https://www.merken.jp/icon-512.png'],
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
          fetchPriority="low"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: 'MERKEN',
              url: 'https://www.merken.jp',
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
        className={`${lexend.variable} ${notoSansJP.variable} antialiased`}
      >
        <ThemeProvider>
          <ToastProvider>
            <OfflineSyncProvider>
              <PersistentAppShell>{children}</PersistentAppShell>
            </OfflineSyncProvider>
          </ToastProvider>
          <StatsSync />
          <ServiceWorkerRegistration />
        </ThemeProvider>
      </body>
    </html>
  );
}
