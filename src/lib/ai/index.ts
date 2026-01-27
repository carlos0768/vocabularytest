// AI module exports
export { extractWordsFromImage, type ExtractionResult } from './extract-words';
export { extractCircledWordsFromImage, type CircledExtractionResult } from './extract-circled-words';
export { extractHighlightedWordsFromImage, type HighlightedExtractionResult } from './extract-highlighted-words';
export { extractIdiomsFromImage, type IdiomExtractionResult } from './extract-idioms';
export {
  extractTextFromImage,
  analyzeGrammarPatterns,
  extractGrammarFromImage,
  type OCRResult,
  type GrammarAnalysisResult,
  type GrammarExtractionResult,
} from './extract-grammar';
export {
  extractTextForEiken,
  analyzeWordsForEiken,
  extractEikenWordsFromImage,
  type EikenOCRResult,
  type EikenWordAnalysisResult,
  type EikenExtractionResult,
} from './extract-eiken-words';
export { WORD_EXTRACTION_SYSTEM_PROMPT, USER_PROMPT_TEMPLATE } from './prompts';
