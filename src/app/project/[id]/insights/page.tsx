import { redirect } from 'next/navigation';

type WordInsightsPageProps = {
  params: {
    id: string;
  };
};

export default function WordInsightsPage({ params }: WordInsightsPageProps) {
  redirect(`/project/${params.id}`);
}
