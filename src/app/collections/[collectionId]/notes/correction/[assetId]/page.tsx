import { NotebookCorrectionPage } from '@/components/notebook';

export default function CollectionCorrectionNotePage({
  params,
}: {
  params: {
    collectionId: string;
    assetId: string;
  };
}) {
  return <NotebookCorrectionPage collectionId={params.collectionId} assetId={params.assetId} />;
}
