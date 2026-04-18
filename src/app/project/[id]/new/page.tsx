import { NotebookCreatePage } from '@/components/notebook';

export default async function StandaloneNotebookCreatePage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { id } = await params;
  return <NotebookCreatePage projectId={id} />;
}
