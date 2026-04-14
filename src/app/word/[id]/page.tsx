'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { WordDetailView } from '@/components/word/WordDetailView';

export default function WordDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const wordId = params.id as string;
  const from = searchParams.get('from');

  return (
    <WordDetailView
      wordId={wordId}
      variant="page"
      onClose={() => (from ? router.replace(decodeURIComponent(from)) : router.back())}
    />
  );
}
