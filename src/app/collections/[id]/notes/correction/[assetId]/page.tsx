import { NotebookCorrectionPage } from '@/components/notebook';

export default function CollectionCorrectionNotePage({
  params,
}: {
  params: {
    id: string;
    assetId: string;
  };
}) {
  return <NotebookCorrectionPage collectionId={params.id} assetId={params.assetId} />;
}
