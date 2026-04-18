import { NotebookStructurePage } from '@/components/notebook';

export default function CollectionStructureNotePage({
  params,
}: {
  params: {
    collectionId: string;
    assetId: string;
  };
}) {
  return <NotebookStructurePage collectionId={params.collectionId} assetId={params.assetId} />;
}
