import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WORDS_SELECT_COLUMNS } from './remote-repository';

test('WORDS_SELECT_COLUMNS excludes embedding and includes required columns', () => {
  assert.equal(WORDS_SELECT_COLUMNS.includes('embedding'), false);

  const expectedFragments = [
    'id',
    'project_id',
    'english',
    'japanese',
    'vocabulary_type',
    'lexicon_entry_id',
    'english_override',
    'japanese_override',
    'distractors',
    'example_sentence',
    'example_sentence_ja',
    'pronunciation',
    'part_of_speech_tags',
    'related_words',
    'usage_patterns',
    'insights_generated_at',
    'insights_version',
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
  ];

  for (const fragment of expectedFragments) {
    assert.equal(
      WORDS_SELECT_COLUMNS.includes(fragment),
      true,
      `WORDS_SELECT_COLUMNS should include ${fragment}`,
    );
  }
});

test('word read methods query with WORDS_SELECT_COLUMNS', () => {
  const source = fs.readFileSync(new URL('./remote-repository.ts', import.meta.url), 'utf8');

  assert.match(
    source,
    /async getWords\(projectId: string\): Promise<Word\[]> \{[\s\S]*?\.from\('words'\)[\s\S]*?\.select\(WORDS_SELECT_COLUMNS\)/
  );
  assert.match(
    source,
    /async getWord\(id: string\): Promise<Word \| undefined> \{[\s\S]*?\.from\('words'\)[\s\S]*?\.select\(WORDS_SELECT_COLUMNS\)/
  );
  assert.match(
    source,
    /async getAllWordsByProjectIds\(projectIds: string\[\]\): Promise<Record<string, Word\[]>> \{[\s\S]*?\.from\('words'\)[\s\S]*?\.select\(WORDS_SELECT_COLUMNS\)/
  );
  assert.match(
    source,
    /async getWordsByShareId\(shareId: string\): Promise<Word\[]> \{[\s\S]*?\.from\('words'\)[\s\S]*?\.select\(WORDS_SELECT_COLUMNS\)/
  );
});
