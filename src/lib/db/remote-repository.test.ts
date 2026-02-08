import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WORDS_SELECT_COLUMNS } from './remote-repository';

test('WORDS_SELECT_COLUMNS excludes embedding and includes required columns', () => {
  const columns = WORDS_SELECT_COLUMNS.split(',').map((column) => column.trim());

  assert.equal(columns.includes('embedding'), false);

  const expectedColumns = [
    'id',
    'project_id',
    'english',
    'japanese',
    'distractors',
    'example_sentence',
    'example_sentence_ja',
    'status',
    'created_at',
    'last_reviewed_at',
    'next_review_at',
    'ease_factor',
    'interval_days',
    'repetition',
    'is_favorite',
  ];

  assert.deepEqual(columns, expectedColumns);
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
