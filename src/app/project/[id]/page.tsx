import { redirect } from 'next/navigation';
import { getStandaloneWordbookHref } from '@/lib/notebook';

export default async function ProjectNotebookEntryPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { id } = await params;
  redirect(getStandaloneWordbookHref(id));
}
