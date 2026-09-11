// Signup ID (user_handle) candidate generation.
//
// The signup profile step asks Japanese users to invent a `[a-z0-9_]{3,20}`
// handle out of nothing, which is the step most people stall on. These helpers
// build candidates from what the user already typed (their display name) so the
// UI can offer ready-made IDs; availability is checked server-side by
// /api/auth/suggest-handle before any candidate reaches the user.

export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;
export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 20;

/** Seeds shorter than this carry no recognizable trace of the name. */
const MIN_SEED_LENGTH = 2;

const KANA_ROMAJI: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', ゐ: 'i', ゑ: 'e', を: 'o', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
};

const YOUON_ROMAJI: Record<string, string> = { ゃ: 'ya', ゅ: 'yu', ょ: 'yo' };

/** Consonant clusters that survive a youon merge (しゃ -> sha, ちゃ -> cha). */
const YOUON_STEMS: Record<string, string> = { shi: 'sh', chi: 'ch', ji: 'j' };

function katakanaToHiragana(char: string): string {
  const code = char.codePointAt(0) ?? 0;
  // Full-width katakana ァ(0x30A1)-ヶ(0x30F6) maps onto hiragana 0x60 below.
  if (code >= 0x30a1 && code <= 0x30f6) return String.fromCodePoint(code - 0x60);
  return char;
}

function mergeYouon(base: string, youon: string): string {
  const stem = YOUON_STEMS[base];
  if (stem) return `${stem}${youon.slice(1)}`;
  // Otherwise drop the base vowel: き + ゃ -> kya.
  return `${base.slice(0, -1)}${youon}`;
}

/**
 * Romanizes the kana in a name so Japanese display names still yield a handle.
 * Kanji has no reading available client-side and is simply dropped.
 */
export function romanizeKana(input: string): string {
  const chars = Array.from(input).map(katakanaToHiragana);
  let result = '';
  let pendingSokuon = false;

  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i];

    if (char === 'っ') {
      pendingSokuon = true;
      continue;
    }
    if (char === 'ー' || char === '・' || char === '゛' || char === '゜') continue;

    const base = KANA_ROMAJI[char];
    if (!base) {
      pendingSokuon = false;
      // Latin letters and digits pass through; anything else (kanji, symbols)
      // is dropped by toHandleSeed's filter.
      result += char;
      continue;
    }

    const next = chars[i + 1];
    const youon = next ? YOUON_ROMAJI[next] : undefined;
    let romaji = base;
    if (youon) {
      romaji = mergeYouon(base, youon);
      i += 1;
    }

    if (pendingSokuon) {
      romaji = `${romaji[0]}${romaji}`;
      pendingSokuon = false;
    }

    result += romaji;
  }

  return result;
}

/**
 * Turns a display name into a handle seed: romanized, lowercased, and stripped
 * of everything the handle format rejects. Returns '' when nothing usable is
 * left (e.g. a kanji-only name), which callers treat as "no seed".
 */
export function toHandleSeed(displayName: string): string {
  const romanized = romanizeKana(displayName.trim().toLowerCase());
  const stripped = romanized
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_{2,}/g, '_')
    .replace(/^_+/, '')
    .slice(0, HANDLE_MAX_LENGTH)
    .replace(/_+$/, '');

  return stripped.length >= MIN_SEED_LENGTH ? stripped : '';
}

const ADJECTIVES = [
  'brave', 'calm', 'clever', 'eager', 'fresh', 'gentle', 'happy', 'keen',
  'lucky', 'quiet', 'rapid', 'smart', 'sunny', 'swift', 'vivid', 'bright',
] as const;

const NOUNS = [
  'word', 'vocab', 'lexis', 'page', 'note', 'quiz', 'study', 'memo',
  'phrase', 'idiom', 'fox', 'owl', 'otter', 'panda', 'comet', 'maple',
] as const;

function pick<T>(items: readonly T[], random: () => number): T {
  const index = Math.min(items.length - 1, Math.floor(random() * items.length));
  return items[index];
}

function digits(random: () => number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += String(Math.min(9, Math.floor(random() * 10)));
  }
  return out;
}

/** Joins a seed and a suffix, trimming the seed (never the suffix) to fit. */
function joinWithinLimit(seed: string, suffix: string): string {
  const room = HANDLE_MAX_LENGTH - suffix.length;
  if (room < 1) return suffix.slice(0, HANDLE_MAX_LENGTH);
  return `${seed.slice(0, room).replace(/_+$/, '')}${suffix}`;
}

export interface HandleCandidateOptions {
  /** Display name to derive candidates from. Optional. */
  displayName?: string;
  /** A handle the user already typed (e.g. a taken one) to build variants of. */
  handle?: string;
  /** How many candidates to produce. */
  count?: number;
  /** Injectable randomness so tests stay deterministic. */
  random?: () => number;
}

/**
 * Builds `count` distinct, format-valid handle candidates. Name-derived
 * candidates come first so the user sees something recognizable at the top;
 * the themed word pool fills the rest (and covers kanji-only names).
 */
export function buildHandleCandidates(options: HandleCandidateOptions = {}): string[] {
  const { count = 3, random = Math.random } = options;
  const seeds = [
    toHandleSeed(options.handle ?? ''),
    toHandleSeed(options.displayName ?? ''),
  ].filter((seed) => seed.length > 0);
  const seed = seeds[0] ?? '';
  const candidates: string[] = [];

  const add = (value: string) => {
    if (candidates.length >= count) return;
    if (!HANDLE_PATTERN.test(value)) return;
    if (candidates.includes(value)) return;
    candidates.push(value);
  };

  if (seed) {
    add(seed);
    add(joinWithinLimit(seed, `_${digits(random, 2)}`));
    add(joinWithinLimit(seed, digits(random, 4)));
    add(joinWithinLimit(seed, `_${pick(NOUNS, random)}`));
    add(joinWithinLimit(seed, `_${pick(ADJECTIVES, random)}`));
  }

  // Guard against a pathological random source that keeps returning the same
  // pick: cap the attempts instead of looping until `count` is reached.
  for (let attempt = 0; attempt < count * 12 && candidates.length < count; attempt += 1) {
    const adjective = pick(ADJECTIVES, random);
    const noun = pick(NOUNS, random);
    add(`${adjective}_${noun}`);
    add(`${noun}${digits(random, 3)}`);
    add(`${adjective}${noun}${digits(random, 2)}`);
  }

  return candidates;
}
