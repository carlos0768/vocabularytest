import { NotebookWordbookPage } from '@/components/notebook';

export default async function CollectionWordbookNotePage({
  params,
}: {
  params: Promise<{
    id: string;
    assetId: string;
  }>;
}) {
  const { id, assetId } = await params;
  return <NotebookWordbookPage collectionId={id} assetId={assetId} />;
}
