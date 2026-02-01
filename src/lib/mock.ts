/**
 * Mock utilities for ScanVocab testing
 * Generated with assistance from Llama 3.1 8B (local)
 */

export interface MockVocabulary {
  id: string;
  english: string;
  japanese: string;
  difficulty: 'easy' | 'medium' | 'hard';
  createdAt: Date;
}

export interface MockStudySession {
  id: string;
  userId: string;
  startedAt: Date;
  endedAt: Date;
  vocabularyIds: string[];
  correctCount: number;
  incorrectCount: number;
}

export interface MockUser {
  id: string;
  email: string;
  username: string;
  createdAt: Date;
  studyStreak: number;
}

const SAMPLE_WORDS = [
  { english: 'apple', japanese: 'りんご' },
  { english: 'book', japanese: '本' },
  { english: 'computer', japanese: 'コンピュータ' },
  { english: 'dog', japanese: '犬' },
  { english: 'elephant', japanese: '象' },
  { english: 'flower', japanese: '花' },
  { english: 'guitar', japanese: 'ギター' },
  { english: 'house', japanese: '家' },
  { english: 'island', japanese: '島' },
  { english: 'journey', japanese: '旅' },
  { english: 'knowledge', japanese: '知識' },
  { english: 'library', japanese: '図書館' },
  { english: 'mountain', japanese: '山' },
  { english: 'notebook', japanese: 'ノート' },
  { english: 'ocean', japanese: '海' },
];

function randomId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function randomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Generate mock vocabulary entries
 */
export function generateMockVocabulary(count: number): MockVocabulary[] {
  const difficulties: Array<'easy' | 'medium' | 'hard'> = ['easy', 'medium', 'hard'];
  
  return Array.from({ length: count }, () => {
    const word = randomElement(SAMPLE_WORDS);
    return {
      id: randomId(),
      english: word.english,
      japanese: word.japanese,
      difficulty: randomElement(difficulties),
      createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
    };
  });
}

/**
 * Generate a mock study session
 */
export function generateMockStudySession(): MockStudySession {
  const vocabularyCount = Math.floor(Math.random() * 10) + 5;
  const correctCount = Math.floor(Math.random() * vocabularyCount);
  const startedAt = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000);
  
  return {
    id: randomId(),
    userId: randomId(),
    startedAt,
    endedAt: new Date(startedAt.getTime() + Math.random() * 30 * 60 * 1000),
    vocabularyIds: Array.from({ length: vocabularyCount }, () => randomId()),
    correctCount,
    incorrectCount: vocabularyCount - correctCount,
  };
}

/**
 * Generate a mock user
 */
export function generateMockUser(): MockUser {
  const usernames = ['tanaka', 'suzuki', 'yamamoto', 'watanabe', 'ito', 'nakamura'];
  const username = randomElement(usernames) + Math.floor(Math.random() * 1000);
  
  return {
    id: randomId(),
    email: `${username}@example.com`,
    username,
    createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
    studyStreak: Math.floor(Math.random() * 30),
  };
}
