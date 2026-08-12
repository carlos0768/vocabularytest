import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildVoiceQuizPrompt,
  canRetryVoiceQuiz,
  DEFAULT_VOICE_QUIZ_ATTEMPTS,
  MAX_VOICE_QUIZ_ATTEMPTS,
  MIN_VOICE_QUIZ_ATTEMPTS,
  normalizeVoiceQuizAttempts,
  pickVoiceQuizRetryPrompt,
  randomVoiceQuizPromptOffset,
  VOICE_QUIZ_ATTEMPT_OPTIONS,
  VOICE_QUIZ_MEANING_PLACEHOLDER,
  VOICE_QUIZ_PROMPT_TEMPLATES,
  VOICE_QUIZ_RETRY_TEMPLATES,
} from './voice-quiz-prompt';

test('every template carries the meaning placeholder', () => {
  assert.ok(VOICE_QUIZ_PROMPT_TEMPLATES.length > 1);
  for (const template of VOICE_QUIZ_PROMPT_TEMPLATES) {
    assert.ok(
      template.includes(VOICE_QUIZ_MEANING_PLACEHOLDER),
      `template is missing the placeholder: ${template}`,
    );
  }
});

test('buildVoiceQuizPrompt substitutes the meaning and leaves no placeholder behind', () => {
  const prompt = buildVoiceQuizPrompt('明確にする', 0);

  assert.ok(prompt.includes('明確にする'));
  assert.ok(!prompt.includes(VOICE_QUIZ_MEANING_PLACEHOLDER));
});

test('buildVoiceQuizPrompt trims surrounding whitespace from the meaning', () => {
  assert.equal(
    buildVoiceQuizPrompt('  明確にする \n', 0),
    buildVoiceQuizPrompt('明確にする', 0),
  );
});

test('buildVoiceQuizPrompt rotates templates so consecutive questions differ', () => {
  assert.notEqual(buildVoiceQuizPrompt('明確にする', 0), buildVoiceQuizPrompt('明確にする', 1));
});

test('buildVoiceQuizPrompt wraps around past the end of the template list', () => {
  assert.equal(
    buildVoiceQuizPrompt('明確にする', VOICE_QUIZ_PROMPT_TEMPLATES.length),
    buildVoiceQuizPrompt('明確にする', 0),
  );
});

test('buildVoiceQuizPrompt stays valid for negative and non-integer indexes', () => {
  for (const index of [-1, -9, 1.7, Number.NaN]) {
    const prompt = buildVoiceQuizPrompt('明確にする', index);
    assert.ok(prompt.includes('明確にする'));
    assert.ok(!prompt.includes(VOICE_QUIZ_MEANING_PLACEHOLDER));
  }
});

test('the English answer cannot leak into the prompt', () => {
  // 出題文は日本語訳だけから組み立てるので、構造上スペルは漏れない。
  // テンプレート自体にアルファベットが無いことを固定して回帰を防ぐ。
  for (const template of VOICE_QUIZ_PROMPT_TEMPLATES) {
    const withoutPlaceholder = template.replaceAll(VOICE_QUIZ_MEANING_PLACEHOLDER, '');
    assert.ok(
      !/[a-z]/i.test(withoutPlaceholder),
      `template must not contain Latin letters: ${template}`,
    );
  }
});

test('randomVoiceQuizPromptOffset stays inside the template range', () => {
  assert.equal(randomVoiceQuizPromptOffset(() => 0), 0);
  assert.equal(
    randomVoiceQuizPromptOffset(() => 0.999999),
    VOICE_QUIZ_PROMPT_TEMPLATES.length - 1,
  );
});

test('pickVoiceQuizRetryPrompt rotates through the retry phrases', () => {
  assert.ok(VOICE_QUIZ_RETRY_TEMPLATES.length > 1);
  assert.notEqual(pickVoiceQuizRetryPrompt(0), pickVoiceQuizRetryPrompt(1));
  assert.equal(
    pickVoiceQuizRetryPrompt(VOICE_QUIZ_RETRY_TEMPLATES.length),
    pickVoiceQuizRetryPrompt(0),
  );
});

test('attempt options are exactly 1 through 3', () => {
  assert.deepEqual([...VOICE_QUIZ_ATTEMPT_OPTIONS], [1, 2, 3]);
  assert.equal(MIN_VOICE_QUIZ_ATTEMPTS, 1);
  assert.equal(MAX_VOICE_QUIZ_ATTEMPTS, 3);
});

test('normalizeVoiceQuizAttempts clamps to the 1..3 range', () => {
  assert.equal(normalizeVoiceQuizAttempts(0), 1);
  assert.equal(normalizeVoiceQuizAttempts(-5), 1);
  assert.equal(normalizeVoiceQuizAttempts(1), 1);
  assert.equal(normalizeVoiceQuizAttempts(3), 3);
  assert.equal(normalizeVoiceQuizAttempts(9), 3);
  assert.equal(normalizeVoiceQuizAttempts(2.7), 2);
});

test('normalizeVoiceQuizAttempts falls back to the default for junk input', () => {
  assert.equal(normalizeVoiceQuizAttempts('abc'), DEFAULT_VOICE_QUIZ_ATTEMPTS);
  assert.equal(normalizeVoiceQuizAttempts(undefined), DEFAULT_VOICE_QUIZ_ATTEMPTS);
  assert.equal(normalizeVoiceQuizAttempts(Number.NaN), DEFAULT_VOICE_QUIZ_ATTEMPTS);
});

test('canRetryVoiceQuiz ends the question immediately when only one attempt is allowed', () => {
  assert.equal(canRetryVoiceQuiz(1, 1), false);
});

test('canRetryVoiceQuiz allows retries up to the configured attempt count', () => {
  assert.equal(canRetryVoiceQuiz(1, 2), true);
  assert.equal(canRetryVoiceQuiz(2, 2), false);

  assert.equal(canRetryVoiceQuiz(1, 3), true);
  assert.equal(canRetryVoiceQuiz(2, 3), true);
  assert.equal(canRetryVoiceQuiz(3, 3), false);
});
