import { NotebookStructurePage } from '@/components/notebook';

export default function CollectionStructureNotePage({
  params,
}: {
  params: {
    id: string;
    assetId: string;
  };
}) {
  return <NotebookStructurePage collectionId={params.id} assetId={params.assetId} />;
}
