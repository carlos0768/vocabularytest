'use client';

import { useEffect, useState } from 'react';

/**
 * 画像タイル（単語帳・バインダーの正方形アイコン）の上に置く文字色を、画像の
 * 明るさから決める。
 *
 * アイコンは画像をそのままタイルの面にしているので、明るい写真の上に白文字を
 * 置くと題名がほとんど読めない。画像の平均輝度を測って、明るい面には黒、暗い面
 * には白と、面と対照的な側の色を返す。
 *
 * 計測は 8x8 に縮めて描いた1枚から平均を取るだけ。結果は data URL をキーにして
 * モジュールキャッシュに載せるので、同じアイコンは1度しか測らない。
 */

export type ImageTone = 'light' | 'dark';

/** 明→暗の境目。0.5 ちょうどだと中間調の写真で色がちらつくので少し上に置く。 */
const LIGHT_THRESHOLD = 0.6;

const toneCache = new Map<string, ImageTone>();
const inflight = new Map<string, Promise<ImageTone>>();

function toTone(luminance: number): ImageTone {
  // 明るい面 = 文字は黒(dark)、暗い面 = 文字は白(light)。
  return luminance >= LIGHT_THRESHOLD ? 'dark' : 'light';
}

async function measureTone(source: string): Promise<ImageTone> {
  const cached = toneCache.get(source);
  if (cached) return cached;

  const existing = inflight.get(source);
  if (existing) return existing;

  const promise = new Promise<ImageTone>((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      try {
        const size = 8;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
          resolve('light');
          return;
        }
        context.drawImage(image, 0, 0, size, size);
        const { data } = context.getImageData(0, 0, size, size);

        let total = 0;
        let weight = 0;
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3] / 255;
          if (alpha === 0) continue;
          // sRGB の相対輝度（ガンマ補正は端折る。閾値判定には十分）。
          const luminance = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
          total += luminance * alpha;
          weight += alpha;
        }

        resolve(toTone(weight > 0 ? total / weight : 0));
      } catch {
        // 別オリジンの画像は getImageData が落ちる。既定の白文字に戻す。
        resolve('light');
      }
    };
    image.onerror = () => resolve('light');
    image.src = source;
  }).then((tone) => {
    toneCache.set(source, tone);
    inflight.delete(source);
    return tone;
  });

  inflight.set(source, promise);
  return promise;
}

/**
 * 画像の上に載せる文字色の側を返す。画像が無い / まだ測れていないあいだは
 * `fallback`（既定は 'light' = 白文字）。
 */
export function useImageTone(source: string | null | undefined, fallback: ImageTone = 'light'): ImageTone {
  // 測定済みのぶんはキャッシュからレンダー中に読む（effect で setState すると
  // 同じ値のために再レンダーが1回増えるため）。effect は未計測のときだけ走る。
  const [measured, setMeasured] = useState<{ source: string; tone: ImageTone } | null>(null);

  useEffect(() => {
    if (!source || toneCache.has(source)) return;

    let cancelled = false;
    void measureTone(source).then((tone) => {
      if (!cancelled) setMeasured({ source, tone });
    });
    return () => { cancelled = true; };
  }, [source]);

  if (!source) return fallback;
  return toneCache.get(source)
    ?? (measured?.source === source ? measured.tone : fallback);
}

/** タイル文字の色と、面から浮かせるための影。 */
export function imageToneTextStyle(tone: ImageTone): { color: string; textShadow: string } {
  return tone === 'dark'
    ? { color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255,255,255,0.45)' }
    : { color: '#fff', textShadow: '1px 1px 0 rgba(0,0,0,0.25)' };
}
