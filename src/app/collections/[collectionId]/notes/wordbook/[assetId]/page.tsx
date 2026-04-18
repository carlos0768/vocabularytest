import { NotebookWordbookPage } from '@/components/notebook';

export default function CollectionWordbookNotePage({
  params,
}: {
  params: {
    collectionId: string;
    assetId: string;
  };
}) {
  return <NotebookWordbookPage collectionId={params.collectionId} assetId={params.assetId} />;
}
