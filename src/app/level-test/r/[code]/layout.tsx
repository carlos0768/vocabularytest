import type { Metadata } from 'next';
import { EIKEN_LEVEL_LABELS } from '@/lib/level-test/engine';
import { decodeLevelTestResult } from '@/lib/level-test/result-code';
import { vocabSizeTextFor } from '@/lib/level-test/share';

// 診断結果の共有ページのメタデータ。結果はURLのcodeから復元するので
// DBアクセスは発生しない。/level-test/r/* は無限に生成できるURL空間なので
// noindexにする(診断LP /level-test だけを索引させる)。

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ code: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const payload = decodeLevelTestResult(decodeURIComponent(code));

  const pageTitle = payload
    ? `私の語彙レベルは${EIKEN_LEVEL_LABELS[payload.finalLevel]}！推定語彙数${vocabSizeTextFor(payload)}語｜MERKEN`
    : '英語語彙力レベル診断｜MERKEN';
  const description = payload
    ? `20問中${payload.correctTotal}問正解で${EIKEN_LEVEL_LABELS[payload.finalLevel]}レベル判定。あなたの語彙力は英検何級レベル？20問でサクッと診断📚`
    : 'あなたの語彙力は英検何級レベル？20問でサクッと診断。無料・登録不要。';
  const path = `/level-test/r/${code}`;

  return {
    title: pageTitle,
    description,
    robots: { index: false },
    openGraph: {
      title: pageTitle,
      description,
      url: path,
      siteName: 'MERKEN',
      type: 'website',
      locale: 'ja_JP',
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description,
    },
  };
}

export default function LevelTestResultLayout({ children }: LayoutProps) {
  return children;
}
