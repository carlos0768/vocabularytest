'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { hasDisplayableMorphology } from '@/lib/morphology/format';
import type { SubscriptionStatus, Word } from '@/types';

/**
 * 単語詳細表示用の語源バックフィル。
 *
 * word.morphology を持たない単語（語源生成がレスポンスに間に合わなかった
 * 手動追加語・語源機能より前に作られた語など）について、リール配信と同じ
 * lexicon 共有キャッシュ（GET /api/words/morphology）から表示時に取得して
 * 補う。取得できた語源は次回以降のために単語行へも best-effort で保存する
 * （読み取り専用リポジトリでは保存だけ諦めて表示は維持する）。
 *
 * 返り値は表示に使う morphology。単語行が既に表示可能な語源を持つ場合は
 * その値をそのまま返し、フェッチは行わない。
 */
export function useMorphologyBackfill(
  word: Word | null,
  options: {
    /** バックフィル成功時に morphology をマージ済みの Word を親状態へ通知する */
    onBackfilled?: (updated: Word) => void;
  } = {},
): Word['morphology'] {
  const { subscription } = useAuth();
  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(
    () => getRepository(subscriptionStatus, wasPro),
    [subscriptionStatus, wasPro],
  );

  const [backfilled, setBackfilled] = useState<{
    wordId: string;
    morphology: NonNullable<Word['morphology']>;
  } | null>(null);

  // word オブジェクトやコールバックはレンダー毎に identity が変わりうるので、
  // fetch effect の依存には入れず ref 経由で最新値を参照する
  // （この同期 effect は fetch effect より先に宣言してあるので先に実行される）。
  const wordRef = useRef(word);
  const onBackfilledRef = useRef(options.onBackfilled);
  useEffect(() => {
    wordRef.current = word;
    onBackfilledRef.current = options.onBackfilled;
  });

  const wordId = word?.id;
  const english = word?.english;
  const hasOwnMorphology = hasDisplayableMorphology(word?.morphology);

  useEffect(() => {
    if (!wordId || !english || hasOwnMorphology) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(
          `/api/words/morphology?english=${encodeURIComponent(english)}`,
        );
        if (!response.ok) return;
        const data = await response.json() as {
          success?: boolean;
          morphology?: Word['morphology'] | null;
        };
        const morphology = data.success ? data.morphology : null;
        if (cancelled || !hasDisplayableMorphology(morphology)) return;

        setBackfilled({ wordId, morphology });

        const current = wordRef.current;
        if (current && current.id === wordId) {
          onBackfilledRef.current?.({ ...current, morphology });
        }

        try {
          await repository.updateWord(wordId, { morphology });
        } catch {
          // 読み取り専用リポジトリ等で保存できなくても表示は維持する
        }
      } catch (err) {
        console.warn('[morphology-backfill] Failed (non-critical):', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wordId, english, hasOwnMorphology, repository]);

  if (word && hasOwnMorphology) return word.morphology;
  return backfilled && backfilled.wordId === wordId ? backfilled.morphology : undefined;
}
