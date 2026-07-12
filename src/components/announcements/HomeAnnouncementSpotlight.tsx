'use client';

import { useEffect, useState } from 'react';
import { GuidedTour, type TourStep } from '@/components/onboarding/GuidedTour';
import { AnnouncementBlocks } from '@/components/announcements/AnnouncementBlocks';
import type { Announcement } from '@/lib/announcements/blocks';

// 未読のお知らせをホーム中央にreact-joyrideのモーダル(target: body,
// placement: center)で1件表示する。既読管理はlocalStorageのIDベースで、
// DBへのper-user読み書きはゼロ。お知らせが無い/取得失敗時は何も表示しない。

const SEEN_STORAGE_KEY = 'merken_announcement_seen_id_v1';
// オンボーディングのツアー等と同時に開かないよう、表示は少し遅らせる
const SHOW_DELAY_MS = 2000;

function readSeenId(): string | null {
  try {
    return window.localStorage.getItem(SEEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeSeenId(id: string): void {
  try {
    window.localStorage.setItem(SEEN_STORAGE_KEY, id);
  } catch {
    // ストレージ不可なら次回また表示されるだけなので無視
  }
}

export function HomeAnnouncementSpotlight() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [run, setRun] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    fetch('/api/announcements/active')
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { announcements?: Announcement[] } | null) => {
        if (cancelled) return;
        const latest = result?.announcements?.[0];
        if (!latest || latest.id === readSeenId()) return;
        setAnnouncement(latest);
        timer = setTimeout(() => {
          if (!cancelled) setRun(true);
        }, SHOW_DELAY_MS);
      })
      .catch(() => {
        // お知らせはベストエフォート — ホーム表示をブロックしない
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!announcement || !run) return null;

  const steps: TourStep[] = [
    {
      target: 'body',
      placement: 'center',
      title: announcement.title,
      content: (
        <div className="max-h-[52vh] overflow-y-auto pr-1">
          <AnnouncementBlocks blocks={announcement.bodyBlocks} />
        </div>
      ),
    },
  ];

  const markSeen = () => {
    writeSeenId(announcement.id);
    setRun(false);
  };

  return <GuidedTour run={run} steps={steps} onFinish={markSeen} />;
}
