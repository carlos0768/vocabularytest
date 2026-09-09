import { isClassicalWord } from '@/lib/classical/is-classical';
import type { ExampleSeedWord, GeneratedExample } from '@/lib/ai/generate-example-sentences';
import type {
  ClassicalExampleSeedWord,
  GeneratedClassicalExample,
} from '@/lib/ai/generate-classical-examples';

export interface ClientLocalExampleWord {
  english: string;
  japanese: string;
  /** 古典語の印。英語専用の後処理から外すために isClassicalWord() が読む。 */
  classicalEntryId?: string | null;
  isClassical?: boolean | null;
  reading?: string | null;
  partOfSpeechTags?: string[];
  exampleSentence?: string;
  exampleSentenceJa?: string;
}

/**
 * 英語の例文生成に載せる語かどうか。
 *
 * **シードを組む側と結果を当てる側で必ず同じ述語を使うこと。**
 * client_local の経路は「例文を持たない語の出現順」で AI の返り値と対応づけて
 * いるので、片方だけが古典語を飛ばすと以降の語が1つずつズレて、別の単語の
 * 例文が付く。
 */
function needsEnglishExample(word: ClientLocalExampleWord): boolean {
  return !word.exampleSentence && !isClassicalWord(word);
}

export interface ServerCloudExampleCandidateWord {
  id: string;
  english: string;
  japanese: string;
  example_sentence?: string | null;
  /** 古典語の印。英語専用の後処理から外すために isClassicalWord() が読む。 */
  classical_entry_id?: string | null;
}

export interface ServerCloudExampleUpdatePayload {
  example_sentence: string;
  example_sentence_ja: string;
  part_of_speech_tags: string[];
}

export function buildClientLocalExampleSeedWords(
  words: readonly ClientLocalExampleWord[],
): ExampleSeedWord[] {
  const seedWords: ExampleSeedWord[] = [];

  for (const word of words) {
    // 古典語は英語例文の生成対象外（古文の例文は別経路で作る）
    if (!needsEnglishExample(word)) {
      continue;
    }

    seedWords.push({
      id: String(seedWords.length),
      english: word.english,
      japanese: word.japanese,
    });
  }

  return seedWords;
}

export function applyClientLocalGeneratedExamples<T extends ClientLocalExampleWord>(
  words: readonly T[],
  generatedExamples: readonly GeneratedExample[],
): T[] {
  const exampleMap = new Map(generatedExamples.map((example) => [example.wordId, example]));
  let exampleIndex = 0;

  return words.map((word) => {
    // シード側と同じ述語で飛ばす。ここを揃えないと index がズレる。
    if (!needsEnglishExample(word)) {
      return word;
    }

    const generated = exampleMap.get(String(exampleIndex));
    exampleIndex += 1;

    if (!generated) {
      return word;
    }

    const nextWord: T = {
      ...word,
      exampleSentence: generated.exampleSentence,
      exampleSentenceJa: generated.exampleSentenceJa,
    };

    if (!word.partOfSpeechTags?.length) {
      nextWord.partOfSpeechTags = generated.partOfSpeechTags;
    }

    return nextWord;
  });
}

export function buildServerCloudExampleSeedWords(
  words: readonly ServerCloudExampleCandidateWord[],
): ExampleSeedWord[] {
  return words
    .filter((word) => !isClassicalWord(word))
    .filter((word) => !word.example_sentence || word.example_sentence.trim().length === 0)
    .map((word) => ({
      id: word.id,
      english: word.english,
      japanese: word.japanese,
    }));
}

export function buildServerCloudExampleUpdatePayload(
  example: GeneratedExample,
): ServerCloudExampleUpdatePayload {
  return {
    example_sentence: example.exampleSentence,
    example_sentence_ja: example.exampleSentenceJa,
    part_of_speech_tags: example.partOfSpeechTags,
  };
}

// ---------- 古典語（古文の例文＋現代語訳） ----------
//
// 英語側とは別の関数に分けてある。同じ配列を1回で捌こうとすると、シードの
// index 空間が英語と古典で混ざって「どちらの結果か」を取り違える。

/** 古典語の例文シードに載せる語かどうか。 */
function needsClassicalExample(word: ClientLocalExampleWord): boolean {
  return !word.exampleSentence && isClassicalWord(word);
}

/**
 * client_local 経路の古典語シード。英語側と同じく出現順の index を id にする
 * （こちらは古典語だけを数える独立した index 空間）。
 */
export function buildClientLocalClassicalExampleSeedWords(
  words: readonly ClientLocalExampleWord[],
): ClassicalExampleSeedWord[] {
  const seedWords: ClassicalExampleSeedWord[] = [];

  for (const word of words) {
    if (!needsClassicalExample(word)) continue;

    seedWords.push({
      id: String(seedWords.length),
      headword: word.english,
      // 多義語は代表義（先頭の訳）で例文を作らせる。全語義ぶん作ると
      // コストが語義数に比例して膨らむわりに、学習にはまず使われない。
      meaning: word.japanese,
      ...(word.reading ? { reading: word.reading } : {}),
    });
  }

  return seedWords;
}

/** 生成した古文の例文を client_local の単語配列へ当てる。 */
export function applyClientLocalGeneratedClassicalExamples<T extends ClientLocalExampleWord>(
  words: readonly T[],
  generatedExamples: readonly GeneratedClassicalExample[],
): T[] {
  const exampleMap = new Map(generatedExamples.map((example) => [example.wordId, example]));
  let exampleIndex = 0;

  return words.map((word) => {
    if (!needsClassicalExample(word)) return word;

    const generated = exampleMap.get(String(exampleIndex));
    exampleIndex += 1;
    if (!generated) return word;

    // 品詞タグは触らない。英語の品詞体系は古典語に当たらない。
    return {
      ...word,
      exampleSentence: generated.exampleSentence,
      exampleSentenceJa: generated.exampleSentenceJa,
    };
  });
}

export interface ServerCloudClassicalExampleCandidateWord {
  id: string;
  english: string;
  japanese: string;
  example_sentence?: string | null;
  classical_entry_id?: string | null;
  reading?: string | null;
}

/** server_cloud 経路の古典語シード。id は挿入済みの words.id をそのまま使う。 */
export function buildServerCloudClassicalExampleSeedWords(
  words: readonly ServerCloudClassicalExampleCandidateWord[],
): ClassicalExampleSeedWord[] {
  return words
    .filter((word) => isClassicalWord(word))
    .filter((word) => !word.example_sentence || word.example_sentence.trim().length === 0)
    .map((word) => ({
      id: word.id,
      headword: word.english,
      meaning: word.japanese,
      ...(word.reading ? { reading: word.reading } : {}),
    }));
}

/**
 * 古典語の例文のDB更新ペイロード。
 * 英語版と違い part_of_speech_tags を含めない（古典語には当たらないため）。
 */
export function buildServerCloudClassicalExampleUpdatePayload(
  example: GeneratedClassicalExample,
): { example_sentence: string; example_sentence_ja: string } {
  return {
    example_sentence: example.exampleSentence,
    example_sentence_ja: example.exampleSentenceJa,
  };
}
