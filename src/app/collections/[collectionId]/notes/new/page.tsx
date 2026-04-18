import { NotebookCreatePage } from '@/components/notebook';

export default function CollectionNotesCreatePage({
  params,
}: {
  params: {
    collectionId: string;
  };
}) {
  return <NotebookCreatePage collectionId={params.collectionId} />;
}
