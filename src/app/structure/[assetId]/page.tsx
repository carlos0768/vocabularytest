import { NotebookStructurePage } from '@/components/notebook';

export default async function StandaloneStructurePage({
  params,
}: {
  params: Promise<{
    assetId: string;
  }>;
}) {
  const { assetId } = await params;
  return <NotebookStructurePage assetId={assetId} />;
}
