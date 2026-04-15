/**
 * Passage → Word matching — server-only entry point.
 *
 * This module performs the actual Gemini call for the AI-assisted
 * passage matcher. It must NEVER be imported by client components,
 * because the AI provider stack pulls in Node-only dependencies
 * (e.g. `node:async_hooks` via the OpenAI SDK), which break Turbopack
 * client chunking.
 *
 * The shared types, prompt, schema, and pure helpers live in
 * `match-passage-words.ts` and are safe for both client and server.
 */

import { AI_CONFIG, getAPIKeys } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import {
  buildPassageMatchUserPrompt,
  filterCandidatesForAi,
  MAX_CANDIDATES_PER_CALL,
  MAX_TEXT_LENGTH,
  PASSAGE_MATCH_SYSTEM_PROMPT,
  parsePassageMatchResponse,
  sanitizeMatches,
  type MatchPassageWordsInput,
  type MatchPassageWordsResult,
} from './match-passage-words';

type GenerateTextFn = (
  systemPrompt: string,
  userPrompt: string,
) => Promise<
  | { success: true; content: string }
  | { success: false; error: string }
>;

export interface MatchPassageWordsDeps {
  /**
   * Dependency-injected text generator. Defaults to the configured Gemini
   * provider via `AI_CONFIG.defaults.gemini`. Tests override this to
   * return canned responses without hitting the network.
   */
  generateText?: GenerateTextFn;
}

/**
 * Find AI-assisted matches for a vocabulary list in a passage.
 *
 * Returns an empty result (no error) when there is nothing to match, so
 * callers can always render the response directly.
 */
export async function matchPassageWords(
  input: MatchPassageWordsInput,
  deps: MatchPassageWordsDeps = {},
): Promise<MatchPassageWordsResult> {
  const text = input.text?.trim() ?? '';
  if (!text) return { matches: [] };
  if (text.length > MAX_TEXT_LENGTH) {
    // Guard against pathological inputs — never crash, just skip.
    return { matches: [] };
  }

  const eligible = filterCandidatesForAi(input.candidates).slice(
    0,
    MAX_CANDIDATES_PER_CALL,
  );
  if (eligible.length === 0) return { matches: [] };

  const userPrompt = buildPassageMatchUserPrompt(text, eligible);

  const runGenerate: GenerateTextFn =
    deps.generateText ??
    (async (systemPrompt, user) => {
      const config = AI_CONFIG.defaults.gemini;
      const provider = getProviderFromConfig(config, getAPIKeys());
      return provider.generateText(`${systemPrompt}\n\n${user}`, {
        ...config,
        temperature: 0,
        maxOutputTokens: 2048,
        responseFormat: 'json',
      });
    });

  const aiResponse = await runGenerate(
    PASSAGE_MATCH_SYSTEM_PROMPT,
    userPrompt,
  );
  if (!aiResponse.success) {
    throw new Error(`Passage match generation failed: ${aiResponse.error}`);
  }

  const parsed = parsePassageMatchResponse(aiResponse.content);
  const ids = new Set(eligible.map((c) => c.id));
  return sanitizeMatches(parsed, text, ids);
}
