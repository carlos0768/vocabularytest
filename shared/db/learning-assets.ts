import type {
  CorrectionDocument,
  CorrectionFinding,
  CorrectionFindingCategory,
  CorrectionInlineAnnotation,
  CorrectionReviewItem,
  CorrectionReviewPayload,
  CorrectionSummary,
  LearningAssetStatus,
  LearningAssetSummary,
  StructureAnalysisSummary,
  StructureAnalysisNote,
  StructureDocument,
  StructureNode,
  StructureSourceType,
  VocabularyAssetStats,
  VocabularyAssetDetail,
  VocabularyProjectPreview,
  CollectionItemSummary,
  LearningAssetKind,
  Project,
  Word,
} from '../types';

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  return value as T;
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export interface LearningAssetRow {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  status: string;
  legacy_project_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CollectionItemRow {
  collection_id: string;
  asset_id: string;
  sort_order: number;
  added_at: string;
}

export interface VocabularyProjectPreviewRow {
  id: string;
  title: string;
  icon_image?: string | null;
  source_labels?: unknown;
  created_at: string;
}

export interface StructureDocumentRow {
  asset_id: string;
  original_text: string;
  normalized_text: string;
  source_type: string;
  cefr_target: string;
  parse_tree_json?: unknown;
  analysis_summary_json?: unknown;
  last_analyzed_at?: string | null;
  error_message?: string | null;
}

export interface CorrectionDocumentRow {
  asset_id: string;
  original_text: string;
  corrected_text: string;
  source_type: string;
  inline_annotations_json?: unknown;
  summary_json?: unknown;
  last_analyzed_at?: string | null;
  error_message?: string | null;
}

export interface CorrectionFindingRow {
  id: string;
  asset_id: string;
  span_start: number;
  span_end: number;
  category: string;
  rule_name_ja: string;
  rule_name_en: string;
  incorrect_text: string;
  suggested_text: string;
  formal_usage_ja: string;
  example_sentence?: string | null;
  example_sentence_ja?: string | null;
  learner_advice: string;
  difficulty?: number | null;
  sort_order: number;
}

export interface CorrectionReviewItemRow {
  id: string;
  finding_id: string;
  user_id: string;
  quiz_payload_json?: unknown;
  status: string;
  last_reviewed_at?: string | null;
  next_review_at?: string | null;
  ease_factor?: number | null;
  interval_days?: number | null;
  repetition?: number | null;
  created_at: string;
  updated_at: string;
}

function normalizeAssetKind(value: unknown): LearningAssetKind {
  return value === 'structure_document' || value === 'correction_document'
    ? value
    : 'vocabulary_project';
}

function normalizeAssetStatus(value: unknown): LearningAssetStatus {
  return value === 'draft' || value === 'error' ? value : 'ready';
}

function normalizeStructureSourceType(value: unknown): StructureSourceType {
  return value === 'scan' ? 'scan' : 'paste';
}

function normalizeStructureNode(value: unknown): StructureNode | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  const id = normalizeText(record.id) ?? '';
  const label = normalizeText(record.label) ?? '';
  const text = normalizeText(record.text) ?? '';
  if (!id || !label) return null;

  const children = Array.isArray(record.children)
    ? record.children.map(normalizeStructureNode).filter(Boolean) as StructureNode[]
    : [];

  return {
    id,
    label,
    text,
    start: typeof record.start === 'number' ? record.start : 0,
    end: typeof record.end === 'number' ? record.end : 0,
    children,
    collapsible: Boolean(record.collapsible ?? children.length > 0),
  };
}

function normalizeStructureNodes(value: unknown): StructureNode[] {
  const parsed = parseJsonValue<unknown>(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeStructureNode).filter(Boolean) as StructureNode[];
}

function normalizeStructureNotes(value: unknown): StructureAnalysisNote[] {
  const parsed = parseJsonValue<unknown>(value, []);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const label = normalizeText(record.label);
      const body = normalizeText(record.body);
      if (!label || !body) return null;
      return {
        label,
        body,
        shortLabel: normalizeText(record.shortLabel ?? record.short_label),
      };
    })
    .filter(Boolean) as StructureAnalysisNote[];
}

function parseStructureSummaryRecord(value: unknown): Record<string, unknown> {
  return parseJsonValue<Record<string, unknown>>(value, {});
}

function normalizeStructureSummary(value: unknown): StructureAnalysisSummary {
  const parsed = parseStructureSummaryRecord(value);
  const detectedPatterns = Array.isArray(parsed.detectedPatterns)
    ? parsed.detectedPatterns.filter((item): item is string => typeof item === 'string')
    : [];

  return {
    overview: normalizeText(parsed.overview) ?? '',
    detectedPatterns,
    cefrTarget: 'pre1',
    notes: normalizeStructureNotes(parsed.notes),
  };
}

function normalizeMentionedTerms(value: unknown): string[] {
  const parsed = Array.isArray(value) ? value : parseJsonValue<unknown>(value, []);
  if (!Array.isArray(parsed)) return [];

  const seen = new Set<string>();
  for (const item of parsed) {
    const term = normalizeText(item);
    if (!term) continue;
    seen.add(term);
  }

  return Array.from(seen);
}

function normalizeInlineAnnotation(value: unknown): CorrectionInlineAnnotation | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = normalizeText(record.id) ?? '';
  const label = normalizeText(record.label) ?? '';
  const message = normalizeText(record.message) ?? '';
  if (!id || !label || !message) return null;

  return {
    id,
    start: typeof record.start === 'number' ? record.start : 0,
    end: typeof record.end === 'number' ? record.end : 0,
    label,
    message,
    severity: record.severity === 'warning' ? 'warning' : 'error',
    suggestedText: normalizeText(record.suggestedText ?? record.suggested_text),
  };
}

function normalizeInlineAnnotations(value: unknown): CorrectionInlineAnnotation[] {
  const parsed = parseJsonValue<unknown>(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeInlineAnnotation).filter(Boolean) as CorrectionInlineAnnotation[];
}

function normalizeCorrectionSummary(value: unknown): CorrectionSummary {
  const parsed = parseJsonValue<Record<string, unknown>>(value, {});
  const counts = parsed.counts && typeof parsed.counts === 'object'
    ? parsed.counts as Record<string, unknown>
    : {};

  return {
    overview: normalizeText(parsed.overview) ?? '',
    counts: {
      grammar: typeof counts.grammar === 'number' ? counts.grammar : 0,
      idiom: typeof counts.idiom === 'number' ? counts.idiom : 0,
      usage: typeof counts.usage === 'number' ? counts.usage : 0,
    },
  };
}

function normalizeFindingCategory(value: unknown): CorrectionFindingCategory {
  return value === 'idiom' || value === 'usage' ? value : 'grammar';
}

function normalizeFindingDifficulty(value: unknown): 1 | 2 | 3 {
  if (value === 2 || value === 3) return value;
  return 1;
}

function normalizeReviewPayload(value: unknown): CorrectionReviewPayload {
  const parsed = parseJsonValue<Record<string, unknown>>(value, {});
  const choices = Array.isArray(parsed.choices)
    ? parsed.choices.filter((item): item is string => typeof item === 'string')
    : [];

  return {
    question: normalizeText(parsed.question) ?? '',
    choices,
    correctAnswer: normalizeText(parsed.correctAnswer ?? parsed.correct_answer) ?? '',
    explanation: normalizeText(parsed.explanation) ?? '',
    ruleNameJa: normalizeText(parsed.ruleNameJa ?? parsed.rule_name_ja),
  };
}

export function mapLearningAssetFromRow(row: LearningAssetRow): LearningAssetSummary {
  return {
    id: row.id,
    userId: row.user_id,
    kind: normalizeAssetKind(row.kind),
    title: row.title,
    status: normalizeAssetStatus(row.status),
    legacyProjectId: row.legacy_project_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapVocabularyProjectPreviewFromRow(row: VocabularyProjectPreviewRow): VocabularyProjectPreview {
  return {
    id: row.id,
    title: row.title,
    iconImage: row.icon_image ?? undefined,
    sourceLabels: Array.isArray(row.source_labels)
      ? row.source_labels.filter((item): item is string => typeof item === 'string')
      : [],
    createdAt: row.created_at,
  };
}

export function mapCollectionItemSummary(
  row: CollectionItemRow,
  asset: LearningAssetSummary,
  project?: VocabularyProjectPreview,
): CollectionItemSummary {
  return {
    collectionId: row.collection_id,
    assetId: row.asset_id,
    sortOrder: row.sort_order,
    addedAt: row.added_at,
    asset,
    project,
  };
}

export function mapStructureDocumentFromRow(row: StructureDocumentRow): StructureDocument {
  const summaryRecord = parseStructureSummaryRecord(row.analysis_summary_json);
  return {
    assetId: row.asset_id,
    originalText: row.original_text,
    normalizedText: row.normalized_text,
    sourceType: normalizeStructureSourceType(row.source_type),
    cefrTarget: 'pre1',
    parseTree: normalizeStructureNodes(row.parse_tree_json),
    analysisSummary: normalizeStructureSummary(summaryRecord),
    mentionedTerms: normalizeMentionedTerms(summaryRecord.mentionedTerms ?? summaryRecord.mentioned_terms),
    lastAnalyzedAt: row.last_analyzed_at ?? undefined,
    errorMessage: row.error_message ?? undefined,
  };
}

export function mapCorrectionDocumentFromRow(row: CorrectionDocumentRow): CorrectionDocument {
  return {
    assetId: row.asset_id,
    originalText: row.original_text,
    correctedText: row.corrected_text,
    sourceType: normalizeStructureSourceType(row.source_type),
    inlineAnnotations: normalizeInlineAnnotations(row.inline_annotations_json),
    summary: normalizeCorrectionSummary(row.summary_json),
    lastAnalyzedAt: row.last_analyzed_at ?? undefined,
    errorMessage: row.error_message ?? undefined,
  };
}

export function mapCorrectionFindingFromRow(row: CorrectionFindingRow): CorrectionFinding {
  return {
    id: row.id,
    assetId: row.asset_id,
    spanStart: row.span_start,
    spanEnd: row.span_end,
    category: normalizeFindingCategory(row.category),
    ruleNameJa: row.rule_name_ja,
    ruleNameEn: row.rule_name_en,
    incorrectText: row.incorrect_text,
    suggestedText: row.suggested_text,
    formalUsageJa: row.formal_usage_ja,
    exampleSentence: row.example_sentence ?? undefined,
    exampleSentenceJa: row.example_sentence_ja ?? undefined,
    learnerAdvice: row.learner_advice,
    difficulty: normalizeFindingDifficulty(row.difficulty),
    sortOrder: row.sort_order,
  };
}

export function buildVocabularyAssetStats(words: Word[]): VocabularyAssetStats {
  return {
    totalWords: words.length,
    newWords: words.filter((word) => word.status === 'new').length,
    reviewWords: words.filter((word) => word.status === 'review').length,
    masteredWords: words.filter((word) => word.status === 'mastered').length,
    activeWords: words.filter((word) => word.vocabularyType === 'active').length,
    passiveWords: words.filter((word) => word.vocabularyType === 'passive').length,
    exampleCount: words.filter((word) => Boolean(word.exampleSentence?.trim())).length,
  };
}

export function buildVocabularyAssetDetail(
  asset: VocabularyAssetDetail['asset'],
  project: Project,
  words: Word[],
  idioms: string[],
): VocabularyAssetDetail {
  return {
    asset,
    project,
    words,
    stats: buildVocabularyAssetStats(words),
    idioms,
  };
}

export function mapCorrectionReviewItemFromRow(row: CorrectionReviewItemRow): CorrectionReviewItem {
  return {
    id: row.id,
    findingId: row.finding_id,
    userId: row.user_id,
    quizPayload: normalizeReviewPayload(row.quiz_payload_json),
    status: row.status === 'review' || row.status === 'mastered' ? row.status : 'new',
    lastReviewedAt: row.last_reviewed_at ?? undefined,
    nextReviewAt: row.next_review_at ?? undefined,
    easeFactor: row.ease_factor ?? 2.5,
    intervalDays: row.interval_days ?? 0,
    repetition: row.repetition ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
