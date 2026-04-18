import { NotebookNotesHomePage } from '@/components/notebook';

export default async function CollectionNotesPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { id } = await params;
  return <NotebookNotesHomePage collectionId={id} />;
}
