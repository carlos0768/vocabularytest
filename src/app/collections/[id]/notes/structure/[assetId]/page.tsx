import { NotebookStructurePage } from '@/components/notebook';

export default async function CollectionStructureNotePage({
  params,
}: {
  params: Promise<{
    id: string;
    assetId: string;
  }>;
}) {
  const { id, assetId } = await params;
  return <NotebookStructurePage collectionId={id} assetId={assetId} />;
}
