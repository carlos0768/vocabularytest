import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildVoiceQuizPromptRequest,
  buildVoiceQuizPromptResults,
  promptLeaksAnswer,
  VOICE_QUIZ_PROMPT_RESPONSE_SCHEMA,
} from './generate-voice-quiz-prompt';

test('VOICE_QUIZ_PROMPT_RESPONSE_SCHEMA mirrors the results/{id,prompt} shape', () => {
  assert.equal(VOICE_QUIZ_PROMPT_RESPONSE_SCHEMA.type, 'OBJECT');
  assert.deepEqual(VOICE_QUIZ_PROMPT_RESPONSE_SCHEMA.required, ['results']);
  const item = VOICE_QUIZ_PROMPT_RESPONSE_SCHEMA.properties?.results?.items;
  assert.equal(item?.type, 'OBJECT');
  assert.deepEqual(item?.required, ['id', 'prompt']);
});

const word = {
  id: 'word-1',
  english: 'clarify',
  japanese: '明確にする',
};

test('buildVoiceQuizPromptRequest includes the word list and the no-spoiler rule', () => {
  const prompt = buildVoiceQuizPromptRequest([word]);

  assert.match(prompt, /英単語そのもの・そのスペル・カタカナ読みを絶対に含めない/);
  assert.match(prompt, /ID: word-1 \/ 英語: clarify \/ 日本語（正解）: 明確にする/);
});

test('buildVoiceQuizPromptRequest includes the example sentence when provided', () => {
  const prompt = buildVoiceQuizPromptRequest([{ ...word, exampleSentence: 'Please clarify your point.' }]);
  assert.match(prompt, /例文: Please clarify your point\./);
});

test('promptLeaksAnswer detects the English word inside the generated prompt', () => {
  assert.equal(promptLeaksAnswer('この単語は clarify という意味です', 'clarify'), true);
  assert.equal(promptLeaksAnswer('「明確にする」という意味の単語は何?', 'clarify'), false);
});

test('buildVoiceQuizPromptResults drops results that leak the answer', () => {
  const results = buildVoiceQuizPromptResults(
    [
      { id: 'word-1', prompt: '「明確にする」という意味の単語、英語で何と言う?' },
      { id: 'missing-id', prompt: '対応する単語がないので無視される' },
    ],
    [word],
  );

  assert.equal(results.length, 1);
  assert.equal(results[0].wordId, 'word-1');
});

test('buildVoiceQuizPromptResults filters out a leaked answer', () => {
  const results = buildVoiceQuizPromptResults(
    [{ id: 'word-1', prompt: 'clarify という英単語の意味は?' }],
    [word],
  );

  assert.equal(results.length, 0);
});
