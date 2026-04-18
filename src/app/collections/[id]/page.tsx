import { redirect } from 'next/navigation';

export default async function CollectionPageRedirect({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { id } = await params;
  redirect(`/collections/${id}/notes`);
}
