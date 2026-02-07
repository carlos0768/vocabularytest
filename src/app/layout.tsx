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
  title: 'MERKEN - 手入力ゼロで単語帳を作成',
  description:
    '手書きのノートやプリントを撮影するだけで、英単語と日本語訳を自動抽出し、4択クイズで学習できるアプリ',
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
    title: 'MERKEN - 手入力ゼロで単語帳を作成',
    description:
      '手書きのノートやプリントを撮影するだけで、英単語と日本語訳を自動抽出し、4択クイズで学習できるアプリ',
    siteName: 'MERKEN',
    url: 'https://merken.jp',
    images: [
      {
        url: 'https://merken.jp/icon-512.png',
        width: 512,
        height: 512,
        alt: 'MERKEN',
      },
    ],
    locale: 'ja_JP',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'MERKEN - 手入力ゼロで単語帳を作成',
    description:
      '手書きのノートやプリントを撮影するだけで、英単語と日本語訳を自動抽出し、4択クイズで学習できるアプリ',
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
