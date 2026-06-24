import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WORDS_SELECT_COLUMNS } from './remote-repository';
import {
  RESOLVED_WORD_DISPLAY_WITH_PRONUNCIATION_SELECT_COLUMNS,
  RESOLVED_WORD_DISPLAY_SELECT_COLUMNS,
  RESOLVED_WORD_EXAMPLE_SELECT_COLUMNS,
  RESOLVED_WORD_MINIMAL_SELECT_COLUMNS,
  RESOLVED_WORD_SELECT_COLUMNS_BASIC,
  SHARE_VIEW_WORD_SELECT_COLUMNS_BASIC,
  SHARE_VIEW_WORD_SELECT_COLUMNS_DISPLAY_WITH_PRONUNCIATION,
  SHARE_VIEW_WORD_SELECT_COLUMNS_DISPLAY,
  SHARE_VIEW_WORD_SELECT_COLUMNS_EXAMPLE,
  SHARE_VIEW_WORD_SELECT_COLUMNS_MINIMAL,
} from '@/lib/words/resolved';

test('WORDS_SELECT_COLUMNS excludes embedding and includes required columns', () => {
  assert.equal(WORDS_SELECT_COLUMNS.includes('embedding'), false);
  assert.equal(WORDS_SELECT_COLUMNS.includes('word_order_quiz'), true);

  const expectedFragments = [
    'id',
    'project_id',
    'english',
    'japanese',
    'vocabulary_type',
    'lexicon_entry_id',
    'distractors',
    'example_sentence',
    'example_sentence_ja',
    'pronunciation',
    'part_of_speech_tags',
    'related_words',
    'usage_patterns',
    'insights_generated_at',
    'insights_version',
    'word_order_quiz',
    'status',
    'created_at',
    'last_reviewed_at',
    'next_review_at',
    'ease_factor',
    'interval_days',
    'repetition',
    'is_favorite',
    'lexicon_entries(',
    'normalized_headword',
    'cefr_level',
    'dataset_sources',
    'translation_ja',
    'translation_source',
    'updated_at',
    'word_translations(',
    'lexicon_senses(',
    'distinct_key',
  ];

  for (const fragment of expectedFragments) {
    assert.equal(
      WORDS_SELECT_COLUMNS.includes(fragment),
      true,
      `WORDS_SELECT_COLUMNS should include ${fragment}`,
    );
  }
});

test('word read methods query through compatibility fallback helpers', () => {
  const source = fs.readFileSync(new URL('./remote-repository.ts', import.meta.url), 'utf8');

  assert.match(source, /primary: WORDS_SELECT_COLUMNS/);
  assert.match(source, /withoutSenses: WORDS_SELECT_COLUMNS_WITHOUT_SENSES/);
  assert.match(source, /basic: WORDS_SELECT_COLUMNS_BASIC/);
  assert.match(source, /displayWithPronunciation: WORDS_SELECT_COLUMNS_DISPLAY_WITH_PRONUNCIATION/);
  assert.match(source, /display: WORDS_SELECT_COLUMNS_DISPLAY/);
  assert.match(source, /example: WORDS_SELECT_COLUMNS_EXAMPLE/);
  assert.match(source, /minimal: WORDS_SELECT_COLUMNS_MINIMAL/);
  assert.match(source, /error\.code === '42703'/);
  assert.match(source, /column \.\* does not exist/);

  assert.match(
    source,
    /async getWords\(projectId: string\): Promise<Word\[]> \{[\s\S]*?this\.selectFullWordsWithFallback\([\s\S]*?\.from\('words'\)[\s\S]*?\.select\(columns\)/
  );
  assert.match(
    source,
    /async getWord\(id: string\): Promise<Word \| undefined> \{[\s\S]*?this\.selectFullWordsWithFallback\([\s\S]*?\.from\('words'\)[\s\S]*?\.select\(columns\)/
  );
  assert.match(
    source,
    /async getAllWordsByProjectIds\(projectIds: string\[\]\): Promise<Record<string, Word\[]>> \{[\s\S]*?this\.selectFullWordsWithFallback\([\s\S]*?\.from\('words'\)[\s\S]*?\.select\(columns\)/
  );
  assert.match(
    source,
    /async getWordsByShareId\(shareId: string\): Promise<Word\[]> \{[\s\S]*?this\.selectFullWordsWithFallback\([\s\S]*?\.from\('words'\)[\s\S]*?\.select\(columns\)/
  );
});

test('basic word compatibility selects avoid all relation embeds', () => {
  for (const columns of [
    RESOLVED_WORD_SELECT_COLUMNS_BASIC,
    SHARE_VIEW_WORD_SELECT_COLUMNS_BASIC,
    RESOLVED_WORD_DISPLAY_WITH_PRONUNCIATION_SELECT_COLUMNS,
    SHARE_VIEW_WORD_SELECT_COLUMNS_DISPLAY_WITH_PRONUNCIATION,
    RESOLVED_WORD_DISPLAY_SELECT_COLUMNS,
    SHARE_VIEW_WORD_SELECT_COLUMNS_DISPLAY,
    RESOLVED_WORD_EXAMPLE_SELECT_COLUMNS,
    SHARE_VIEW_WORD_SELECT_COLUMNS_EXAMPLE,
    RESOLVED_WORD_MINIMAL_SELECT_COLUMNS,
    SHARE_VIEW_WORD_SELECT_COLUMNS_MINIMAL,
  ]) {
    assert.equal(columns.includes('word_translations('), false);
    assert.equal(columns.includes('lexicon_entries('), false);
    assert.equal(columns.includes('lexicon_senses('), false);
  }

  assert.equal(RESOLVED_WORD_MINIMAL_SELECT_COLUMNS, SHARE_VIEW_WORD_SELECT_COLUMNS_MINIMAL);
  assert.equal(RESOLVED_WORD_MINIMAL_SELECT_COLUMNS.includes('lexicon_entry_id'), false);
  assert.equal(RESOLVED_WORD_MINIMAL_SELECT_COLUMNS.includes('lexicon_sense_id'), false);
});

test('display word compatibility selects keep examples and part of speech before minimal fallback', () => {
  assert.equal(
    RESOLVED_WORD_DISPLAY_WITH_PRONUNCIATION_SELECT_COLUMNS,
    SHARE_VIEW_WORD_SELECT_COLUMNS_DISPLAY_WITH_PRONUNCIATION,
  );
  assert.equal(RESOLVED_WORD_DISPLAY_WITH_PRONUNCIATION_SELECT_COLUMNS.includes('example_sentence'), true);
  assert.equal(RESOLVED_WORD_DISPLAY_WITH_PRONUNCIATION_SELECT_COLUMNS.includes('example_sentence_ja'), true);
  assert.equal(RESOLVED_WORD_DISPLAY_WITH_PRONUNCIATION_SELECT_COLUMNS.includes('part_of_speech_tags'), true);
  assert.equal(RESOLVED_WORD_DISPLAY_WITH_PRONUNCIATION_SELECT_COLUMNS.includes('pronunciation'), true);
  assert.equal(RESOLVED_WORD_DISPLAY_WITH_PRONUNCIATION_SELECT_COLUMNS.includes('custom_sections'), false);
  assert.equal(RESOLVED_WORD_DISPLAY_WITH_PRONUNCIATION_SELECT_COLUMNS.includes('lexicon_sense_id'), false);

  assert.equal(RESOLVED_WORD_DISPLAY_SELECT_COLUMNS, SHARE_VIEW_WORD_SELECT_COLUMNS_DISPLAY);
  assert.equal(RESOLVED_WORD_DISPLAY_SELECT_COLUMNS.includes('example_sentence'), true);
  assert.equal(RESOLVED_WORD_DISPLAY_SELECT_COLUMNS.includes('example_sentence_ja'), true);
  assert.equal(RESOLVED_WORD_DISPLAY_SELECT_COLUMNS.includes('part_of_speech_tags'), true);
  assert.equal(RESOLVED_WORD_DISPLAY_SELECT_COLUMNS.includes('pronunciation'), false);
  assert.equal(RESOLVED_WORD_DISPLAY_SELECT_COLUMNS.includes('custom_sections'), false);
  assert.equal(RESOLVED_WORD_DISPLAY_SELECT_COLUMNS.includes('lexicon_sense_id'), false);

  assert.equal(RESOLVED_WORD_EXAMPLE_SELECT_COLUMNS, SHARE_VIEW_WORD_SELECT_COLUMNS_EXAMPLE);
  assert.equal(RESOLVED_WORD_EXAMPLE_SELECT_COLUMNS.includes('example_sentence'), true);
  assert.equal(RESOLVED_WORD_EXAMPLE_SELECT_COLUMNS.includes('example_sentence_ja'), true);
  assert.equal(RESOLVED_WORD_EXAMPLE_SELECT_COLUMNS.includes('part_of_speech_tags'), false);
});

test('shared preview fetches only a limited page with an exact count through fallback helper', () => {
  const source = fs.readFileSync(new URL('./remote-repository.ts', import.meta.url), 'utf8');

  assert.match(source, /primary: SHARE_VIEW_WORD_SELECT_COLUMNS/);
  assert.match(source, /withoutSenses: SHARE_VIEW_WORD_SELECT_COLUMNS_WITHOUT_SENSES/);
  assert.match(source, /basic: SHARE_VIEW_WORD_SELECT_COLUMNS_BASIC/);
  assert.match(source, /displayWithPronunciation: SHARE_VIEW_WORD_SELECT_COLUMNS_DISPLAY_WITH_PRONUNCIATION/);
  assert.match(source, /display: SHARE_VIEW_WORD_SELECT_COLUMNS_DISPLAY/);
  assert.match(source, /example: SHARE_VIEW_WORD_SELECT_COLUMNS_EXAMPLE/);
  assert.match(source, /minimal: SHARE_VIEW_WORD_SELECT_COLUMNS_MINIMAL/);
  assert.match(
    source,
    /async getWordsForSharePreview\(projectId: string, limit = 5\): Promise<SharedWordsPreview> \{[\s\S]*?this\.selectShareWordsWithFallback\([\s\S]*?\.select\(columns, \{ count: 'exact' \}\)[\s\S]*?\.limit\(limit\)/
  );
});
