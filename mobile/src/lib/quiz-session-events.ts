import { withWebAppBase } from './web-base-url';

export interface QuizSessionEventInput {
  accessToken: string;
  wordId: string;
  projectId: string | null;
  english: string;
  japanese: string;
  becameMastered: boolean;
}

export async function recordQuizSessionEvent(input: QuizSessionEventInput): Promise<void> {
  const response = await fetch(withWebAppBase('/api/quiz-sessions/events'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      wordId: input.wordId,
      projectId: input.projectId,
      english: input.english,
      japanese: input.japanese,
      becameMastered: input.becameMastered,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || 'quiz_session_event_failed');
  }
}
