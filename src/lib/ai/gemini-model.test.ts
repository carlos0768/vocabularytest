import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GEMINI_FLASH_MODEL, normalizeGeminiModel } from './gemini-model';

test('normalizeGeminiModel maps deprecated Gemini flash models to the active Gemini 2 flash model', () => {
  assert.equal(normalizeGeminiModel('gemini-2.0-flash-001'), DEFAULT_GEMINI_FLASH_MODEL);
  assert.equal(normalizeGeminiModel('gemini-1.5-flash-002'), DEFAULT_GEMINI_FLASH_MODEL);
  assert.equal(normalizeGeminiModel('models/gemini-2.5-flash-001'), DEFAULT_GEMINI_FLASH_MODEL);
});

test('normalizeGeminiModel preserves supported non-flash Gemini models', () => {
  assert.equal(normalizeGeminiModel('gemini-2.5-pro'), 'gemini-2.5-pro');
  assert.equal(normalizeGeminiModel('gemini-1.5-pro-002'), 'gemini-1.5-pro-002');
});
