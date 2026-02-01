'use client';

import { useState, useEffect, useCallback } from 'react';
import { getStreakData, recordStudy, getStreakStatus, type StreakData } from '@/lib/streak';

export function useStreak() {
  const [streakData, setStreakData] = useState<StreakData>(() => getStreakData());
  const [studiedToday, setStudiedToday] = useState(() => getStreakStatus().studiedToday);

  // Refresh from localStorage on mount (handles navigation back to home)
  useEffect(() => {
    setStreakData(getStreakData());
    setStudiedToday(getStreakStatus().studiedToday);
  }, []);

  const record = useCallback(() => {
    recordStudy();
    setStreakData(getStreakData());
    setStudiedToday(getStreakStatus().studiedToday);
  }, []);

  return {
    streakData,
    studiedToday,
    recordStudy: record,
    getStreakStatus,
  };
}
