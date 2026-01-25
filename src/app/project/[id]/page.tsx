'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Redirect to home page - project detail is now integrated into home
export default function ProjectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/');
  }, [router]);

  return null;
}
