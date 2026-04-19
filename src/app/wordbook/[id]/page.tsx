import { NotebookWordbookPage } from '@/components/notebook';

export default async function StandaloneWordbookPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { id } = await params;
  return <NotebookWordbookPage assetId={id} />;
}
