import { NotebookCreatePage } from '@/components/notebook';

export default async function CollectionNotesCreatePage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { id } = await params;
  return <NotebookCreatePage collectionId={id} />;
}
