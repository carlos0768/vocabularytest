import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

export default function CorrectionLayout({ children }: { children: ReactNode }) {
  void children;
  notFound();
}
