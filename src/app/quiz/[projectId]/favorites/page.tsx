import { redirect } from 'next/navigation';

type RedirectSearchParams = Record<string, string | string[] | undefined>;

function appendSearchParams(params: URLSearchParams, source: RedirectSearchParams) {
  for (const [key, value] of Object.entries(source)) {
    if (key === 'favorites') continue;
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
}

export default async function FavoritesQuizRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<RedirectSearchParams>;
}) {
  const [{ projectId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const nextSearchParams = new URLSearchParams();
  appendSearchParams(nextSearchParams, resolvedSearchParams);
  nextSearchParams.set('favorites', '1');

  redirect(`/quiz/${encodeURIComponent(projectId)}?${nextSearchParams.toString()}`);
}
