#!/usr/bin/env node
/**
 * 音読チャレンジの固定文に、音声がそろっているかを確認する。
 *
 *   npm run audio:voice-quiz:check
 *
 * 足りない音声はその場で合成音声にフォールバックするのでクイズは動くが、
 * 「自然な音声にしたはずなのに合成音声のまま」には気づけない。
 * 実際、生成した音声の名前が一斉にずれて全部が使われなくなっていたことがある。
 * デプロイ前にこれで見られるようにしておく。
 */

import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio', 'voice-quiz');

const { voiceQuizAudioClips } = await import('../src/lib/quiz/voice-quiz-audio.ts');
const clips = voiceQuizAudioClips();

let present = [];
try {
  present = (await readdir(outDir)).filter((name) => name.endsWith('.mp3'));
} catch {
  // ディレクトリごと無い = まだ1件も生成していない。
}

const have = new Set(present);
const missing = clips.filter((clip) => !have.has(`${clip.id}.mp3`));
const stale = present.filter((name) => !clips.some((clip) => `${clip.id}.mp3` === name));

console.log(`固定文 ${clips.length}件 / 音声 ${present.length}件`);

if (missing.length > 0) {
  console.log(`\n音声が無く合成音声になるもの (${missing.length}件):`);
  for (const clip of missing) console.log(`  ${clip.id}.mp3  「${clip.text}」`);
  console.log('\n  npm run audio:voice-quiz  で生成できます。');
}

if (stale.length > 0) {
  console.log(`\nどの文にも対応しない音声 (${stale.length}件):`);
  for (const name of stale) console.log(`  ${name}`);
  console.log('\n  npm run audio:voice-quiz  を流すと消えます。');
}

if (missing.length === 0 && stale.length === 0) {
  console.log('\nすべてそろっています。');
}

// 足りなくてもクイズは動くので、これでCIは落とさない。
process.exit(0);
