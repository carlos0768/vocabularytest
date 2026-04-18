import { NotebookWordbookPage } from '@/components/notebook';

export default function CollectionWordbookNotePage({
  params,
}: {
  params: {
    id: string;
    assetId: string;
  };
}) {
  return <NotebookWordbookPage collectionId={params.id} assetId={params.assetId} />;
}
