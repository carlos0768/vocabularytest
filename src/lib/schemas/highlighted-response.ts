import { z } from 'zod';

// Schema for highlighted word extraction with enhanced detection features
// Based on research findings for Gemini 2.5 Flash capabilities

// Bounding box coordinates (normalized 0-1000 as per Gemini's output format)
export const BoundingBoxSchema = z.object({
  y_min: z.number().min(0).max(1000),
  x_min: z.number().min(0).max(1000),
  y_max: z.number().min(0).max(1000),
  x_max: z.number().min(0).max(1000),
}).optional();

// Marker color detection
export const MarkerColorSchema = z.enum([
  'yellow',
  'pink',
  'green',
  'orange',
  'blue',
  'purple',
  'unknown',
]).default('unknown');

// Single highlighted word with detection metadata
export const HighlightedWordSchema = z.object({
  // Core word data
  english: z.string(),
  japanese: z.string(),
  distractors: z.array(z.string()).default([]),

  // Example sentences (Pro feature)
  exampleSentence: z.string().optional().nullable(),
  exampleSentenceJa: z.string().optional().nullable(),

  // Highlight detection metadata
  markerColor: MarkerColorSchema.optional(),
  confidence: z.number().min(0).max(1).default(0.8),
  boundingBox: BoundingBoxSchema.optional(),

  // Context around the word (helps verify detection)
  surroundingText: z.string().optional().nullable(),
});

// Full response schema
export const HighlightedResponseSchema = z.object({
  words: z.array(HighlightedWordSchema).default([]),
  // Detection metadata
  detectedColors: z.array(MarkerColorSchema).optional(),
  totalHighlightedRegions: z.number().optional(),
});

export type HighlightedWord = z.infer<typeof HighlightedWordSchema>;
export type HighlightedResponse = z.infer<typeof HighlightedResponseSchema>;

// Confidence threshold for filtering
export const CONFIDENCE_THRESHOLD = 0.65;

// Parse and validate highlighted response
export function parseHighlightedResponse(data: unknown): {
  success: boolean;
  data?: HighlightedResponse;
  error?: string;
} {
  console.log('parseHighlightedResponse input:', JSON.stringify(data, null, 2));

  const result = HighlightedResponseSchema.safeParse(data);

  if (result.success) {
    console.log('parseHighlightedResponse success:', JSON.stringify(result.data, null, 2));
    return { success: true, data: result.data };
  }

  const errorMessages = result.error.issues
    .map((e) => `${e.path.join('.')}: ${e.message}`)
    .join(', ');

  console.error('parseHighlightedResponse error:', errorMessages);
  console.error('Zod issues:', JSON.stringify(result.error.issues, null, 2));

  return { success: false, error: 'AIの応答形式が不正です。もう一度お試しください。' };
}

// Filter words by confidence threshold
export function filterByConfidence(
  words: HighlightedWord[],
  threshold: number = CONFIDENCE_THRESHOLD
): HighlightedWord[] {
  return words.filter((word) => word.confidence >= threshold);
}

// Convert highlighted response to standard AI response format
// This ensures compatibility with existing app infrastructure
export function convertToStandardFormat(highlighted: HighlightedResponse): {
  words: Array<{
    english: string;
    japanese: string;
    distractors: string[];
    exampleSentence: string | undefined;
    exampleSentenceJa: string | undefined;
  }>;
} {
  return {
    words: highlighted.words.map((word) => ({
      english: word.english || '---',
      japanese: word.japanese || '---',
      distractors: [
        word.distractors[0] || '選択肢1',
        word.distractors[1] || '選択肢2',
        word.distractors[2] || '選択肢3',
      ],
      exampleSentence: word.exampleSentence ?? undefined,
      exampleSentenceJa: word.exampleSentenceJa ?? undefined,
    })),
  };
}

// Remove duplicate words (same english word detected multiple times)
export function removeDuplicates(words: HighlightedWord[]): HighlightedWord[] {
  const seen = new Map<string, HighlightedWord>();

  for (const word of words) {
    const key = word.english.toLowerCase().trim();
    const existing = seen.get(key);

    // Keep the one with higher confidence
    if (!existing || (word.confidence > existing.confidence)) {
      seen.set(key, word);
    }
  }

  return Array.from(seen.values());
}
