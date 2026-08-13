import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildVoiceQuizAnswerAnnouncement,
  buildVoiceQuizMeaningPrompt,
  buildVoiceQuizPromptFor,
  buildVoiceQuizWordPrompt,
  isVoiceQuizDirection,
  recognitionLanguageFor,
  canRetryVoiceQuiz,
  DEFAULT_VOICE_QUIZ_ATTEMPTS,
  DEFAULT_VOICE_QUIZ_DURATION_SEC,
  MAX_VOICE_QUIZ_DURATION_SEC,
  MIN_VOICE_QUIZ_DURATION_SEC,
  normalizeVoiceQuizDuration,
  VOICE_QUIZ_DURATION_OPTIONS,
  DEFAULT_VOICE_QUIZ_COUNT,
  MAX_VOICE_QUIZ_COUNT,
  MAX_VOICE_QUIZ_ATTEMPTS,
  MIN_VOICE_QUIZ_ATTEMPTS,
  normalizeVoiceQuizAttempts,
  pickVoiceQuizRetryPrompt,
  randomVoiceQuizPromptOffset,
  resolveVoiceQuizCount,
  VOICE_QUIZ_ATTEMPT_OPTIONS,
  VOICE_QUIZ_MEANING_PROMPT_TEMPLATES,
  VOICE_QUIZ_RETRY_TEMPLATES,
  VOICE_QUIZ_WORD_PLACEHOLDER,
  VOICE_QUIZ_WORD_PROMPT_TEMPLATES,
  voiceQuizPromptToText,
} from './voice-quiz-prompt';

test('every template sandwiches the word between Japanese on both sides', () => {
  assert.ok(VOICE_QUIZ_MEANING_PROMPT_TEMPLATES.length > 1);
  for (const template of VOICE_QUIZ_MEANING_PROMPT_TEMPLATES) {
    const at = template.indexOf(VOICE_QUIZ_WORD_PLACEHOLDER);
    assert.ok(at >= 0, `template is missing the placeholder: ${template}`);
    // 単語を文末に置くと「単語 → 質問」と切れて聞こえるので前後に日本語を残す。
    assert.ok(
      template.slice(at + VOICE_QUIZ_WORD_PLACEHOLDER.length).trim().length > 0,
      `template must keep Japanese after the word: ${template}`,
    );
  }
});

test('buildVoiceQuizMeaningPrompt splits the sentence so only the word is English', () => {
  const segments = buildVoiceQuizMeaningPrompt('elaborate', 0);

  const english = segments.filter((segment) => segment.lang === 'en');
  assert.equal(english.length, 1);
  assert.equal(english[0].text, 'elaborate');
  assert.ok(segments.some((segment) => segment.lang === 'ja'));
  assert.ok(segments.every((segment) => segment.text.length > 0));
});

test('buildVoiceQuizMeaningPrompt leaves no placeholder behind', () => {
  for (const segment of buildVoiceQuizMeaningPrompt('elaborate', 0)) {
    assert.ok(!segment.text.includes(VOICE_QUIZ_WORD_PLACEHOLDER));
  }
});

test('buildVoiceQuizMeaningPrompt trims surrounding whitespace from the word', () => {
  assert.deepEqual(
    buildVoiceQuizMeaningPrompt('  elaborate \n', 0),
    buildVoiceQuizMeaningPrompt('elaborate', 0),
  );
});

test('buildVoiceQuizMeaningPrompt rotates templates so consecutive questions differ', () => {
  assert.notEqual(
    voiceQuizPromptToText(buildVoiceQuizMeaningPrompt('elaborate', 0)),
    voiceQuizPromptToText(buildVoiceQuizMeaningPrompt('elaborate', 1)),
  );
});

test('buildVoiceQuizMeaningPrompt wraps around past the end of the template list', () => {
  assert.deepEqual(
    buildVoiceQuizMeaningPrompt('elaborate', VOICE_QUIZ_MEANING_PROMPT_TEMPLATES.length),
    buildVoiceQuizMeaningPrompt('elaborate', 0),
  );
});

test('buildVoiceQuizMeaningPrompt stays valid for negative and non-integer indexes', () => {
  for (const index of [-1, -9, 1.7, Number.NaN]) {
    const segments = buildVoiceQuizMeaningPrompt('elaborate', index);
    assert.ok(segments.some((segment) => segment.lang === 'en' && segment.text === 'elaborate'));
  }
});

test('the Japanese answer cannot leak into the prompt', () => {
  // 出題文は英単語だけから組み立てるので、構造上いっさい訳が混ざらない。
  // テンプレート側に訳を差し込む口が無いことを固定して回帰を防ぐ。
  for (const template of VOICE_QUIZ_MEANING_PROMPT_TEMPLATES) {
    assert.ok(
      !template.includes('{meaning}'),
      `template must not accept a meaning: ${template}`,
    );
  }
});

test('randomVoiceQuizPromptOffset stays inside the template range', () => {
  assert.equal(randomVoiceQuizPromptOffset(() => 0), 0);
  assert.equal(
    randomVoiceQuizPromptOffset(() => 0.999999),
    VOICE_QUIZ_MEANING_PROMPT_TEMPLATES.length - 1,
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

test('resolveVoiceQuizCount carries a valid count through from the normal quiz', () => {
  assert.equal(resolveVoiceQuizCount('25'), 25);
  assert.equal(resolveVoiceQuizCount('1'), 1);
});

test('resolveVoiceQuizCount falls back to the default for missing or junk values', () => {
  assert.equal(resolveVoiceQuizCount(null), DEFAULT_VOICE_QUIZ_COUNT);
  assert.equal(resolveVoiceQuizCount(undefined), DEFAULT_VOICE_QUIZ_COUNT);
  assert.equal(resolveVoiceQuizCount(''), DEFAULT_VOICE_QUIZ_COUNT);
  assert.equal(resolveVoiceQuizCount('abc'), DEFAULT_VOICE_QUIZ_COUNT);
  assert.equal(resolveVoiceQuizCount('0'), DEFAULT_VOICE_QUIZ_COUNT);
  assert.equal(resolveVoiceQuizCount('-3'), DEFAULT_VOICE_QUIZ_COUNT);
});

test('resolveVoiceQuizCount caps absurd values', () => {
  assert.equal(resolveVoiceQuizCount('99999'), MAX_VOICE_QUIZ_COUNT);
});

test('normalizeVoiceQuizDuration clamps to the supported range', () => {
  assert.equal(normalizeVoiceQuizDuration(6), 6);
  assert.equal(normalizeVoiceQuizDuration(1), MIN_VOICE_QUIZ_DURATION_SEC);
  assert.equal(normalizeVoiceQuizDuration(999), MAX_VOICE_QUIZ_DURATION_SEC);
});

test('normalizeVoiceQuizDuration falls back to the default for junk input', () => {
  for (const value of [undefined, null, 'abc', Number.NaN]) {
    assert.equal(normalizeVoiceQuizDuration(value), DEFAULT_VOICE_QUIZ_DURATION_SEC);
  }
});

test('every offered duration survives normalization unchanged', () => {
  for (const option of VOICE_QUIZ_DURATION_OPTIONS) {
    assert.equal(normalizeVoiceQuizDuration(option), option);
  }
});

// ============ 出題の向き ============

test('ja-to-en prompts read the meaning and never leak the English word', () => {
  const segments = buildVoiceQuizWordPrompt('入念に作り上げる', 0);

  // 固定部分と訳を切り分ける (固定部分だけ作り置きの音声で読めるようにするため)。
  assert.ok(segments.length > 1);
  assert.ok(segments.every((segment) => segment.lang === 'ja'));
  assert.ok(segments.some((segment) => segment.text === '入念に作り上げる'));
  // 全体が日本語なので、綴りが混ざる余地が無いことを固定する。
  assert.ok(!/[a-z]/i.test(voiceQuizPromptToText(segments)));
});

test('buildVoiceQuizPromptFor picks the prompt that matches the direction', () => {
  const word = { english: 'elaborate', japanese: '入念に作り上げる' };

  const enToJa = buildVoiceQuizPromptFor('en-to-ja', word, 0);
  assert.ok(enToJa.some((s) => s.lang === 'en' && s.text === 'elaborate'));

  const jaToEn = buildVoiceQuizPromptFor('ja-to-en', word, 0);
  assert.ok(jaToEn.every((s) => s.lang === 'ja'));
  assert.ok(!voiceQuizPromptToText(jaToEn).includes('elaborate'));
});

test('recognitionLanguageFor follows the language the learner speaks', () => {
  assert.equal(recognitionLanguageFor('en-to-ja'), 'ja-JP');
  assert.equal(recognitionLanguageFor('ja-to-en'), 'en-US');
});

test('isVoiceQuizDirection accepts only the two directions', () => {
  assert.equal(isVoiceQuizDirection('en-to-ja'), true);
  assert.equal(isVoiceQuizDirection('ja-to-en'), true);
  for (const value of ['', 'en', null, undefined, 0]) {
    assert.equal(isVoiceQuizDirection(value), false);
  }
});

test('the answer announcement switches voice only for an English answer', () => {
  const word = { english: 'elaborate', japanese: '入念に作り上げる' };

  // 英→日: すべて日本語だが、前後の固定部分は切り分けておく。
  const jaAnswer = buildVoiceQuizAnswerAnnouncement('en-to-ja', word);
  assert.ok(jaAnswer.every((segment) => segment.lang === 'ja'));
  assert.ok(jaAnswer.some((segment) => segment.text === '入念に作り上げる'));
  assert.ok(jaAnswer.some((segment) => segment.text === '正解は、'));

  // 日→英: 綴りの部分だけ英語の声にする。
  const enAnswer = buildVoiceQuizAnswerAnnouncement('ja-to-en', word);
  const english = enAnswer.filter((s) => s.lang === 'en');
  assert.equal(english.length, 1);
  assert.equal(english[0].text, 'elaborate');
});

test('an empty answer produces no announcement', () => {
  assert.deepEqual(buildVoiceQuizAnswerAnnouncement('en-to-ja', { english: 'x', japanese: '  ' }), []);
});

/**
 * 読み上げの「単語ぶん」は1片だけ。ここがずれると、
 * 事前生成の台本が単語を拾ってしまい (作れない音声を待つ)、
 * 逆に固定文が合成音声のまま見過ごされる。
 */
test('exactly one segment per question is the variable one, and it is the word', () => {
  const word = { english: 'elaborate', japanese: '入念に作り上げる' };

  for (let i = 0; i < VOICE_QUIZ_MEANING_PROMPT_TEMPLATES.length; i += 1) {
    const variable = buildVoiceQuizPromptFor('en-to-ja', word, i).filter((s) => s.variable);
    assert.deepEqual(variable.map((s) => s.text), [word.english]);
  }

  for (let i = 0; i < VOICE_QUIZ_WORD_PROMPT_TEMPLATES.length; i += 1) {
    const variable = buildVoiceQuizPromptFor('ja-to-en', word, i).filter((s) => s.variable);
    assert.deepEqual(variable.map((s) => s.text), [word.japanese]);
  }
});

test('only the answer itself is variable in the answer announcement', () => {
  const word = { english: 'elaborate', japanese: '入念に作り上げる' };

  assert.deepEqual(
    buildVoiceQuizAnswerAnnouncement('en-to-ja', word).filter((s) => s.variable).map((s) => s.text),
    [word.japanese],
  );
  assert.deepEqual(
    buildVoiceQuizAnswerAnnouncement('ja-to-en', word).filter((s) => s.variable).map((s) => s.text),
    [word.english],
  );
});
