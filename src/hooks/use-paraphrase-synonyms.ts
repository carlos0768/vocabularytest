'use client';

import { useEffect, useState } from 'react';
import { fetchParaphraseMaterials, isParaphraseCandidateWord } from '@/lib/paraphrase/client';
import type { Word } from '@/types';

/**
 * 単語詳細に出す言い換え (英語の同義語)。
 *
 * 言い換えクイズと同じ辞書 (`/api/paraphrase/lookup`) を表示時に引く。単語行には
 * 保存しない —— 辞書は決定的で、同じ語には毎回同じ答えが返るので、保存しても
 * 同期の手間が増えるだけ。同じページの中では `fetchParaphraseMaterials` が
 * english ごとに覚えるので、同じ語を開き直しても二度は取りに行かない。
 *
 * 返り値: 取得できた同義語 (良い順)。辞書に無い語・古典語・取得前・失敗時は undefined。
 * 取得の失敗は表示が出ないだけなので黙って諦める (詳細画面の他の情報には影響しない)。
 */
export function useParaphraseSynonyms(word: Word | null): string[] | undefined {
  const [result, setResult] = useState<{ wordId: string; synonyms: string[] } | null>(null);

  const wordId = word?.id;
  const english = word?.english;
  const eligible = !!word && isParaphraseCandidateWord(word);

  useEffect(() => {
    if (!wordId || !english || !eligible) return;
    const current = word;
    if (!current) return;
    let cancelled = false;

    (async () => {
      try {
        const materials = await fetchParaphraseMaterials([current]);
        const material = materials.get(wordId);
        if (cancelled || !material || material.answers.length === 0) return;
        setResult({ wordId, synonyms: material.answers });
      } catch (err) {
        console.warn('[paraphrase-synonyms] Failed (non-critical):', err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // word オブジェクトはレンダー毎に identity が変わりうるので、id と見出し語で見る。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordId, english, eligible]);

  return result && result.wordId === wordId ? result.synonyms : undefined;
}
