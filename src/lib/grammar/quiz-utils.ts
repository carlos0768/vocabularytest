/**
 * Grammar Quiz Utilities
 * デュオリンゴ式の文法クイズロジックを提供するユーティリティ関数
 */

import type {
  AIGrammarQuizQuestion,
  AIGrammarQuizQuestionLegacy,
  AIGrammarExtraction,
  AIGrammarExtractionLegacy,
  GrammarQuizType,
  LegacyGrammarQuizType,
  WordOption,
} from '@/types';

// ============ Type Guards ============

/**
 * 旧形式の問題タイプかどうかを判定
 */
export function isLegacyQuestionType(
  type: string
): type is LegacyGrammarQuizType {
  return ['fill_blank', 'choice', 'reorder'].includes(type);
}

/**
 * 新形式の問題タイプかどうかを判定
 */
export function isNewQuestionType(type: string): type is GrammarQuizType {
  return ['single_select', 'word_tap', 'sentence_build'].includes(type);
}

/**
 * 旧形式のクイズ問題かどうかを判定
 */
export function isLegacyQuizQuestion(
  question: AIGrammarQuizQuestion | AIGrammarQuizQuestionLegacy
): question is AIGrammarQuizQuestionLegacy {
  return isLegacyQuestionType(question.questionType);
}

// ============ Migration Functions ============

/**
 * 旧問題タイプから新問題タイプへのマッピング
 */
const QUESTION_TYPE_MAP: Record<LegacyGrammarQuizType, GrammarQuizType> = {
  choice: 'single_select',
  fill_blank: 'word_tap',
  reorder: 'sentence_build',
};

/**
 * 旧形式のクイズ問題を新形式に変換
 */
export function migrateQuizQuestion(
  legacy: AIGrammarQuizQuestionLegacy
): AIGrammarQuizQuestion {
  const newType = QUESTION_TYPE_MAP[legacy.questionType];

  const base: Omit<AIGrammarQuizQuestion, 'questionType'> = {
    question: legacy.question,
    questionJa: legacy.questionJa,
    correctAnswer: legacy.correctAnswer,
    explanation: legacy.explanation,
  };

  switch (legacy.questionType) {
    case 'choice':
      // choice → single_select
      // 既存のoptionsをWordOption形式に変換
      return {
        ...base,
        questionType: 'single_select',
        wordOptions: (legacy.options || []).map((opt) => ({
          word: opt,
          isCorrect: opt === legacy.correctAnswer,
          isDistractor: false, // 旧形式では区別がなかった
        })),
      };

    case 'fill_blank':
      // fill_blank → word_tap
      // correctAnswerから単語オプションを生成
      return {
        ...base,
        questionType: 'word_tap',
        wordOptions: generateWordOptionsFromAnswer(
          legacy.correctAnswer,
          legacy.options
        ),
        grammarPoint: extractGrammarPointFromQuestion(legacy.question),
      };

    case 'reorder':
      // reorder → sentence_build
      // correctAnswerを単語配列に分割
      return {
        ...base,
        questionType: 'sentence_build',
        sentenceWords: splitSentenceIntoWords(legacy.correctAnswer),
        extraWords: [], // 旧形式にはなかった
      };

    default:
      // フォールバック: single_selectとして扱う
      return {
        ...base,
        questionType: 'single_select',
        wordOptions: (legacy.options || []).map((opt) => ({
          word: opt,
          isCorrect: opt === legacy.correctAnswer,
          isDistractor: false,
        })),
      };
  }
}

/**
 * 旧形式の文法パターンを新形式に変換
 */
export function migrateGrammarExtraction(
  legacy: AIGrammarExtractionLegacy
): AIGrammarExtraction {
  return {
    ...legacy,
    quizQuestions: legacy.quizQuestions.map(migrateQuizQuestion),
  };
}

/**
 * AIレスポンスが旧形式か新形式かを自動判定し、必要に応じて変換
 */
export function normalizeGrammarExtraction(
  extraction: AIGrammarExtraction | AIGrammarExtractionLegacy
): AIGrammarExtraction {
  // 最初のクイズ問題の形式で判定
  const firstQuestion = extraction.quizQuestions[0];
  if (!firstQuestion) {
    return extraction as AIGrammarExtraction;
  }

  if (isLegacyQuestionType(firstQuestion.questionType)) {
    return migrateGrammarExtraction(extraction as AIGrammarExtractionLegacy);
  }

  return extraction as AIGrammarExtraction;
}

// ============ Quiz Logic Functions ============

/**
 * 回答エリアの選択状態を管理するための型
 */
export interface AnswerState {
  selectedWords: string[]; // 選択された単語（順序保持）
  availableWords: string[]; // 選択可能な単語（未選択のもの）
}

/**
 * 初期状態を生成
 */
export function createInitialAnswerState(
  question: AIGrammarQuizQuestion
): AnswerState {
  switch (question.questionType) {
    case 'single_select':
    case 'word_tap':
      return {
        selectedWords: [],
        availableWords: shuffleArray(
          (question.wordOptions || []).map((opt) => opt.word)
        ),
      };

    case 'sentence_build': {
      // 正解の単語 + ダミー単語をシャッフル
      const allWords = [
        ...(question.sentenceWords || []),
        ...(question.extraWords || []),
      ];
      return {
        selectedWords: [],
        availableWords: shuffleArray(allWords),
      };
    }

    default:
      return {
        selectedWords: [],
        availableWords: [],
      };
  }
}

/**
 * 単語を選択（プールから回答エリアへ移動）
 */
export function selectWord(state: AnswerState, word: string): AnswerState {
  if (!state.availableWords.includes(word)) {
    return state; // 利用可能でない単語は選択できない
  }

  return {
    selectedWords: [...state.selectedWords, word],
    availableWords: state.availableWords.filter((w) => w !== word),
  };
}

/**
 * 単語を選択解除（回答エリアからプールへ戻す）
 */
export function deselectWord(state: AnswerState, word: string): AnswerState {
  const index = state.selectedWords.indexOf(word);
  if (index === -1) {
    return state; // 選択されていない単語は解除できない
  }

  return {
    selectedWords: state.selectedWords.filter((_, i) => i !== index),
    availableWords: [...state.availableWords, word],
  };
}

/**
 * 特定のインデックスの単語を選択解除
 */
export function deselectWordAtIndex(
  state: AnswerState,
  index: number
): AnswerState {
  const word = state.selectedWords[index];
  if (!word) {
    return state;
  }
  return deselectWord(state, word);
}

/**
 * 全ての選択をリセット
 */
export function resetAnswerState(
  question: AIGrammarQuizQuestion
): AnswerState {
  return createInitialAnswerState(question);
}

// ============ Answer Validation ============

/**
 * 回答の正誤判定結果
 */
export interface ValidationResult {
  isCorrect: boolean;
  userAnswer: string;
  correctAnswer: string;
  explanation: string;
  grammarPoint?: string;
}

/**
 * 回答を検証
 */
export function validateAnswer(
  question: AIGrammarQuizQuestion,
  state: AnswerState
): ValidationResult {
  const baseResult = {
    explanation: question.explanation,
    grammarPoint: question.grammarPoint,
  };

  switch (question.questionType) {
    case 'single_select': {
      // 1つだけ選択されているか確認
      const userAnswer = state.selectedWords[0] || '';
      return {
        ...baseResult,
        isCorrect: userAnswer === question.correctAnswer,
        userAnswer,
        correctAnswer: question.correctAnswer,
      };
    }

    case 'word_tap': {
      // 空欄に入れた単語が正解か確認
      const userAnswer = state.selectedWords.join(' ');
      return {
        ...baseResult,
        isCorrect: userAnswer === question.correctAnswer,
        userAnswer,
        correctAnswer: question.correctAnswer,
      };
    }

    case 'sentence_build': {
      // 並べた順序が正解と一致するか確認
      const userAnswer = state.selectedWords.join(' ');
      const correctAnswer = (question.sentenceWords || []).join(' ');
      return {
        ...baseResult,
        isCorrect: userAnswer === correctAnswer,
        userAnswer,
        correctAnswer,
      };
    }

    default:
      return {
        ...baseResult,
        isCorrect: false,
        userAnswer: '',
        correctAnswer: question.correctAnswer,
      };
  }
}

/**
 * 回答が確定可能かどうかを判定
 */
export function canSubmitAnswer(
  question: AIGrammarQuizQuestion,
  state: AnswerState
): boolean {
  switch (question.questionType) {
    case 'single_select':
      // 1つ選択されている
      return state.selectedWords.length === 1;

    case 'word_tap':
      // 少なくとも1つ選択されている
      return state.selectedWords.length > 0;

    case 'sentence_build':
      // 全ての正解単語が配置されている（ダミー単語は除く）
      const requiredCount = question.sentenceWords?.length || 0;
      return state.selectedWords.length === requiredCount;

    default:
      return false;
  }
}

// ============ Helper Functions ============

/**
 * 配列をシャッフル（Fisher-Yates）
 */
export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * fill_blank の correctAnswer からWordOptionsを生成
 * （旧形式マイグレーション用）
 */
function generateWordOptionsFromAnswer(
  correctAnswer: string,
  existingOptions?: string[]
): WordOption[] {
  // 既存のoptionsがあればそれを使う
  if (existingOptions && existingOptions.length > 0) {
    return existingOptions.map((opt) => ({
      word: opt,
      isCorrect: opt === correctAnswer,
      isDistractor: opt !== correctAnswer,
    }));
  }

  // なければ正解のみを返す（AIが新形式で生成する場合はwordOptionsが設定される）
  return [
    {
      word: correctAnswer,
      isCorrect: true,
      isDistractor: false,
    },
  ];
}

/**
 * 問題文から文法ポイントを抽出（簡易版）
 */
function extractGrammarPointFromQuestion(question: string): string | undefined {
  // 括弧内のヒントを抽出 例: "She ___ (live)" → "live"
  const match = question.match(/\(([^)]+)\)/);
  return match ? match[1] : undefined;
}

/**
 * 文を単語配列に分割
 */
function splitSentenceIntoWords(sentence: string): string[] {
  // ピリオド、カンマ、疑問符などを単語から分離
  return sentence
    .replace(/([.,!?])/g, ' $1')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/**
 * WordOptionの配列から正解を取得
 */
export function getCorrectWordFromOptions(options: WordOption[]): string | null {
  const correct = options.find((opt) => opt.isCorrect);
  return correct?.word || null;
}

/**
 * 問題タイプに応じた最大選択数を取得
 */
export function getMaxSelectionCount(
  question: AIGrammarQuizQuestion
): number {
  switch (question.questionType) {
    case 'single_select':
      return 1;
    case 'word_tap':
      // 空欄の数をカウント（_____の数）
      return (question.question.match(/_____/g) || []).length || 1;
    case 'sentence_build':
      return question.sentenceWords?.length || 0;
    default:
      return 1;
  }
}

/**
 * 問題タイプの日本語ラベルを取得
 */
export function getQuestionTypeLabel(type: GrammarQuizType): string {
  switch (type) {
    case 'single_select':
      return '選択問題';
    case 'word_tap':
      return '穴埋め問題';
    case 'sentence_build':
      return '並べ替え問題';
    default:
      return '問題';
  }
}
