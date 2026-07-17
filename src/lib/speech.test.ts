import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickEnglishVoice } from './speech';

type FakeVoice = { lang: string; default: boolean; localService: boolean };

function voice(lang: string, opts: Partial<FakeVoice> = {}): FakeVoice {
  return { lang, default: false, localService: false, ...opts };
}

test('英語ボイスがなければ -1 を返す', () => {
  assert.equal(pickEnglishVoice([]), -1);
  assert.equal(pickEnglishVoice([voice('ja-JP', { default: true })]), -1);
});

test('既定が日本語ボイスでも英語ボイスを選ぶ', () => {
  const voices = [voice('ja-JP', { default: true, localService: true }), voice('en-US')];
  assert.equal(pickEnglishVoice(voices), 1);
});

test('en-US を他の英語ボイスより優先する', () => {
  const voices = [voice('en-AU'), voice('en-GB'), voice('en-US')];
  assert.equal(pickEnglishVoice(voices), 2);
});

test('同じ言語ならローカルボイスを優先する', () => {
  const voices = [voice('en-US'), voice('en-US', { localService: true })];
  assert.equal(pickEnglishVoice(voices), 1);
});

test('アンダースコア区切りの言語タグも扱える', () => {
  const voices = [voice('ja_JP'), voice('en_US')];
  assert.equal(pickEnglishVoice(voices), 1);
});

test('en-US がなければ en-GB、それもなければ他の英語ボイス', () => {
  assert.equal(pickEnglishVoice([voice('en-AU'), voice('en-GB')]), 1);
  assert.equal(pickEnglishVoice([voice('ja-JP'), voice('en-IN')]), 1);
});
