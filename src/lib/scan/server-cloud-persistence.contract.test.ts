import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildServerCloudMergedProjectSourceLabels,
  buildServerCloudProjectInsertPayload,
  buildServerCloudWordsInsertPayload,
  getMissingWordsCompatColumn,
  getServerCloudWordsInsertSelectColumns,
  isMissingWordsLexiconSenseIdColumn,
  isMissingWordsSourceModesColumn,
  shouldRollbackServerCloudProjectAfterWordsInsertFailure,
  stripServerCloudWordsInsertPayloadForCompat,
  stripSourceModesFromServerCloudWordsInsertPayload,
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
        japaneseSource: 'scan',
        lexiconEntryId: 'lexicon-elaborate',
        lexiconSenseId: 'sense-elaborate-primary',
        distractors: ['短くする', '無視する', '隠す'],
        exampleSentence: 'Please elaborate on your answer.',
        exampleSentenceJa: 'あなたの答えについて詳しく説明してください。',
        pronunciation: '/ɪˈlæbəreɪt/',
        partOfSpeechTags: ['verb'],
        sourceModes: ['all', 'circled'],
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
      japanese_source: 'scan',
      lexicon_entry_id: 'lexicon-elaborate',
      lexicon_sense_id: 'sense-elaborate-primary',
      distractors: ['短くする', '無視する', '隠す'],
      example_sentence: 'Please elaborate on your answer.',
      example_sentence_ja: 'あなたの答えについて詳しく説明してください。',
      pronunciation: '/ɪˈlæbəreɪt/',
      part_of_speech_tags: ['verb'],
      source_modes: ['all', 'circled'],
      custom_sections: [],
    },
    {
      project_id: 'project-123',
      english: 'concise',
      japanese: '簡潔な',
      japanese_source: null,
      lexicon_entry_id: null,
      lexicon_sense_id: null,
      distractors: ['長い', '曖昧な', '古い'],
      example_sentence: null,
      example_sentence_ja: null,
      pronunciation: null,
      part_of_speech_tags: undefined,
      source_modes: undefined,
      custom_sections: [],
    },
  ]);
  assert.equal(Object.hasOwn(payload[1] ?? {}, 'part_of_speech_tags'), true);
  assert.equal(Object.hasOwn(payload[1] ?? {}, 'source_modes'), true);
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

test('isMissingWordsSourceModesColumn detects missing source_modes schema errors', () => {
  assert.equal(
    isMissingWordsSourceModesColumn({
      code: 'PGRST204',
      message: "Could not find the 'source_modes' column of 'words' in the schema cache",
    }),
    true,
  );
  assert.equal(
    isMissingWordsSourceModesColumn({
      code: '42703',
      message: 'column words.source_modes does not exist',
    }),
    true,
  );
  assert.equal(
    isMissingWordsSourceModesColumn({
      code: '23505',
      message: 'duplicate key value violates unique constraint',
    }),
    false,
  );
});

test('word insert compatibility detects missing lexicon_sense_id schema errors', () => {
  const error = {
    code: 'PGRST204',
    message: "Could not find the 'lexicon_sense_id' column of 'words' in the schema cache",
  };

  assert.equal(getMissingWordsCompatColumn(error), 'lexicon_sense_id');
  assert.equal(isMissingWordsLexiconSenseIdColumn(error), true);
  assert.equal(isMissingWordsSourceModesColumn(error), false);
});

test('getServerCloudWordsInsertSelectColumns can omit lexicon_sense_id', () => {
  assert.equal(getServerCloudWordsInsertSelectColumns().includes('lexicon_sense_id'), true);
  assert.equal(
    getServerCloudWordsInsertSelectColumns({ omitLexiconSenseId: true }).includes('lexicon_sense_id'),
    false,
  );
});

test('stripSourceModesFromServerCloudWordsInsertPayload removes only source_modes', () => {
  const payload = buildServerCloudWordsInsertPayload(
    [
      {
        english: 'elaborate',
        japanese: '詳しく説明する',
        distractors: ['短くする', '無視する', '隠す'],
        sourceModes: ['all'],
      },
    ],
    'project-123',
  );

  assert.deepEqual(stripSourceModesFromServerCloudWordsInsertPayload(payload), [
    {
      project_id: 'project-123',
      english: 'elaborate',
      japanese: '詳しく説明する',
      japanese_source: null,
      lexicon_entry_id: null,
      lexicon_sense_id: null,
      distractors: ['短くする', '無視する', '隠す'],
      example_sentence: null,
      example_sentence_ja: null,
      pronunciation: null,
      part_of_speech_tags: undefined,
      custom_sections: [],
    },
  ]);
});

test('stripServerCloudWordsInsertPayloadForCompat can omit source_modes and lexicon_sense_id', () => {
  const payload = buildServerCloudWordsInsertPayload(
    [
      {
        english: 'elaborate',
        japanese: '詳しく説明する',
        lexiconSenseId: 'sense-1',
        distractors: ['短くする', '無視する', '隠す'],
        sourceModes: ['all'],
      },
    ],
    'project-123',
  );

  const stripped = stripServerCloudWordsInsertPayloadForCompat(payload, {
    omitSourceModes: true,
    omitLexiconSenseId: true,
  });

  assert.equal('source_modes' in stripped[0], false);
  assert.equal('lexicon_sense_id' in stripped[0], false);
  assert.equal(stripped[0]?.japanese, '詳しく説明する');
});
