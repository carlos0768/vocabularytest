import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLexiconCleanupPlan } from './cleanup';

test('buildLexiconCleanupPlan sanitizes polluted translations and safely relinks runtime other rows', () => {
  const plan = buildLexiconCleanupPlan(
    [
      {
        id: 'olp-bright',
        headword: 'bright',
        normalized_headword: 'bright',
        pos: 'adjective',
        dataset_sources: ['olp:cefrj-vocabulary-profile-1.5'],
        translation_ja: null,
        translation_source: null,
      },
      {
        id: 'runtime-bright',
        headword: 'bright',
        normalized_headword: 'bright',
        pos: 'other',
        dataset_sources: ['runtime'],
        translation_ja: 'THOUGHTS: 1. ... 最終出力: 明るい',
        translation_source: 'ai',
      },
      {
        id: 'runtime-json',
        headword: 'engaged',
        normalized_headword: 'engaged',
        pos: 'other',
        dataset_sources: ['runtime'],
        translation_ja: 'Here is the JSON requested:',
        translation_source: 'ai',
      },
      {
        id: 'olp-spring-noun',
        headword: 'spring',
        normalized_headword: 'spring',
        pos: 'noun',
        dataset_sources: ['olp:cefrj-vocabulary-profile-1.5'],
        translation_ja: null,
        translation_source: null,
      },
      {
        id: 'olp-spring-verb',
        headword: 'spring',
        normalized_headword: 'spring',
        pos: 'verb',
        dataset_sources: ['olp:octanove-vocabulary-profile-c1c2-1.0'],
        translation_ja: null,
        translation_source: null,
      },
      {
        id: 'runtime-spring',
        headword: 'spring',
        normalized_headword: 'spring',
        pos: 'other',
        dataset_sources: ['runtime'],
        translation_ja: '跳ねる',
        translation_source: 'scan',
      },
    ],
    [
      { id: 'word-1', lexicon_entry_id: 'runtime-bright' },
      { id: 'word-2', lexicon_entry_id: 'runtime-spring' },
    ],
  );

  assert.deepEqual(
    plan.translationUpdates,
    [
      {
        lexiconEntryId: 'runtime-bright',
        translationJa: '明るい',
        translationSource: 'ai',
      },
      {
        lexiconEntryId: 'runtime-json',
        translationJa: null,
        translationSource: null,
      },
    ],
  );
  assert.deepEqual(plan.wordRelinks, [
    {
      runtimeLexiconEntryId: 'runtime-bright',
      targetLexiconEntryId: 'olp-bright',
      wordIds: ['word-1'],
    },
  ]);
  assert.deepEqual(plan.translationMigrations, [
    {
      sourceLexiconEntryId: 'runtime-bright',
      targetLexiconEntryId: 'olp-bright',
      translationJa: '明るい',
      translationSource: 'ai',
    },
  ]);
  assert.deepEqual(plan.orphanRuntimeEntryIds, ['runtime-bright']);
  assert.deepEqual(plan.ambiguousRuntimeEntryIds, ['runtime-spring']);
  assert.equal(plan.summary.translationUpdateCount, 2);
  assert.equal(plan.summary.relinkedWordCount, 1);
  assert.equal(plan.summary.migratedTranslationCount, 1);
  assert.equal(plan.summary.orphanDeleteCount, 1);
  assert.equal(plan.summary.ambiguousRuntimeRowCount, 1);
});
