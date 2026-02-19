// AI module exports
export { extractWordsFromImage, type ExtractionResult } from './extract-words';
export { extractCircledWordsFromImage, type CircledExtractionResult } from './extract-circled-words';
export { extractHighlightedWordsFromImage, type HighlightedExtractionResult } from './extract-highlighted-words';
export { extractIdiomsFromImage, type IdiomExtractionResult } from './extract-idioms';
export {
  extractTextForEiken,
  analyzeWordsForEiken,
  extractEikenWordsFromImage,
  type EikenOCRResult,
  type EikenWordAnalysisResult,
  type EikenExtractionResult,
} from './extract-eiken-words';
export {
  extractTestFromImage,
  analyzeWrongAnswers,
  extractWrongAnswersFromImage,
  type WrongAnswerOCRResult,
  type WrongAnswerAnalysisResult,
  type WrongAnswerExtractionResult,
  type TestOCRData,
  type TestQuestion,
  type WrongAnswerSummary,
} from './extract-wrong-answers';
export { WORD_EXTRACTION_SYSTEM_PROMPT, USER_PROMPT_TEMPLATE } from './prompts';
