# API Input Validation Policy

## Goal
All JSON body routes in `src/app/api/**/route.ts` must validate request bodies with Zod.

## Rules
1. Use Zod schemas with `.strict()` to reject unknown keys.
2. Parse request JSON through `parseJsonWithSchema` in `/Users/haradakarurosukei/Desktop/Working/englishvo/src/lib/api/validation.ts`.
3. Return `400` for parse errors and schema mismatch.
4. Apply constraints:
   - strings: trim + length limits
   - arrays: min/max count
   - ids: UUID where required
5. Use discriminated unions for action-style endpoints (example: `auth/reset-password`).

## Current Scope
Validated routes include:
- `/Users/haradakarurosukei/Desktop/Working/englishvo/src/app/api/auth/reset-password/route.ts`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/src/app/api/auth/send-otp/route.ts`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/src/app/api/auth/signup-verify/route.ts`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/src/app/api/auth/verify-otp/route.ts`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/src/app/api/dictation/grade/route.ts`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/src/app/api/embeddings/sync/route.ts`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/src/app/api/extract/route.ts`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/src/app/api/generate-examples/route.ts`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/src/app/api/generate-quiz-distractors/route.ts`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/src/app/api/regenerate-distractors/route.ts`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/src/app/api/scan-jobs/create/route.ts`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/src/app/api/scan-jobs/process/route.ts`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/src/app/api/search/semantic/route.ts`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/src/app/api/sentence-quiz/route.ts`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/src/app/api/translate/route.ts`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/src/app/api/embeddings/rebuild/route.ts` (header validation)

## New Route Checklist
1. Define `requestSchema` as strict.
2. Call `parseJsonWithSchema`.
3. Keep error messages stable for clients.
4. Add/update a security route test.
