import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  combineWordMeanings,
  isAnyEnglishAnswerCorrect,
  isAnyJapaneseAnswerCorrect,
  isEnglishAnswerCorrect,
  normalizeEnglishAnswer,
  isJapaneseAnswerCorrect,
  japaneseAnswerCandidates,
  japaneseAnswerHints,
  MAX_ANSWER_HINTS,
  normalizeJapaneseAnswer,
} from './voice-quiz-answer';

test('a homophone transcribed with the wrong kanji is rescued by the other candidates', () => {
  // 「きづく」を「築く」と変換されても、候補に「気づく」があれば正解にする。
  assert.equal(isJapaneseAnswerCorrect('築く', '気づく'), false);
  assert.equal(isAnyJapaneseAnswerCorrect(['築く', '気づく'], '気づく'), true);
});

/**
 * 同じ音でも変換が割れる語は、候補をいくつ受け取っても正しい表記が出ないことがある。
 * 読みが分かっていれば、そこで拾う。
 */
test('a homophone with a completely different spelling is accepted via its reading', () => {
  const readings = { 御社: 'おんしゃ', 恩赦: 'おんしゃ' };
  assert.equal(isJapaneseAnswerCorrect('御社', '恩赦'), false);
  assert.equal(isJapaneseAnswerCorrect('御社', '恩赦', readings), true);
  assert.equal(isAnyJapaneseAnswerCorrect(['御社'], '恩赦', readings), true);
});

test('a kanji transcription of a katakana meaning is accepted via its reading', () => {
  // 「コケ」と登録されている語を「苔」と書かれても、音は合っている。
  assert.equal(isJapaneseAnswerCorrect('苔', 'コケ'), false);
  assert.equal(isJapaneseAnswerCorrect('苔', 'コケ', { 苔: 'こけ' }), true);
});

test('readings only cover the meaning they belong to', () => {
  // 読みが付いても、音の違う語は正解にならない。
  assert.equal(
    isJapaneseAnswerCorrect('御社', '会釈', { 御社: 'おんしゃ', 会釈: 'えしゃく' }),
    false,
  );
});

test('a reading rescues one meaning out of several', () => {
  const readings = { 御社: 'おんしゃ', 気づく: 'きづく', 恩赦: 'おんしゃ' };
  assert.equal(isJapaneseAnswerCorrect('御社', '気づく、恩赦', readings), true);
});

test('candidates that are all wrong stay wrong', () => {
  assert.equal(isAnyJapaneseAnswerCorrect(['走る', '奔る'], '気づく'), false);
});

test('an empty candidate list is rejected', () => {
  assert.equal(isAnyJapaneseAnswerCorrect([], '気づく'), false);
});

test('normalizeJapaneseAnswer folds katakana, width and punctuation', () => {
  assert.equal(normalizeJapaneseAnswer('コーヒー'), normalizeJapaneseAnswer('こーひー'));
  assert.equal(normalizeJapaneseAnswer('気づく。'), '気づく');
  assert.equal(normalizeJapaneseAnswer(' 気 づく '), '気づく');
  assert.equal(normalizeJapaneseAnswer('ＡＢＣ'), 'abc');
});

test('exact meaning is accepted', () => {
  assert.equal(isJapaneseAnswerCorrect('気づく', '気づく'), true);
});

test('trailing punctuation from speech recognition does not fail the answer', () => {
  assert.equal(isJapaneseAnswerCorrect('気づく。', '気づく'), true);
  assert.equal(isJapaneseAnswerCorrect('「気づく」', '気づく'), true);
});

test('any one of several registered meanings is accepted', () => {
  assert.equal(isJapaneseAnswerCorrect('認識する', '気づく、認識する'), true);
  assert.equal(isJapaneseAnswerCorrect('気づく', '気づく、認識する'), true);
});

test('meanings separated by a slash are split too', () => {
  assert.equal(isJapaneseAnswerCorrect('はっきりさせる', '明確にする／はっきりさせる'), true);
});

test('answering the core of a longer meaning is accepted', () => {
  assert.equal(isJapaneseAnswerCorrect('作り上げる', '入念に作り上げる'), true);
});

test('a parenthetical note may be omitted', () => {
  assert.equal(isJapaneseAnswerCorrect('与える', '(人に)与える'), true);
  assert.equal(isJapaneseAnswerCorrect('人に与える', '(人に)与える'), true);
});

test('katakana meanings match however they are transcribed', () => {
  assert.equal(isJapaneseAnswerCorrect('コーヒー', 'こーひー'), true);
});

test('a wrong meaning is rejected', () => {
  assert.equal(isJapaneseAnswerCorrect('走る', '気づく'), false);
});

test('a bare stray fragment is rejected', () => {
  // 「する」だけで「勉強する」を正解にしない。
  assert.equal(isJapaneseAnswerCorrect('る', '勉強する'), false);
});

test('empty or silent input is rejected', () => {
  assert.equal(isJapaneseAnswerCorrect('', '気づく'), false);
  assert.equal(isJapaneseAnswerCorrect('  ', '気づく'), false);
});

test('japaneseAnswerHints keeps the original spelling so hints stay usable', () => {
  // 比較用の候補は長音を落とすが、ヒントは表記のまま渡さないと役に立たない。
  assert.deepEqual(japaneseAnswerHints('コーヒー'), ['コーヒー']);
  assert.ok(japaneseAnswerCandidates('コーヒー')[0] !== 'コーヒー');
});

test('japaneseAnswerHints splits meanings and offers the parenthetical-free form', () => {
  const hints = japaneseAnswerHints('気づく、(人に)与える');
  assert.ok(hints.includes('気づく'));
  // 括弧は読み上げられないので、ヒントとしては記号を落とした形で渡す。
  assert.ok(hints.includes('人に与える'));
  assert.ok(hints.includes('与える'));
});

test('japaneseAnswerHints stays within what the recognition API accepts', () => {
  // 訳が長く並ぶ単語でヒントが増えすぎると、リクエストごと弾かれて認識が失敗する。
  const hints = japaneseAnswerHints('あ、い、う、え、お、か、き、く、け、こ');
  assert.ok(hints.length <= MAX_ANSWER_HINTS, `too many hints: ${hints.length}`);
});

test('japaneseAnswerCandidates splits and folds every meaning', () => {
  const candidates = japaneseAnswerCandidates('気づく、認識する');
  assert.equal(candidates.length, 2);
  assert.ok(candidates.includes('気づく'));
  assert.ok(candidates.includes('認識する'));
});

// ============ 日→英 ============

test('an English answer matches regardless of case and punctuation', () => {
  assert.equal(isEnglishAnswerCorrect('Elaborate.', 'elaborate'), true);
  assert.equal(isEnglishAnswerCorrect('  elaborate  ', 'elaborate'), true);
});

test('a wrong English answer is rejected', () => {
  assert.equal(isEnglishAnswerCorrect('elaborated', 'elaborate'), false);
  assert.equal(isEnglishAnswerCorrect('', 'elaborate'), false);
});

test('any English candidate may carry the right spelling', () => {
  assert.equal(isAnyEnglishAnswerCorrect(['a lab rate', 'elaborate'], 'elaborate'), true);
  assert.equal(isAnyEnglishAnswerCorrect(['a lab rate'], 'elaborate'), false);
  assert.equal(isAnyEnglishAnswerCorrect([], 'elaborate'), false);
});

test('multi-word English answers collapse internal spacing', () => {
  assert.equal(normalizeEnglishAnswer('give   up'), 'give up');
  assert.equal(isEnglishAnswerCorrect('give  up', 'give up'), true);
});

// ============ 括弧書きの補足 ============

/**
 * 訳には「(人に)与える」「【他動詞】〜を許す」のように品詞や用法が
 * 添えられていることがある。声に出すときそこは読まないので、
 * 本体だけ答えても正解にする。
 */
test('every kind of bracket is treated as a note, not as the meaning', () => {
  assert.equal(isJapaneseAnswerCorrect('与える', '（人に）与える'), true);
  assert.equal(isJapaneseAnswerCorrect('許す', '【他動詞】〜を許す'), true);
  assert.equal(isJapaneseAnswerCorrect('美しい', '［形］美しい'), true);
  assert.equal(isJapaneseAnswerCorrect('高める', '[動]高める'), true);
});

/**
 * 括弧の中に区切り文字が入っていると、先に区切りで割ってしまった時代は
 * 閉じない括弧が残って中身が消せなかった。
 */
test('a separator inside the note does not leave the note behind', () => {
  assert.equal(isJapaneseAnswerCorrect('与える', '(人に、物を)与える'), true);
  assert.equal(isJapaneseAnswerCorrect('与える', '（人に・物を）与える'), true);
});

test('a long note no longer swamps the answer', () => {
  // 「他動詞を許す」に対して「許す」は半分未満なので、括弧を落とさないと落ちる。
  assert.equal(isJapaneseAnswerCorrect('許す', '【他動詞・文語】〜を許す'), true);
});

test('the note is not itself an acceptable answer', () => {
  assert.equal(isJapaneseAnswerCorrect('人に', '(人に)与える'), false);
});

test('recognition hints carry no bracket characters', () => {
  const hints = japaneseAnswerHints('(人に)与える、譲る');
  assert.ok(hints.includes('与える'));
  assert.ok(hints.includes('人に与える'), hints.join('|'));
  for (const hint of hints) {
    assert.ok(!/[（()）【】［\][]/.test(hint), `bracket left in hint: ${hint}`);
  }
});

test('a parenthetical in the spelling does not have to be spoken either', () => {
  assert.equal(isEnglishAnswerCorrect('take', 'take (after)'), true);
  assert.equal(isEnglishAnswerCorrect('take after', 'take (after)'), true);
  assert.equal(isEnglishAnswerCorrect('after', 'take (after)'), false);
});

// ============ 複数の意味 (メイン以外の訳も判定対象にする) ============

describe('combineWordMeanings', () => {
  it('主たる訳を先頭に、ぶら下がっている訳も全部つなぐ', () => {
    const combined = combineWordMeanings({
      japanese: '気づく',
      translations: [{ translationJa: '気づく' }, { translationJa: '認識する' }, { translationJa: '悟る' }],
    });
    assert.equal(combined, '気づく、認識する、悟る');
  });

  it('訳が無ければ主たる訳だけを返す', () => {
    assert.equal(combineWordMeanings({ japanese: 'りんご' }), 'りんご');
  });

  it('表記ゆれで重複する訳はまとめる', () => {
    const combined = combineWordMeanings({
      japanese: 'コーヒー',
      translations: [{ translationJa: 'こーひー' }, { translationJa: '珈琲' }],
    });
    assert.equal(combined, 'コーヒー、珈琲');
  });

  it('空の訳は落とす', () => {
    const combined = combineWordMeanings({
      japanese: '与える',
      translations: [{ translationJa: '  ' }, { translationJa: '授ける' }],
    });
    assert.equal(combined, '与える、授ける');
  });
});

describe('メイン以外の意味でも正解になる', () => {
  const word = {
    japanese: '気づく',
    translations: [{ translationJa: '気づく' }, { translationJa: '認識する、悟る' }],
  };

  it('2つ目の訳を答えても正解', () => {
    assert.equal(isAnyJapaneseAnswerCorrect(['認識する'], combineWordMeanings(word)), true);
  });

  it('1つの訳の中で「、」で並んだ意味も個別に評価する', () => {
    assert.equal(isAnyJapaneseAnswerCorrect(['悟る'], combineWordMeanings(word)), true);
  });

  it('主たる訳ももちろん正解', () => {
    assert.equal(isAnyJapaneseAnswerCorrect(['気づく'], combineWordMeanings(word)), true);
  });

  it('どの意味とも違えば不正解のまま', () => {
    assert.equal(isAnyJapaneseAnswerCorrect(['走る'], combineWordMeanings(word)), false);
  });

  it('認識ヒントにも全ての意味が乗る (boost の対象になる)', () => {
    const hints = japaneseAnswerHints(combineWordMeanings(word));
    assert.ok(hints.includes('気づく'));
    assert.ok(hints.includes('認識する'));
    assert.ok(hints.includes('悟る'));
  });

  it('ヒントは上限を超えず、主たる訳が先に残る', () => {
    const many = combineWordMeanings({
      japanese: 'いちばん大事な意味',
      translations: Array.from({ length: 20 }, (_, index) => ({ translationJa: `意味${index}` })),
    });
    const hints = japaneseAnswerHints(many);
    assert.ok(hints.length <= MAX_ANSWER_HINTS);
    assert.equal(hints[0], 'いちばん大事な意味');
  });
});
