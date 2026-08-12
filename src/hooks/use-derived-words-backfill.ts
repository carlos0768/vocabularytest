'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { hasDisplayableDerivedWords } from '@/lib/derived-words/format';
import type { SubscriptionStatus, Word } from '@/types';

/**
 * 単語詳細表示用の派生語バックフィル。use-morphology-backfill と同じ構造。
 *
 * word.derivedWords を持たない単語（派生語オプションが付く前に作られた語・
 * オプションをオフで追加した語）について、lexicon 共有キャッシュ
 * （GET /api/words/derived-words）から表示時に取得して補う。取得できた
 * 派生語は次回以降のために単語行へも best-effort で保存する（読み取り専用
 * リポジトリでは保存だけ諦めて表示は維持する）。
 *
 * 生成は走らない: キャッシュに無ければ何も表示しない。誰かが一度コインを
 * 払って生成した語は全ユーザーで共有されるので、ここでの取得は無料。
 *
 * 返り値は表示に使う derivedWords。単語行が既に表示可能な派生語を持つ場合は
 * その値をそのまま返し、フェッチは行わない。
 */
export function useDerivedWordsBackfill(
  word: Word | null,
  options: {
    /** バックフィル成功時に derivedWords をマージ済みの Word を親状態へ通知する */
    onBackfilled?: (updated: Word) => void;
  } = {},
): Word['derivedWords'] {
  const { subscription } = useAuth();
  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(
    () => getRepository(subscriptionStatus, wasPro),
    [subscriptionStatus, wasPro],
  );

  const [backfilled, setBackfilled] = useState<{
    wordId: string;
    derivedWords: NonNullable<Word['derivedWords']>;
  } | null>(null);

  // word オブジェクトやコールバックはレンダー毎に identity が変わりうるので、
  // fetch effect の依存には入れず ref 経由で最新値を参照する。
  const wordRef = useRef(word);
  const onBackfilledRef = useRef(options.onBackfilled);
  useEffect(() => {
    wordRef.current = word;
    onBackfilledRef.current = options.onBackfilled;
  });

  const wordId = word?.id;
  const english = word?.english;
  const hasOwnDerivedWords = hasDisplayableDerivedWords(word?.derivedWords);

  useEffect(() => {
    if (!wordId || !english || hasOwnDerivedWords) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(
          `/api/words/derived-words?english=${encodeURIComponent(english)}`,
        );
        if (!response.ok) return;
        const data = await response.json() as {
          success?: boolean;
          derivedWords?: Word['derivedWords'] | null;
        };
        const derivedWords = data.success ? data.derivedWords : null;
        if (cancelled || !hasDisplayableDerivedWords(derivedWords)) return;

        setBackfilled({ wordId, derivedWords });

        const current = wordRef.current;
        if (current && current.id === wordId) {
          onBackfilledRef.current?.({ ...current, derivedWords });
        }

        try {
          await repository.updateWord(wordId, { derivedWords });
        } catch {
          // 読み取り専用リポジトリ等で保存できなくても表示は維持する
        }
      } catch (err) {
        console.warn('[derived-words-backfill] Failed (non-critical):', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wordId, english, hasOwnDerivedWords, repository]);

  if (word && hasOwnDerivedWords) return word.derivedWords;
  return backfilled && backfilled.wordId === wordId ? backfilled.derivedWords : undefined;
}
