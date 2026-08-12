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
  buildVoiceQuizMeaningPrompt,
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

test('the fixed halves of every English-to-Japanese prompt are covered', () => {
  // 出題文の前後は必ず音声にできていること。ここが欠けると
  // 1問ごとに合成音声と自然な音声が混ざって聞こえる。
  const index = voiceQuizAudioIndex();

  for (let i = 0; i < VOICE_QUIZ_MEANING_PROMPT_TEMPLATES.length; i += 1) {
    for (const segment of buildVoiceQuizMeaningPrompt('elaborate', i)) {
      if (segment.lang === 'en') continue; // 単語そのものは対象外
      assert.ok(index.has(segment.text), `no clip for: ${segment.text}`);
    }
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
