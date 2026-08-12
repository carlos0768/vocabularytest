#!/usr/bin/env node
/**
 * 音読チャレンジの固定文を、GCP Text-to-Speech で音声にして public 配下へ書き出す。
 *
 *   GOOGLE_CLOUD_TTS_API_KEY=xxx node scripts/generate-voice-quiz-audio.mjs
 *
 * 台本は src/lib/quiz/voice-quiz-audio.ts が唯一の出どころ。文言を足したり
 * 直したりしたら、このスクリプトを流し直して音声を作り直す。
 * 生成物 (public/audio/voice-quiz/*.mp3) はリポジトリにコミットする ——
 * 実行のたびに課金される類のものを、ビルドのたびに叩かせない。
 *
 * 既にあるファイルは飛ばす。作り直したいときは --force を付ける。
 * 台本に無くなった音声はその場で消す。残したいときは --keep-stale を付ける。
 *
 * キーは Cloud Text-to-Speech API を有効にしたもの。音声認識用の
 * GOOGLE_CLOUD_SPEECH_API_KEY と同じプロジェクトのキーでよいが、
 * API の制限に Text-to-Speech を含めておくこと。
 */

import { mkdir, writeFile, access, readdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';

/** 日本語の声。Neural2 は自然さの割に安く、読み上げ用途に十分。 */
const VOICE_BY_LANG = {
  ja: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-B' },
  en: { languageCode: 'en-US', name: 'en-US-Neural2-F' },
};

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const outDir = join(repoRoot, 'public', 'audio', 'voice-quiz');

const force = process.argv.includes('--force');
const keepStale = process.argv.includes('--keep-stale');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * 台本を読む。TypeScript のまま読めないので、必要な文言だけ抜き出す。
 * ここを手で写経すると台本と二重管理になるので、tsx 経由で読み込む。
 */
async function loadClips() {
  const { voiceQuizAudioClips } = await import('../src/lib/quiz/voice-quiz-audio.ts');
  return voiceQuizAudioClips();
}

async function synthesize(apiKey, clip) {
  const voice = VOICE_BY_LANG[clip.lang];
  const response = await fetch(`${TTS_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text: clip.text },
      voice,
      // 少しゆっくりめ。出題を聞き取りやすくする。
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.98 },
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.audioContent) {
    const message = data?.error?.message || `HTTP ${response.status}`;
    throw new Error(`${clip.id}: ${message}`);
  }
  return Buffer.from(data.audioContent, 'base64');
}

async function main() {
  const apiKey = process.env.GOOGLE_CLOUD_TTS_API_KEY?.trim();
  if (!apiKey) {
    console.error('GOOGLE_CLOUD_TTS_API_KEY が設定されていません。');
    console.error('Cloud Text-to-Speech API を有効にしたAPIキーを渡してください。');
    process.exit(1);
  }

  const clips = await loadClips();
  await mkdir(outDir, { recursive: true });

  let written = 0;
  let skipped = 0;

  for (const clip of clips) {
    const path = join(outDir, `${clip.id}.mp3`);

    if (!force && (await exists(path))) {
      skipped += 1;
      continue;
    }

    const audio = await synthesize(apiKey, clip);
    await writeFile(path, audio);
    written += 1;
    console.log(`✓ ${clip.id}.mp3  「${clip.text}」`);
  }

  console.log(`\n生成 ${written}件 / 既存を維持 ${skipped}件 → ${outDir}`);

  // 文言を変えると古い音声が残る。台本に無いファイルはもう誰も再生しないので、
  // 手で消させずにここで片付ける。消えて困るものは無い —— このディレクトリの
  // 中身はすべてこのスクリプトの生成物で、台本さえあれば作り直せる。
  const wanted = new Set(clips.map((clip) => `${clip.id}.mp3`));
  const present = (await readdir(outDir)).filter((name) => name.endsWith('.mp3'));
  const stale = present.filter((name) => !wanted.has(name));

  if (stale.length > 0) {
    if (!keepStale) {
      for (const name of stale) await rm(join(outDir, name));
    }
    const headline = keepStale
      ? `使われていない音声が ${stale.length}件あります (--keep-stale のため残しました)`
      : `使われていない音声を ${stale.length}件消しました (文言を変えた名残)`;
    console.log(`\n${headline}:`);
    for (const name of stale) console.log(`  ${name}`);
    if (keepStale) console.log('消してからコミットしてください。');
  }

  const changed = written > 0 || (stale.length > 0 && !keepStale);
  if (changed) console.log('\npublic/audio/voice-quiz の変更をコミットしてください。');
}

main().catch((error) => {
  console.error('音声の生成に失敗しました:', error.message);
  process.exit(1);
});
