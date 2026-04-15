import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPassageMatchUserPrompt,
  computeAiHighlightRanges,
  filterCandidatesForAi,
  matchPassageWords,
  parsePassageMatchResponse,
  sanitizeMatches,
  shouldSendToAi,
  type PassageMatchCandidate,
} from './match-passage-words';

test('shouldSendToAi: multi-word phrases always use AI matching', () => {
  assert.equal(shouldSendToAi({ english: 'any other ~ than A' }), true);
  assert.equal(
    shouldSendToAi({ english: 'make up for', partOfSpeechTags: ['phrasal_verb'] }),
    true,
  );
  assert.equal(shouldSendToAi({ english: 'ice cream' }), true); // multi-word noun → still AI
});

test('shouldSendToAi: single-word nouns and adjectives are skipped', () => {
  assert.equal(
    shouldSendToAi({ english: 'dog', partOfSpeechTags: ['noun'] }),
    false,
  );
  assert.equal(
    shouldSendToAi({ english: 'beautiful', partOfSpeechTags: ['adjective'] }),
    false,
  );
});

test('shouldSendToAi: single-word verbs/adverbs/prepositions use AI matching', () => {
  assert.equal(
    shouldSendToAi({ english: 'run', partOfSpeechTags: ['verb'] }),
    true,
  );
  assert.equal(
    shouldSendToAi({ english: 'quickly', partOfSpeechTags: ['adverb'] }),
    true,
  );
  assert.equal(
    shouldSendToAi({ english: 'above', partOfSpeechTags: ['preposition'] }),
    true,
  );
});

test('shouldSendToAi: unknown POS on a single word is NOT sent (regex handles it)', () => {
  assert.equal(shouldSendToAi({ english: 'foo' }), false);
  assert.equal(shouldSendToAi({ english: '   ' }), false);
});

test('filterCandidatesForAi dedupes by id and skips nouns/adjectives', () => {
  const candidates: PassageMatchCandidate[] = [
    { id: 'a', english: 'run', partOfSpeechTags: ['verb'] },
    { id: 'a', english: 'run', partOfSpeechTags: ['verb'] }, // duplicate id
    { id: 'b', english: 'dog', partOfSpeechTags: ['noun'] }, // skipped
    { id: 'c', english: 'any other ~ than A' }, // multi-word
  ];
  const result = filterCandidatesForAi(candidates);
  assert.deepEqual(
    result.map((c) => c.id),
    ['a', 'c'],
  );
});

test('buildPassageMatchUserPrompt embeds the passage and escapes word strings', () => {
  const prompt = buildPassageMatchUserPrompt('Hello "world"', [
    { id: 'x', english: 'any other ~ than A' },
  ]);
  assert.match(prompt, /【本文】\nHello "world"/);
  assert.match(prompt, /id: x/);
  assert.match(prompt, /"any other ~ than A"/);
});

test('parsePassageMatchResponse accepts a bare JSON object', () => {
  const result = parsePassageMatchResponse(
    '{"matches":[{"id":"w1","matchedText":"running fast"}]}',
  );
  assert.deepEqual(result.matches, [
    { id: 'w1', matchedText: 'running fast' },
  ]);
});

test('parsePassageMatchResponse accepts JSON inside a markdown code fence', () => {
  const result = parsePassageMatchResponse(
    '```json\n{"matches":[{"id":"w2","matchedText":"ran quickly"}]}\n```',
  );
  assert.deepEqual(result.matches, [
    { id: 'w2', matchedText: 'ran quickly' },
  ]);
});

test('parsePassageMatchResponse defaults missing matches to empty array', () => {
  const result = parsePassageMatchResponse('{}');
  assert.deepEqual(result.matches, []);
});

test('parsePassageMatchResponse throws on invalid shape', () => {
  assert.throws(
    () => parsePassageMatchResponse('{"matches":[{"id":"","matchedText":"x"}]}'),
    /Invalid passage-match response/,
  );
});

test('sanitizeMatches drops entries whose matchedText is not in the passage', () => {
  const ids = new Set(['w1', 'w2']);
  const result = sanitizeMatches(
    {
      matches: [
        { id: 'w1', matchedText: 'running fast' },
        { id: 'w1', matchedText: 'hallucinated phrase' },
        { id: 'unknown', matchedText: 'running fast' }, // id not in set
      ],
    },
    'She was running fast toward the station.',
    ids,
  );
  assert.deepEqual(result.matches, [
    { id: 'w1', matchedText: 'running fast' },
  ]);
});

test('computeAiHighlightRanges resolves each match to distinct occurrences', () => {
  const text = 'run, then run, then run again';
  const ranges = computeAiHighlightRanges(text, [
    { id: 'w', matchedText: 'run' },
    { id: 'w', matchedText: 'run' },
    { id: 'w', matchedText: 'run' },
  ]);
  assert.deepEqual(
    ranges.map((r) => text.slice(r.start, r.end)),
    ['run', 'run', 'run'],
  );
  // They should be at strictly increasing start positions.
  assert.ok(ranges[0].start < ranges[1].start);
  assert.ok(ranges[1].start < ranges[2].start);
});

test('computeAiHighlightRanges drops overlapping ranges, keeping the earlier (longer) span', () => {
  const text = 'a sudden surge in electricity demand';
  const ranges = computeAiHighlightRanges(text, [
    { id: 'phrase', matchedText: 'a sudden surge in electricity' },
    { id: 'shorter', matchedText: 'sudden surge' }, // overlaps with the above
  ]);
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0].wordId, 'phrase');
  assert.equal(
    text.slice(ranges[0].start, ranges[0].end),
    'a sudden surge in electricity',
  );
});

test('computeAiHighlightRanges silently drops missing matchedText', () => {
  const ranges = computeAiHighlightRanges('hello world', [
    { id: 'x', matchedText: 'not present' },
  ]);
  assert.deepEqual(ranges, []);
});

test('matchPassageWords: returns empty result when no eligible candidates', async () => {
  let called = false;
  const result = await matchPassageWords(
    {
      text: 'The dog is happy.',
      candidates: [
        { id: '1', english: 'dog', partOfSpeechTags: ['noun'] },
        { id: '2', english: 'happy', partOfSpeechTags: ['adjective'] },
      ],
    },
    {
      generateText: async () => {
        called = true;
        return { success: true, content: '{}' };
      },
    },
  );
  assert.deepEqual(result.matches, []);
  assert.equal(called, false, 'should not call AI when no eligible candidates');
});

test('matchPassageWords: sends eligible candidates and sanitizes response', async () => {
  const text = 'Do you speak any other language than english?';
  const result = await matchPassageWords(
    {
      text,
      candidates: [
        { id: 'phrase', english: 'any other ~ than A' },
        { id: 'noun', english: 'english', partOfSpeechTags: ['noun'] }, // filtered
      ],
    },
    {
      generateText: async (systemPrompt, userPrompt) => {
        assert.match(systemPrompt, /matchedText/);
        assert.match(userPrompt, /any other ~ than A/);
        // Sanity: the noun should have been filtered out.
        assert.doesNotMatch(userPrompt, /id: noun/);
        return {
          success: true,
          content: JSON.stringify({
            matches: [
              { id: 'phrase', matchedText: 'any other language than english' },
              { id: 'phrase', matchedText: 'hallucinated extra' },
            ],
          }),
        };
      },
    },
  );
  assert.deepEqual(result.matches, [
    { id: 'phrase', matchedText: 'any other language than english' },
  ]);
});

test('matchPassageWords: propagates provider failures as thrown errors', async () => {
  await assert.rejects(
    () =>
      matchPassageWords(
        {
          text: 'Running is fun.',
          candidates: [{ id: 'v', english: 'run', partOfSpeechTags: ['verb'] }],
        },
        {
          generateText: async () => ({
            success: false,
            error: 'boom',
          }),
        },
      ),
    /Passage match generation failed: boom/,
  );
});

test('matchPassageWords: empty text short-circuits', async () => {
  let called = false;
  const result = await matchPassageWords(
    {
      text: '   ',
      candidates: [{ id: 'v', english: 'run', partOfSpeechTags: ['verb'] }],
    },
    {
      generateText: async () => {
        called = true;
        return { success: true, content: '{}' };
      },
    },
  );
  assert.deepEqual(result.matches, []);
  assert.equal(called, false);
});
