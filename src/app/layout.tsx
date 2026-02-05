import type { Metadata, Viewport } from 'next';
import { Manrope, Noto_Sans_JP } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { ToastProvider } from '@/components/ui/toast';
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration';
import { OfflineSyncProvider } from '@/components/pwa/OfflineSyncProvider';
import './globals.css';

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
  display: 'swap',
});

const notoSansJP = Noto_Sans_JP({
  variable: '--font-noto-sans-jp',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
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
      <body
        className={`${manrope.variable} ${notoSansJP.variable} antialiased`}
      >
        <ThemeProvider>
          <ToastProvider>
            <OfflineSyncProvider>{children}</OfflineSyncProvider>
          </ToastProvider>
          <ServiceWorkerRegistration />
        </ThemeProvider>
      </body>
    </html>
  );
}
