import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleGenerateExamplesPost } from './route';

class FakeGenerateExamplesClient {
  public updatedWordIds: string[] = [];

  auth = {
    getUser: async () => ({
      data: {
        user: { id: 'user-1' },
      },
      error: null,
    }),
  };

  from(table: string) {
    if (table !== 'words') {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      select: () => ({
        in: async () => ({
          data: [
            {
              id: 'word-1',
              example_sentence: 'Existing example',
              part_of_speech_tags: ['noun'],
              lexicon_entry_id: null,
            },
            {
              id: 'word-2',
              example_sentence: null,
              part_of_speech_tags: null,
              lexicon_entry_id: null,
            },
          ],
          error: null,
        }),
      }),
      update: (_payload: Record<string, unknown>) => ({
        eq: async (_field: string, id: string) => {
          this.updatedWordIds.push(id);
          return { error: null };
        },
      }),
    };
  }
}

function jsonRequest(body: unknown) {
  return new NextRequest('http://localhost/api/generate-examples', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

test('generate-examples accepts projectId input and skips words with existing examples', async () => {
  const prevUsageEnv = process.env.ENABLE_AI_USAGE_LIMITS;
  process.env.ENABLE_AI_USAGE_LIMITS = 'false';

  try {
    const client = new FakeGenerateExamplesClient();
    const seenWordGroups: string[][] = [];

    const res = await handleGenerateExamplesPost(
      jsonRequest({ projectId: '11111111-1111-4111-8111-111111111111' }),
      {
        createClient: async () => client as never,
        loadWordsByProjectId: async () => ([
          { id: 'word-1', english: 'apple', japanese: 'りんご' },
          { id: 'word-2', english: 'book', japanese: '本' },
        ]),
        generateExamples: async (words) => {
          seenWordGroups.push(words.map((word) => word.id));
          return {
            examples: [
              {
                wordId: 'word-2',
                partOfSpeechTags: ['noun'],
                exampleSentence: 'This book is useful.',
                exampleSentenceJa: 'この本は役に立つ。',
              },
            ],
            errors: [],
            summary: {
              requested: 1,
              generated: 1,
              failed: 0,
              retried: 0,
              retryRecovered: 0,
              failureKinds: {
                provider: 0,
                parse: 0,
                validation: 0,
                empty: 0,
              },
            },
          };
        },
        saveLexiconExamples: async () => ({ updated: 0, errors: 0 }),
      },
    );

    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.generated, 1);
    assert.equal(payload.skipped, 1);
    assert.deepEqual(seenWordGroups, [['word-2']]);
    assert.deepEqual(client.updatedWordIds, ['word-2']);
  } finally {
    if (prevUsageEnv === undefined) {
      delete process.env.ENABLE_AI_USAGE_LIMITS;
    } else {
      process.env.ENABLE_AI_USAGE_LIMITS = prevUsageEnv;
    }
  }
});
