import { NotebookCreatePage } from '@/components/notebook';

export default function CollectionNotesCreatePage({
  params,
}: {
  params: {
    id: string;
  };
}) {
  return <NotebookCreatePage collectionId={params.id} />;
}
