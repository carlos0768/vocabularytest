import test from 'node:test';
import assert from 'node:assert/strict';

import {
  groupWordsByMemory,
  selectPrimaryMeaningWords,
  summarizeWordMemory,
  type WordMemoryInput,
} from './memory';

function word(overrides: Partial<WordMemoryInput> & Pick<WordMemoryInput, 'id' | 'english' | 'japanese'>): WordMemoryInput {
  return {
    projectId: 'project-1',
    status: 'new',
    ...overrides,
  };
}

test('groupWordsByMemory collapses explicit distinct senses into one memory group', () => {
  const words = [
    word({
      id: 'free-primary',
      english: 'free',
      japanese: '自由な',
      status: 'mastered',
      lexiconEntryId: 'lex-free',
      lexiconSenseId: 'sense-primary',
      lexiconSenseIsPrimary: true,
    }),
    word({
      id: 'free-cost',
      english: 'free',
      japanese: '無料の',
      status: 'new',
      lexiconEntryId: 'lex-free',
      lexiconSenseId: 'sense-cost',
      lexiconDistinctKey: 'cost',
    }),
  ];

  const [group] = groupWordsByMemory(words);

  assert.equal(group?.isDistinctGroup, true);
  assert.equal(group?.representative.id, 'free-primary');
  assert.equal(group?.memoryRate, 50);
  assert.equal(group?.status, 'review');
  assert.deepEqual(summarizeWordMemory(words), {
    total: 1,
    mastered: 0,
    active: 0,
    learning: 1,
    unlearned: 0,
  });
});

test('groupWordsByMemory leaves non-distinct same-English translations as separate words', () => {
  const groups = groupWordsByMemory([
    word({ id: 'run-verb', english: 'run', japanese: '走る', status: 'mastered' }),
    word({ id: 'run-noun', english: 'run', japanese: '運営', status: 'new' }),
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.isDistinctGroup, false);
  assert.equal(groups[1]?.isDistinctGroup, false);
});

test('selectPrimaryMeaningWords excludes linked non-primary senses', () => {
  const words = [
    word({
      id: 'free-primary',
      english: 'free',
      japanese: '自由な',
      lexiconEntryId: 'lex-free',
      lexiconSenseId: 'sense-primary',
      lexiconSenseIsPrimary: true,
    }),
    word({
      id: 'free-cost',
      english: 'free',
      japanese: '無料の',
      lexiconEntryId: 'lex-free',
      lexiconSenseId: 'sense-cost',
      lexiconSenseIsPrimary: false,
    }),
    word({ id: 'plain', english: 'plain', japanese: '明白な' }),
  ];

  assert.deepEqual(selectPrimaryMeaningWords(words).map((item) => item.id), ['free-primary', 'plain']);
});

test('groupWordsByMemory treats linked non-primary senses as one memory-rate word', () => {
  const words = [
    word({
      id: 'sense-primary',
      english: 'sense',
      japanese: '感覚',
      status: 'mastered',
      lexiconEntryId: 'lex-sense',
      lexiconSenseId: 'sense-primary',
      lexiconSenseIsPrimary: true,
    }),
    word({
      id: 'sense-discernment',
      english: 'sense',
      japanese: '分別',
      status: 'new',
      lexiconEntryId: 'lex-sense',
      lexiconSenseId: 'sense-discernment',
      lexiconSenseIsPrimary: false,
    }),
  ];

  const [group] = groupWordsByMemory(words);

  assert.equal(group?.isDistinctGroup, true);
  assert.equal(group?.memoryRate, 50);
  assert.deepEqual(selectPrimaryMeaningWords(words).map((item) => item.id), ['sense-primary']);
});

test('groupWordsByMemory computes memory rate from distinct translations on one word', () => {
  const words = [
    word({
      id: 'word-free',
      english: 'free',
      japanese: '自由な',
      status: 'mastered',
      lexiconEntryId: 'lex-free',
      lexiconSenseId: 'sense-primary',
      lexiconSenseIsPrimary: true,
      translations: [
        {
          translationJa: '自由な',
          normalizedTranslationJa: '自由な',
          isPrimary: true,
          lexiconSenseId: 'sense-primary',
          lexiconSenseIsPrimary: true,
          status: 'mastered',
        },
        {
          translationJa: '無料の',
          normalizedTranslationJa: '無料の',
          distinctKey: 'cost',
          isPrimary: false,
          lexiconSenseId: 'sense-cost',
          lexiconSenseIsPrimary: false,
          status: 'new',
        },
      ],
    }),
  ];

  const [group] = groupWordsByMemory(words);

  assert.equal(group?.isDistinctGroup, true);
  assert.equal(group?.memoryRate, 50);
  assert.equal(group?.status, 'review');
  assert.deepEqual(group?.senses.map((sense) => sense.japanese), ['自由な', '無料の']);
});
