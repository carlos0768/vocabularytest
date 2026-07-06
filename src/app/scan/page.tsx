'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DesktopScanView } from '@/components/desktop/DesktopScan';
import { ScanCaptureModal } from '@/components/home/ScanCaptureModal';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { excludeReelSavedProjects } from '@/lib/reels/saved-words';
import { getGuestUserId } from '@/lib/utils';
import type { Project, SubscriptionStatus } from '@/types';

export default function ScanPage() {
  const router = useRouter();
  const { user, subscription, isPro, loading: authLoading } = useAuth();
  const [targetProjectId, setTargetProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [targetProject, setTargetProject] = useState<Project | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(true);

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  useEffect(() => {
    setTargetProjectId(new URLSearchParams(window.location.search).get('projectId'));
  }, []);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    const loadProjects = async () => {
      setProjectsLoading(true);
      try {
        const userId = user ? user.id : getGuestUserId();
        const loadedProjects = excludeReelSavedProjects(await repository.getProjects(userId));
        const sorted = [...loadedProjects].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const target = targetProjectId
          ? (sorted.find((project) => project.id === targetProjectId) ?? await repository.getProject(targetProjectId).catch(() => null)) ?? null
          : null;

        if (!cancelled) {
          setProjects(sorted.filter((project) => project.id !== targetProjectId));
          setTargetProject(target);
        }
      } catch (error) {
        console.error('Failed to load scan projects:', error);
        if (!cancelled) {
          setProjects([]);
          setTargetProject(null);
        }
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    };

    void loadProjects();
    return () => {
      cancelled = true;
    };
  }, [authLoading, repository, targetProjectId, user]);

  return (
    <>
      <DesktopScanView
        projects={projects}
        loadingProjects={projectsLoading}
        targetProjectId={targetProjectId}
        targetProjectTitle={targetProject?.title}
        isPro={isPro}
      />
      <div className="lg:hidden">
        <ScanCaptureModal
          isOpen
          onClose={() => router.push('/')}
          defaultMode="vocab"
          targetProjectId={targetProjectId ?? undefined}
          targetProjectTitle={targetProject?.title}
        />
      </div>
    </>
  );
}
