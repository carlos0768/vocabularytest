import type { LexiconEntry, LexiconSense } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  mapLexiconSenseFromRow,
  type LexiconSenseRow,
} from '../../../shared/db';
import {
  normalizeLexiconDatasetSources,
  normalizeLexiconSenseTranslationKey,
  normalizeLexiconTranslation,
  type LexiconPos,
  type LexiconTranslationSource,
} from '../../../shared/lexicon';

export interface LexiconResolvedEntryRow {
  id: string;
  headword: string;
  normalized_headword: string;
  pos: string;
  cefr_level: string | null;
  dataset_sources: string[] | null;
  primary_sense_id: string | null;
  translation_ja: string | null;
  normalized_translation_ja: string | null;
  meaning_summary: string | null;
  usage_notes: string | null;
  translation_source: string | null;
  example_sentence: string | null;
  example_sentence_ja: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnsureLexiconSenseInput {
  lexiconEntryId: string;
  translationJa: string;
  translationSource?: LexiconTranslationSource | null;
  meaningSummary?: string | null;
  usageNotes?: string | null;
  exampleSentence?: string | null;
  exampleSentenceJa?: string | null;
  isPrimary?: boolean;
}

function mapPrimarySenseFromResolvedRow(row: LexiconResolvedEntryRow): LexiconSense | undefined {
  if (!row.primary_sense_id || !normalizeLexiconTranslation(row.translation_ja)) {
    return undefined;
  }

  return {
    id: row.primary_sense_id,
    lexiconEntryId: row.id,
    translationJa: normalizeLexiconTranslation(row.translation_ja) ?? row.translation_ja ?? '',
    normalizedTranslationJa: normalizeLexiconSenseTranslationKey(
      row.normalized_translation_ja ?? row.translation_ja,
    ) ?? '',
    meaningSummary: row.meaning_summary ?? undefined,
    usageNotes: row.usage_notes ?? undefined,
    exampleSentence: row.example_sentence ?? undefined,
    exampleSentenceJa: row.example_sentence_ja ?? undefined,
    translationSource: row.translation_source ?? undefined,
    isPrimary: true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapLexiconEntryFromResolvedRow(row: LexiconResolvedEntryRow): LexiconEntry {
  const primarySense = mapPrimarySenseFromResolvedRow(row);
  return {
    id: row.id,
    headword: row.headword,
    normalizedHeadword: row.normalized_headword,
    pos: row.pos,
    cefrLevel: row.cefr_level ?? undefined,
    datasetSources: normalizeLexiconDatasetSources(row.dataset_sources ?? []),
    primarySense,
    senses: primarySense ? [primarySense] : [],
    translationJa: primarySense?.translationJa,
    translationSource: primarySense?.translationSource,
    exampleSentence: primarySense?.exampleSentence,
    exampleSentenceJa: primarySense?.exampleSentenceJa,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadResolvedLexiconEntryByKey(
  supabaseAdmin: SupabaseClient,
  normalizedHeadword: string,
  pos: LexiconPos,
): Promise<LexiconResolvedEntryRow | null> {
  const { data, error } = await supabaseAdmin
    .from('lexicon_entry_resolved_rows')
    .select('*')
    .eq('normalized_headword', normalizedHeadword)
    .eq('pos', pos)
    .maybeSingle<LexiconResolvedEntryRow>();

  if (error) {
    throw new Error(`Failed to load lexicon entry: ${error.message}`);
  }

  return data ?? null;
}

export async function loadResolvedLexiconEntriesByKeys(
  supabaseAdmin: SupabaseClient,
  keys: Array<{ normalizedHeadword: string; pos: LexiconPos }>,
): Promise<LexiconResolvedEntryRow[]> {
  if (keys.length === 0) {
    return [];
  }

  const normalizedHeadwords = Array.from(new Set(keys.map((key) => key.normalizedHeadword)));
  const positions = Array.from(new Set(keys.map((key) => key.pos)));

  const { data, error } = await supabaseAdmin
    .from('lexicon_entry_resolved_rows')
    .select('*')
    .in('normalized_headword', normalizedHeadwords)
    .in('pos', positions);

  if (error) {
    throw new Error(`Failed to load lexicon entries: ${error.message}`);
  }

  return (data ?? []) as LexiconResolvedEntryRow[];
}

export async function loadResolvedLexiconEntryById(
  supabaseAdmin: SupabaseClient,
  lexiconEntryId: string,
): Promise<LexiconResolvedEntryRow | null> {
  const { data, error } = await supabaseAdmin
    .from('lexicon_entry_resolved_rows')
    .select('*')
    .eq('id', lexiconEntryId)
    .maybeSingle<LexiconResolvedEntryRow>();

  if (error) {
    throw new Error(`Failed to load lexicon entry: ${error.message}`);
  }

  return data ?? null;
}

export async function loadLexiconSenseByEntryAndTranslation(
  supabaseAdmin: SupabaseClient,
  lexiconEntryId: string,
  translationJa: string,
): Promise<LexiconSenseRow | null> {
  const normalizedTranslationJa = normalizeLexiconSenseTranslationKey(translationJa);
  if (!normalizedTranslationJa) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('lexicon_senses')
    .select('*')
    .eq('lexicon_entry_id', lexiconEntryId)
    .eq('normalized_translation_ja', normalizedTranslationJa)
    .maybeSingle<LexiconSenseRow>();

  if (error) {
    throw new Error(`Failed to load lexicon sense: ${error.message}`);
  }

  return data ?? null;
}

export async function loadLexiconSensesByEntryIds(
  supabaseAdmin: SupabaseClient,
  lexiconEntryIds: string[],
): Promise<LexiconSenseRow[]> {
  if (lexiconEntryIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from('lexicon_senses')
    .select('*')
    .in('lexicon_entry_id', lexiconEntryIds);

  if (error) {
    throw new Error(`Failed to load lexicon senses: ${error.message}`);
  }

  return (data ?? []) as LexiconSenseRow[];
}

export async function unsetPrimaryLexiconSenses(
  supabaseAdmin: SupabaseClient,
  lexiconEntryId: string,
  exceptSenseId?: string,
): Promise<void> {
  let query = supabaseAdmin
    .from('lexicon_senses')
    .update({ is_primary: false })
    .eq('lexicon_entry_id', lexiconEntryId)
    .eq('is_primary', true);

  if (exceptSenseId) {
    query = query.neq('id', exceptSenseId);
  }

  const { error } = await query;
  if (error) {
    throw new Error(`Failed to update primary lexicon senses: ${error.message}`);
  }
}

export async function ensureLexiconSense(
  supabaseAdmin: SupabaseClient,
  input: EnsureLexiconSenseInput,
): Promise<LexiconSense> {
  const normalizedTranslationJa = normalizeLexiconSenseTranslationKey(input.translationJa);
  if (!normalizedTranslationJa) {
    throw new Error('Cannot create lexicon sense without a normalized translation');
  }

  const existing = await loadLexiconSenseByEntryAndTranslation(
    supabaseAdmin,
    input.lexiconEntryId,
    normalizedTranslationJa,
  );

  if (input.isPrimary) {
    await unsetPrimaryLexiconSenses(supabaseAdmin, input.lexiconEntryId, existing?.id);
  }

  if (existing) {
    const updatePayload: Partial<LexiconSenseRow> = {};

    if (input.isPrimary && !existing.is_primary) {
      updatePayload.is_primary = true;
    }
    if (!existing.translation_source && input.translationSource) {
      updatePayload.translation_source = input.translationSource;
    }
    if (!existing.meaning_summary && input.meaningSummary) {
      updatePayload.meaning_summary = input.meaningSummary;
    }
    if (!existing.usage_notes && input.usageNotes) {
      updatePayload.usage_notes = input.usageNotes;
    }
    if (!existing.example_sentence && input.exampleSentence) {
      updatePayload.example_sentence = input.exampleSentence;
    }
    if (!existing.example_sentence_ja && input.exampleSentenceJa) {
      updatePayload.example_sentence_ja = input.exampleSentenceJa;
    }

    if (Object.keys(updatePayload).length === 0) {
      return mapLexiconSenseFromRow(existing);
    }

    const { data, error } = await supabaseAdmin
      .from('lexicon_senses')
      .update(updatePayload)
      .eq('id', existing.id)
      .select('*')
      .single<LexiconSenseRow>();

    if (error || !data) {
      throw new Error(error?.message || 'Failed to update lexicon sense');
    }

    return mapLexiconSenseFromRow(data);
  }

  const { data, error } = await supabaseAdmin
    .from('lexicon_senses')
    .insert({
      lexicon_entry_id: input.lexiconEntryId,
      translation_ja: normalizedTranslationJa,
      normalized_translation_ja: normalizedTranslationJa,
      meaning_summary: input.meaningSummary ?? null,
      usage_notes: input.usageNotes ?? null,
      example_sentence: input.exampleSentence ?? null,
      example_sentence_ja: input.exampleSentenceJa ?? null,
      translation_source: input.translationSource ?? null,
      is_primary: input.isPrimary ?? false,
    })
    .select('*')
    .single<LexiconSenseRow>();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create lexicon sense');
  }

  return mapLexiconSenseFromRow(data);
}

export async function updateLexiconSenseExamplesIfMissing(
  supabaseAdmin: SupabaseClient,
  senseId: string,
  exampleSentence: string,
  exampleSentenceJa: string | null | undefined,
): Promise<boolean> {
  const { data: existing, error: loadError } = await supabaseAdmin
    .from('lexicon_senses')
    .select('id, example_sentence, example_sentence_ja')
    .eq('id', senseId)
    .maybeSingle<{ id: string; example_sentence: string | null; example_sentence_ja: string | null }>();

  if (loadError) {
    throw new Error(`Failed to load lexicon sense example state: ${loadError.message}`);
  }
  if (!existing) {
    return false;
  }

  const updatePayload: { example_sentence?: string; example_sentence_ja?: string | null } = {};
  if (!existing.example_sentence && exampleSentence.trim()) {
    updatePayload.example_sentence = exampleSentence.trim();
  }
  if (!existing.example_sentence_ja && exampleSentenceJa?.trim()) {
    updatePayload.example_sentence_ja = exampleSentenceJa.trim();
  }
  if (Object.keys(updatePayload).length === 0) {
    return false;
  }

  const { error: updateError } = await supabaseAdmin
    .from('lexicon_senses')
    .update(updatePayload)
    .eq('id', senseId);

  if (updateError) {
    throw new Error(`Failed to update lexicon sense examples: ${updateError.message}`);
  }

  return true;
}
