import { NotebookNotesHomePage } from '@/components/notebook';

export default function CollectionNotesPage({
  params,
}: {
  params: {
    collectionId: string;
  };
}) {
  return <NotebookNotesHomePage collectionId={params.collectionId} />;
}
