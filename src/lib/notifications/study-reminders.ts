export type StudyReminderTime = {
  id: string;
  time: string;
  enabled: boolean;
};

export type StudyReminderPeriod = {
  label: string;
  icon: string;
  tint: string;
  color: string;
};

export type DueStudyReminderCandidate = {
  time: StudyReminderTime;
  localDateKey: string;
};

export const DEFAULT_STUDY_REMINDER_TIMEZONE = 'Asia/Tokyo';
export const DEFAULT_STUDY_REMINDER_ENABLED = true;
export const MAX_STUDY_REMINDER_TIMES = 6;
export const STUDY_REMINDER_DISPATCH_GRACE_MINUTES = 3;
export const DEFAULT_STUDY_REMINDER_TIMES: StudyReminderTime[] = [
  { id: 'morning', time: '08:00', enabled: true },
  { id: 'evening', time: '16:30', enabled: true },
];

const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

export function isValidStudyReminderTimeValue(value: string): boolean {
  return TIME_PATTERN.test(value);
}

export function isValidStudyReminderId(value: string): boolean {
  return ID_PATTERN.test(value);
}

export function normalizeStudyReminderTimes(value: unknown): StudyReminderTime[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_STUDY_REMINDER_TIMES];
  }

  const seenIds = new Set<string>();
  const seenTimes = new Set<string>();
  const normalized: StudyReminderTime[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Partial<StudyReminderTime>;
    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.time !== 'string' ||
      typeof candidate.enabled !== 'boolean' ||
      !isValidStudyReminderId(candidate.id) ||
      !isValidStudyReminderTimeValue(candidate.time) ||
      seenIds.has(candidate.id) ||
      seenTimes.has(candidate.time)
    ) {
      continue;
    }

    seenIds.add(candidate.id);
    seenTimes.add(candidate.time);
    normalized.push({
      id: candidate.id,
      time: candidate.time,
      enabled: candidate.enabled,
    });

    if (normalized.length >= MAX_STUDY_REMINDER_TIMES) break;
  }

  return normalized.length > 0 ? normalized : [...DEFAULT_STUDY_REMINDER_TIMES];
}

export function getStudyReminderPeriod(time: string): StudyReminderPeriod {
  const hour = Number.parseInt((time || '00:00').split(':')[0] ?? '0', 10);

  if (hour < 5) {
    return {
      label: '深夜',
      icon: 'bedtime',
      tint: 'var(--color-surface-secondary)',
      color: 'var(--color-secondary-text)',
    };
  }

  if (hour < 11) {
    return {
      label: '朝',
      icon: 'wb_sunny',
      tint: 'rgba(249,115,22,0.12)',
      color: '#ea580c',
    };
  }

  if (hour < 15) {
    return {
      label: '昼',
      icon: 'light_mode',
      tint: 'rgba(234,179,8,0.14)',
      color: '#a16207',
    };
  }

  if (hour < 18) {
    return {
      label: '夕方',
      icon: 'wb_twilight',
      tint: 'rgba(217,119,6,0.12)',
      color: '#b45309',
    };
  }

  return {
    label: '夜',
    icon: 'bedtime',
    tint: 'rgba(79,70,229,0.10)',
    color: '#4f46e5',
  };
}

export function isSupportedTimeZone(value: string | null | undefined): value is string {
  if (!value || value.length > 100) return false;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function getBrowserStudyReminderTimeZone(): string {
  if (typeof Intl === 'undefined') return DEFAULT_STUDY_REMINDER_TIMEZONE;

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isSupportedTimeZone(timeZone) ? timeZone : DEFAULT_STUDY_REMINDER_TIMEZONE;
}

export function getLocalDateTimeParts(
  date: Date,
  timeZone: string,
): { dateKey: string; time: string } {
  const safeTimeZone = isSupportedTimeZone(timeZone)
    ? timeZone
    : DEFAULT_STUDY_REMINDER_TIMEZONE;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function getDueStudyReminderTimes(
  times: StudyReminderTime[],
  localTime: string,
): StudyReminderTime[] {
  return times.filter((time) => time.enabled && time.time === localTime);
}

export function getDueStudyReminderCandidates(params: {
  times: StudyReminderTime[];
  now: Date;
  timeZone: string;
  graceMinutes?: number;
}): DueStudyReminderCandidate[] {
  const graceMinutes = Math.max(0, Math.min(params.graceMinutes ?? 0, 15));
  const candidates: DueStudyReminderCandidate[] = [];
  const seen = new Set<string>();

  for (let minuteOffset = 0; minuteOffset <= graceMinutes; minuteOffset += 1) {
    const local = getLocalDateTimeParts(
      new Date(params.now.getTime() - minuteOffset * 60_000),
      params.timeZone,
    );
    const dueTimes = getDueStudyReminderTimes(params.times, local.time);

    for (const time of dueTimes) {
      const key = `${local.dateKey}:${time.id}:${time.time}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        time,
        localDateKey: local.dateKey,
      });
    }
  }

  return candidates;
}

export function createStudyReminderDeliveryKey(params: {
  timeZone: string;
  localDateKey: string;
  reminderTime: string;
}): string {
  return `${params.timeZone}:${params.localDateKey}:${params.reminderTime}`;
}
