import { NotebookNotesHomePage } from '@/components/notebook';

export default function CollectionNotesPage({
  params,
}: {
  params: {
    id: string;
  };
}) {
  return <NotebookNotesHomePage collectionId={params.id} />;
}
