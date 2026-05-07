import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildServerCloudMergedProjectSourceLabels,
  buildServerCloudProjectInsertPayload,
  buildServerCloudWordsInsertPayload,
  shouldRollbackServerCloudProjectAfterWordsInsertFailure,
} from '@/lib/scan/server-cloud-persistence';

test('buildServerCloudProjectInsertPayload fixes the projects insert shape for new server_cloud scans', () => {
  const payload = buildServerCloudProjectInsertPayload({
    userId: 'user-123',
    projectTitle: 'Scan Result',
    sourceLabels: ['鉄壁', 'ノート'],
    projectIconImage: 'data:image/png;base64,icon',
  });

  assert.deepEqual(payload, {
    user_id: 'user-123',
    title: 'Scan Result',
    source_labels: ['鉄壁', 'ノート'],
    icon_image: 'data:image/png;base64,icon',
  });
});

test('buildServerCloudProjectInsertPayload stores null icon_image when the scan job has no icon', () => {
  const payload = buildServerCloudProjectInsertPayload({
    userId: 'user-123',
    projectTitle: 'Scan Result',
    sourceLabels: ['ノート'],
    projectIconImage: undefined,
  });

  assert.deepEqual(payload, {
    user_id: 'user-123',
    title: 'Scan Result',
    source_labels: ['ノート'],
    icon_image: null,
  });
});

test('buildServerCloudMergedProjectSourceLabels fixes existing project source label merge behavior', () => {
  const merged = buildServerCloudMergedProjectSourceLabels({
    existingSourceLabels: ['鉄壁', 'ノート'],
    scanSourceLabels: ['LEAP', '鉄壁', '教科書'],
  });

  assert.deepEqual(merged, ['鉄壁', 'ノート', 'LEAP']);
});

test('buildServerCloudWordsInsertPayload fixes the words insert shape', () => {
  const payload = buildServerCloudWordsInsertPayload(
    [
      {
        english: 'elaborate',
        japanese: '詳しく説明する',
        lexiconEntryId: 'lexicon-elaborate',
        distractors: ['短くする', '無視する', '隠す'],
        exampleSentence: 'Please elaborate on your answer.',
        exampleSentenceJa: 'あなたの答えについて詳しく説明してください。',
        partOfSpeechTags: ['verb'],
      },
      {
        english: 'concise',
        japanese: '簡潔な',
        distractors: ['長い', '曖昧な', '古い'],
        exampleSentence: '',
        exampleSentenceJa: undefined,
      },
    ],
    'project-123',
  );

  assert.deepEqual(payload, [
    {
      project_id: 'project-123',
      english: 'elaborate',
      japanese: '詳しく説明する',
      lexicon_entry_id: 'lexicon-elaborate',
      distractors: ['短くする', '無視する', '隠す'],
      example_sentence: 'Please elaborate on your answer.',
      example_sentence_ja: 'あなたの答えについて詳しく説明してください。',
      part_of_speech_tags: ['verb'],
    },
    {
      project_id: 'project-123',
      english: 'concise',
      japanese: '簡潔な',
      lexicon_entry_id: null,
      distractors: ['長い', '曖昧な', '古い'],
      example_sentence: null,
      example_sentence_ja: null,
      part_of_speech_tags: undefined,
    },
  ]);
  assert.equal(Object.hasOwn(payload[1] ?? {}, 'part_of_speech_tags'), true);
});

test('shouldRollbackServerCloudProjectAfterWordsInsertFailure only deletes a newly created project after words insert failure', () => {
  const wordsInsertError = { message: 'words insert failed' };

  assert.equal(
    shouldRollbackServerCloudProjectAfterWordsInsertFailure({
      createdNewProject: true,
      wordsInsertError,
    }),
    true,
  );
  assert.equal(
    shouldRollbackServerCloudProjectAfterWordsInsertFailure({
      createdNewProject: false,
      wordsInsertError,
    }),
    false,
  );
  assert.equal(
    shouldRollbackServerCloudProjectAfterWordsInsertFailure({
      createdNewProject: true,
      wordsInsertError: null,
    }),
    false,
  );
});
