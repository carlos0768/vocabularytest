/**
 * Mock scan functionality for testing purposes
 * 動作確認用のモックスキャン機能
 */

export interface MockWord {
  word: string;
  meaning: string;
  example: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface MockScanResult {
  success: boolean;
  words: MockWord[];
  scannedAt: string;
  imageUrl?: string;
}

/**
 * Generate mock scan results for testing
 * @param count Number of words to generate
 * @returns Mock scan result
 */
export function mockScan(count: number = 5): MockScanResult {
  const mockWords: MockWord[] = [
    {
      word: 'ephemeral',
      meaning: '短命な、はかない',
      example: 'The ephemeral beauty of cherry blossoms',
      difficulty: 'hard',
    },
    {
      word: 'ubiquitous',
      meaning: '至る所にある',
      example: 'Smartphones have become ubiquitous in modern life',
      difficulty: 'medium',
    },
    {
      word: 'serendipity',
      meaning: '偶然の幸運',
      example: 'Finding this book was pure serendipity',
      difficulty: 'hard',
    },
    {
      word: 'pragmatic',
      meaning: '実用的な',
      example: 'We need a pragmatic approach to solve this problem',
      difficulty: 'medium',
    },
    {
      word: 'resilient',
      meaning: '回復力のある',
      example: 'Children are often more resilient than adults',
      difficulty: 'easy',
    },
    {
      word: 'meticulous',
      meaning: '細心の注意を払う',
      example: 'She is meticulous about her work',
      difficulty: 'medium',
    },
    {
      word: 'eloquent',
      meaning: '雄弁な',
      example: 'The speaker gave an eloquent presentation',
      difficulty: 'medium',
    },
    {
      word: 'ambiguous',
      meaning: '曖昧な',
      example: 'The instructions were ambiguous',
      difficulty: 'easy',
    },
  ];

  const selectedWords = mockWords.slice(0, Math.min(count, mockWords.length));

  return {
    success: true,
    words: selectedWords,
    scannedAt: new Date().toISOString(),
    imageUrl: 'https://example.com/mock-image.jpg',
  };
}

/**
 * Simulate a failed scan for error handling tests
 */
export function mockScanError(): MockScanResult {
  return {
    success: false,
    words: [],
    scannedAt: new Date().toISOString(),
  };
}
