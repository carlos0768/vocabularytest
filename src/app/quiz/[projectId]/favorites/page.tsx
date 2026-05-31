'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

export default function FavoritesQuizRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const queryString = searchParams.toString();

  useEffect(() => {
    const nextParams = new URLSearchParams(queryString);
    nextParams.set('favorites', 'true');
    const nextQuery = nextParams.toString();
    router.replace(`/quiz/${projectId}${nextQuery ? `?${nextQuery}` : ''}`);
  }, [projectId, queryString, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-[var(--solid-ink)] border-t-transparent" />
        <p className="text-[var(--color-muted)]">クイズを準備中...</p>
      </div>
    </div>
  );
}
