import test from 'node:test';
import assert from 'node:assert/strict';

import { createTtsPlayer, ttsAudioUrl } from './tts-player';

/** テスト用の最低限のオーディオ要素。イベントは手で発火させる。 */
function createFakeAudio(options: { playRejects?: boolean } = {}) {
  const listeners = new Map<string, Set<() => void>>();
  const element = {
    src: '',
    preload: '',
    attributes: [] as string[],
    playCalls: 0,
    paused: false,
    setAttribute(name: string) { element.attributes.push(name); },
    removeAttribute() { element.src = ''; },
    load() {},
    pause() { element.paused = true; },
    play() {
      element.playCalls += 1;
      return options.playRejects ? Promise.reject(new Error('blocked')) : Promise.resolve();
    },
    addEventListener(type: string, handler: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(handler);
    },
    removeEventListener(type: string, handler: () => void) {
      listeners.get(type)?.delete(handler);
    },
    emit(type: string) {
      for (const handler of [...(listeners.get(type) ?? [])]) handler();
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
  return element;
}

type FakeAudio = ReturnType<typeof createFakeAudio>;

function playerWith(audio: FakeAudio, fetchImpl?: typeof fetch) {
  return createTtsPlayer({
    createAudio: () => audio as unknown as HTMLAudioElement,
    fetchImpl: fetchImpl ?? (async () => new Response(null)),
  });
}

test('URLはテキストと言語で決まる (同じ単語なら同じURL = キャッシュが効く)', () => {
  assert.equal(ttsAudioUrl('apple', 'en'), ttsAudioUrl('apple', 'en'));
  assert.notEqual(ttsAudioUrl('apple', 'en'), ttsAudioUrl('apple', 'ja'));
  assert.match(ttsAudioUrl('take off', 'en'), /text=take\+off/);
  assert.match(ttsAudioUrl('りんご', 'ja'), /lang=ja/);
});

test('unlock はユーザー操作の中で1回鳴らして要素を解錠する', () => {
  const audio = createFakeAudio();
  const player = playerWith(audio);

  player.unlock();

  assert.equal(audio.playCalls, 1);
  assert.match(audio.src, /^data:audio\/mpeg/);
  assert.ok(audio.attributes.includes('playsinline'));
});

test('要素は使い回す (iOSは操作外で作った要素の再生を拒むため)', async () => {
  const audio = createFakeAudio();
  let created = 0;
  const player = createTtsPlayer({
    createAudio: () => { created += 1; return audio as unknown as HTMLAudioElement; },
    fetchImpl: async () => new Response(null),
  });

  player.unlock();
  const first = player.play('apple', 'en');
  audio.emit('ended');
  await first;
  const second = player.play('banana', 'en');
  audio.emit('ended');
  await second;

  assert.equal(created, 1);
});

test('鳴り終わったら played で解決し、リスナーを残さない', async () => {
  const audio = createFakeAudio();
  const player = playerWith(audio);

  const playing = player.play('apple', 'en');
  assert.match(audio.src, /\/api\/tts\?/);
  audio.emit('ended');

  assert.equal(await playing, 'played');
  assert.equal(audio.listenerCount('ended'), 0);
  assert.equal(audio.listenerCount('error'), 0);
});

test('再生エラーは unavailable (呼び出し側が読み上げにフォールバックできる)', async () => {
  const audio = createFakeAudio();
  const player = playerWith(audio);

  const playing = player.play('apple', 'en');
  audio.emit('error');

  assert.equal(await playing, 'unavailable');
});

test('play() が拒否されても unavailable で必ず解決する', async () => {
  const audio = createFakeAudio({ playRejects: true });
  const player = playerWith(audio);

  assert.equal(await player.play('apple', 'en'), 'unavailable');
});

test('空文字は鳴らさない', async () => {
  const audio = createFakeAudio();
  const player = playerWith(audio);

  assert.equal(await player.play('   ', 'en'), 'unavailable');
  assert.equal(audio.playCalls, 0);
});

test('prefetch は同じURLを二度取りに行かない', async () => {
  const audio = createFakeAudio();
  const urls: string[] = [];
  const player = playerWith(audio, (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return new Response(null);
  }) as typeof fetch);

  player.prefetch('apple', 'en');
  player.prefetch('apple', 'en');
  player.prefetch('apple', 'ja');
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(urls.length, 2);
});

test('prefetch が失敗したら覚えず、次の機会に取り直す', async () => {
  const audio = createFakeAudio();
  let calls = 0;
  const player = playerWith(audio, (async () => {
    calls += 1;
    throw new Error('offline');
  }) as unknown as typeof fetch);

  player.prefetch('apple', 'en');
  await new Promise((resolve) => setTimeout(resolve, 0));
  player.prefetch('apple', 'en');
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls, 2);
});

test('dispose 後は鳴らさない', async () => {
  const audio = createFakeAudio();
  const player = playerWith(audio);

  player.unlock();
  player.dispose();

  assert.equal(await player.play('apple', 'en'), 'unavailable');
  assert.equal(audio.paused, true);
});
