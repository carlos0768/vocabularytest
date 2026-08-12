import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VOICE_QUIZ_AUDIO_DIR,
  VOICE_QUIZ_RESULT_ANNOUNCEMENTS,
  voiceQuizAudioClips,
  voiceQuizAudioIndex,
} from './voice-quiz-audio';
import {
  VOICE_QUIZ_ANSWER_PREFIX,
  VOICE_QUIZ_ANSWER_SUFFIX,
  VOICE_QUIZ_MEANING_PROMPT_TEMPLATES,
  VOICE_QUIZ_RETRY_TEMPLATES,
  VOICE_QUIZ_WORD_PLACEHOLDER,
  VOICE_QUIZ_WORD_PROMPT_TEMPLATES,
  buildVoiceQuizAnswerAnnouncement,
  buildVoiceQuizPromptFor,
  pickVoiceQuizRetryPrompt,
} from './voice-quiz-prompt';

test('every clip has a unique id and non-empty text', () => {
  const clips = voiceQuizAudioClips();
  assert.ok(clips.length > 0);

  const ids = new Set(clips.map((clip) => clip.id));
  assert.equal(ids.size, clips.length);

  for (const clip of clips) {
    assert.ok(clip.text.trim().length > 0, `empty text: ${clip.id}`);
  }
});

test('no clip carries a placeholder — the variable parts are never pre-generated', () => {
  for (const clip of voiceQuizAudioClips()) {
    assert.ok(!clip.text.includes(VOICE_QUIZ_WORD_PLACEHOLDER), `placeholder left in ${clip.id}`);
    assert.ok(!clip.text.includes('{meaning}'), `placeholder left in ${clip.id}`);
  }
});

/**
 * 実際に読み上げる並びを歩いて、固定部分に音声が無いものを見つける。
 *
 * 台本に文言が載っていても、読み上げ側がそれを1つに繋げて喋っていれば
 * 索引に当たらず合成音声のままになる —— 実際にそれで
 * 「正解は、○○ です。」と日→英の出題文が合成音声で残っていた。
 * 文言の一覧ではなく、組み立てた結果を突き合わせる。
 */
function uncoveredFixedSegments(segments: { text: string; lang: string }[], variable: string[]) {
  const index = voiceQuizAudioIndex();
  return segments
    .filter((segment) => !variable.includes(segment.text)) // 単語・訳は対象外
    .filter((segment) => !index.has(segment.text))
    .map((segment) => segment.text);
}

test('every fixed part of an English-to-Japanese question has audio', () => {
  const word = { english: 'elaborate', japanese: '入念に作り上げる' };
  for (let i = 0; i < VOICE_QUIZ_MEANING_PROMPT_TEMPLATES.length; i += 1) {
    const segments = buildVoiceQuizPromptFor('en-to-ja', word, i);
    assert.deepEqual(uncoveredFixedSegments(segments, [word.english]), []);
  }
});

test('every fixed part of a Japanese-to-English question has audio', () => {
  const word = { english: 'elaborate', japanese: '入念に作り上げる' };
  for (let i = 0; i < VOICE_QUIZ_WORD_PROMPT_TEMPLATES.length; i += 1) {
    const segments = buildVoiceQuizPromptFor('ja-to-en', word, i);
    assert.deepEqual(uncoveredFixedSegments(segments, [word.japanese]), []);
  }
});

test('the answer announcement is split so its fixed halves have audio', () => {
  const word = { english: 'elaborate', japanese: '入念に作り上げる' };
  for (const direction of ['en-to-ja', 'ja-to-en'] as const) {
    const segments = buildVoiceQuizAnswerAnnouncement(direction, word);
    // 繋げて1文にしていたら、答え以外の部分が索引に当たらず落ちる。
    assert.deepEqual(uncoveredFixedSegments(segments, [word.english, word.japanese]), []);
  }
});

test('every retry phrase is covered', () => {
  const index = voiceQuizAudioIndex();
  for (let i = 0; i < VOICE_QUIZ_RETRY_TEMPLATES.length; i += 1) {
    assert.ok(index.has(pickVoiceQuizRetryPrompt(i)));
  }
});

test('both halves of the answer announcement are covered', () => {
  const index = voiceQuizAudioIndex();
  assert.ok(index.has(VOICE_QUIZ_ANSWER_PREFIX));
  assert.ok(index.has(VOICE_QUIZ_ANSWER_SUFFIX));
});

test('every result announcement is covered', () => {
  const index = voiceQuizAudioIndex();
  for (const text of Object.values(VOICE_QUIZ_RESULT_ANNOUNCEMENTS)) {
    assert.ok(index.has(text), `no clip for: ${text}`);
  }
});

test('clips resolve to mp3 paths under the public audio directory', () => {
  for (const url of voiceQuizAudioIndex().values()) {
    assert.ok(url.startsWith(`${VOICE_QUIZ_AUDIO_DIR}/`), url);
    assert.ok(url.endsWith('.mp3'), url);
  }
});

test('the same wording shares one clip instead of being generated twice', () => {
  const clips = voiceQuizAudioClips();
  const index = voiceQuizAudioIndex();
  const distinctTexts = new Set(clips.map((clip) => clip.text.trim()));
  assert.equal(index.size, distinctTexts.size);
});
