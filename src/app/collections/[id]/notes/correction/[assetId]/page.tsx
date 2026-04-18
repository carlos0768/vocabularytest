import { NotebookCorrectionPage } from '@/components/notebook';

export default async function CollectionCorrectionNotePage({
  params,
}: {
  params: Promise<{
    id: string;
    assetId: string;
  }>;
}) {
  const { id, assetId } = await params;
  return <NotebookCorrectionPage collectionId={id} assetId={assetId} />;
}
