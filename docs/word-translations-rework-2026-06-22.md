# Word translations rework - 2026-06-22

## Summary

This change makes Japanese translations a one-to-many relationship from a user word. `words.japanese` remains as the primary translation cache for compatibility, while `word_translations` stores the normalized translation list.

The goal is to avoid packing multiple meanings into one string such as `1. 感覚 2. 分別`, and to keep notes such as `(~のことで)` or `[感心]` out of the translation itself.

## Data model

`word_translations` stores one row per Japanese meaning:

- `word_id`: parent `words.id`
- `translation_ja`: clean Japanese translation for display and quiz seeds
- `normalized_translation_ja`: normalized unique key per word
- `source`: `scan`, `ai`, or `user`
- `lexicon_sense_id`: optional link to `lexicon_senses`; the migration creates the column even when `lexicon_senses` is absent and adds the foreign key only when the table exists
- `meaning_rank`: 1 is the primary meaning, 2+ are secondary meanings
- `position`: display order
- `is_primary`: primary row marker

Existing rows are backfilled from `words.japanese` as rank 1 primary translations. The backfill uses `words.lexicon_sense_id` and `normalize_lexicon_translation_key(text)` only when they exist, so the migration can run against older production schemas. `words.japanese` is intentionally kept for older code paths, search fallbacks, example generation prompts, and quiz logic that expects a single primary meaning.

## AI output and normalization

AI prompts now ask for:

```json
{
  "english": "sense",
  "japanese": "感覚",
  "translations": [
    { "japanese": "感覚", "source": "scan", "meaningRank": 1, "annotationRanges": [] },
    { "japanese": "分別", "source": "scan", "meaningRank": 2, "annotationRanges": [] }
  ]
}
```

Rules:

- `japanese` is only the primary translation.
- `translations` contains all independent meanings.
- Semicolon and numbered meanings, for example `感覚;分別` or `1. 感覚 2. 分別`, are split into separate rows.
- `annotationRanges` is temporary input used only during persistence.
- Text listed in `annotationRanges` is removed from the saved translation.
- Annotation text is moved to `words.custom_sections` under the fixed section `訳注`.
- Japanese words inside parentheses, brackets, or slashes are still translations when they can stand alone as quiz answers. For example, `感覚 [分別]` becomes two translations, not one translation plus one note.

Example:

```json
{
  "english": "admire",
  "japanese": "敬服する",
  "translations": [
    {
      "japanese": "敬服する",
      "source": "scan",
      "meaningRank": 1,
      "annotationRanges": ["に(~のことで)"]
    },
    {
      "japanese": "感心する",
      "source": "scan",
      "meaningRank": 2,
      "annotationRanges": ["に(~のことで)"]
    }
  ]
}
```

The saved `word_translations.translation_ja` rows are `敬服する` and `感心する`. The saved custom section is:

```json
{ "id": "translation-notes", "title": "訳注", "content": "に(~のことで)" }
```

## Persistence and frontend behavior

The same normalization path is used by immediate extraction, manual word creation, and scan job processing. Server-side cloud saves insert words first, then upsert `word_translations` using the inserted word IDs.

Frontend translation display uses a shared component. Multiple meanings render as `1. 感覚 2. 分別`; rank 1 uses normal opacity, rank 2 is lighter, and rank 3+ is lighter again. Older words without `translations` fall back to `words.japanese`.

Quiz answer checking, wrong-answer recording, and example generation still use the primary translation cache. This keeps existing learning behavior stable while improving display and storage.

## Cost estimate

The added AI cost comes mostly from output tokens: each word now includes a `translations` array and usually an empty `annotationRanges` array. DB storage/write cost is expected to be negligible compared with AI output cost.

Assumption for estimate:

- Incremental structured output: 35 output tokens per word.
- Current extraction model: `gemini-2.5-flash`.
- Pricing source: `src/lib/api-cost/pricing.ts`.
- USD/JPY: 150 when `API_COST_USD_TO_JPY` is unset.

| Words | Extra output tokens | Gemini 2.5 Flash extra USD | Extra JPY |
| ---: | ---: | ---: | ---: |
| 100 | 3,500 | $0.008750 | ¥1.31 |
| 1,000 | 35,000 | $0.087500 | ¥13.13 |
| 10,000 | 350,000 | $0.875000 | ¥131.25 |

For comparison, if extraction were switched to `gemini-2.0-flash-001`, the same 10,000-word increment would be about $0.140000 / ¥21.00. With `gpt-4o-mini`, it would be about $0.210000 / ¥31.50.

Notes may add more output tokens when present. A rough rule is +10 to +15 output tokens per annotated range.

## Verification

Targeted tests added or updated:

- AI response parsing splits `感覚;分別`.
- AI response parsing moves annotation ranges into the `訳注` custom section.
- `/api/words/create` persists `word_translations`.
- Server cloud scan job persistence upserts `word_translations`.
- Server cloud words insert contract includes `lexicon_sense_id` and `custom_sections`.

Final checks:

- `npx tsc --noEmit`
- `npx eslint ...` for the changed implementation and test files
- `npx tsx --test ...` for the updated parser, create-word, scan-job, persistence, auth/notification fixture, quiz, and example-generation tests
- Supabase preview branch `word-translations-rework` with production data accepted `20260622090000_create_word_translations.sql`.
- Preview branch backfill result: `words` with non-null `japanese` = 19,158 and `word_translations` rows = 19,158.
- All backfilled rows in the preview branch are rank 1 primary rows; no `translation_ja IS NULL` rows were produced.

Operational note:

- The linked main project migration history currently reports later local migrations from `20260530120000` onward as pending. Do not run a blind `supabase db push --linked` against main for only this change unless that migration history is reconciled first. To apply just this rework, run this migration SQL directly in the Supabase SQL editor or repair/apply the pending migration history intentionally.
