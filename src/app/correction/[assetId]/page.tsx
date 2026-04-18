import { NotebookCorrectionPage } from '@/components/notebook';

export default async function StandaloneCorrectionPage({
  params,
}: {
  params: Promise<{
    assetId: string;
  }>;
}) {
  const { assetId } = await params;
  return <NotebookCorrectionPage assetId={assetId} />;
}
