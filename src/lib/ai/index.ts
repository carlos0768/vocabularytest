// AI module exports
export { extractWordsFromImage, type ExtractionResult } from './extract-words';
export { extractCircledWordsFromImage, type CircledExtractionResult } from './extract-circled-words';
export {
  extractTextFromImage,
  analyzeGrammarPatterns,
  extractGrammarFromImage,
  type OCRResult,
  type GrammarAnalysisResult,
  type GrammarExtractionResult,
} from './extract-grammar';
export { WORD_EXTRACTION_SYSTEM_PROMPT, USER_PROMPT_TEMPLATE } from './prompts';
