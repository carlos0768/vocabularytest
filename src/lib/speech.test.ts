import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickEnglishVoice,
  pickVoiceForLang,
  shouldStopWaitingForSpeech,
  speechStartGraceMs,
} from './speech';

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

test('pickVoiceForLang: 日本語ボイスがなければ -1 を返す', () => {
  assert.equal(pickVoiceForLang([], 'ja'), -1);
  assert.equal(pickVoiceForLang([voice('en-US', { default: true })], 'ja'), -1);
});

test('pickVoiceForLang: ja-JP を優先して選ぶ', () => {
  const voices = [voice('en-US'), voice('ja-JP')];
  assert.equal(pickVoiceForLang(voices, 'ja'), 1);
});

// ============ 読み上げの待ち方 ============

const grace = { elapsedMs: 0, graceMs: 1560 };

test('鳴っている間は待ち続ける', () => {
  assert.equal(
    shouldStopWaitingForSpeech({ spoke: true, speaking: true, pending: false, ...grace }),
    false,
  );
  // 次の発話が控えているだけの状態も、まだ終わりではない。
  assert.equal(
    shouldStopWaitingForSpeech({ spoke: true, speaking: false, pending: true, ...grace }),
    false,
  );
});

test('鳴っていた声が止まったら、onend を待たずに次へ進む', () => {
  assert.equal(
    shouldStopWaitingForSpeech({ spoke: true, speaking: false, pending: false, ...grace }),
    true,
  );
});

/**
 * iOS は発話を黙って捨てることがある。鳴り始めるのを待つ猶予を過ぎたら、
 * 文字数から決めた上限 (最大20秒) を待たずに諦める —— そこで待つと、
 * 出題の読み上げが終わらず録音が始まらない。
 */
test('鳴り始めないまま猶予を過ぎたら諦める', () => {
  const dropped = { spoke: false, speaking: false, pending: false, graceMs: 1560 };
  assert.equal(shouldStopWaitingForSpeech({ ...dropped, elapsedMs: 400 }), false);
  assert.equal(shouldStopWaitingForSpeech({ ...dropped, elapsedMs: 1560 }), true);
  assert.equal(shouldStopWaitingForSpeech({ ...dropped, elapsedMs: 5000 }), true);
});

/**
 * 合成音声が鳴らない端末では、この猶予が1片ごとにそのまま沈黙になる。
 * 続けて捨てられたら短くし、「開始を押したのに始まらない」を積み上げない。
 */
test('捨てられ続けたら、鳴り始めを待つ猶予を詰める', () => {
  assert.equal(speechStartGraceMs(0), 1500);
  assert.ok(speechStartGraceMs(1) < speechStartGraceMs(0));
  assert.ok(speechStartGraceMs(2) < speechStartGraceMs(1));
  // いくら続いても待ちを0にはしない。遅れて鳴り出した声を拾えるようにしておく。
  assert.ok(speechStartGraceMs(10) > 0);
});

test('鳴り始めるのが遅いだけなら諦めない', () => {
  // 猶予内に鳴り出したものは、その後ずっと待つ。
  assert.equal(
    shouldStopWaitingForSpeech({ spoke: true, speaking: true, pending: false, elapsedMs: 9000, graceMs: 1560 }),
    false,
  );
});
