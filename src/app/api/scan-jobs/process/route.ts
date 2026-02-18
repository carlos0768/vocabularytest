import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { extractWordsFromImage } from '@/lib/ai/extract-words';
import { extractCircledWordsFromImage } from '@/lib/ai/extract-circled-words';
import { extractHighlightedWordsFromImage } from '@/lib/ai/extract-highlighted-words';
import { extractIdiomsFromImage } from '@/lib/ai/extract-idioms';
import { batchGenerateEmbeddings } from '@/lib/embeddings';
import type { ExtractMode } from '@/app/api/extract/route';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { sendScanJobPushNotifications } from '@/lib/notifications/web-push';
import { generateQuizContentForWords } from '@/lib/ai/generate-quiz-content';

// Lazy initialization to avoid build-time errors
let supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    supabaseAdmin = createClient(
      url.startsWith('http') ? url : `https://${url}`,
      key
    );
  }
  return supabaseAdmin;
}

export const maxDuration = 600;

const processSchema = z.object({
  jobId: z.string().uuid(),
}).strict();

type ExtractionWarningCode = 'grammar_not_found';

type ExtractionLikeResult =
  | { success: true; data: { words: unknown[] } }
  | { success: false; error: string; reason?: string };

const EXTRACTION_TIMEOUT_MS = 10 * 60 * 1000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// Extract words from a single image using the appropriate mode
async function extractFromImage(
  base64Image: string,
  mode: ExtractMode,
  eikenLevel: string | null,
  openaiApiKey: string | undefined
): Promise<{ result: ExtractionLikeResult; warningCode?: ExtractionWarningCode }> {
  if (!openaiApiKey) throw new Error('OpenAI API key not configured');

  switch (mode) {
    case 'circled': {
      return { result: await extractCircledWordsFromImage(base64Image, openaiApiKey, {}, openaiApiKey) as ExtractionLikeResult };
    }
    case 'highlighted': {
      return { result: await extractHighlightedWordsFromImage(base64Image, openaiApiKey, openaiApiKey) as ExtractionLikeResult };
    }
    case 'eiken': {
      const levels = eikenLevel?.split(',') || ['3', 'pre2', '2'];
      // Background scan prioritizes speed: use single-pass extraction with EIKEN filter.
      return {
        result: await extractWordsFromImage(base64Image, openaiApiKey, {
          includeExamples: false,
          eikenLevel: levels[0],
        }) as ExtractionLikeResult,
      };
    }
    case 'idiom': {
      const idiomResult = await extractIdiomsFromImage(base64Image, openaiApiKey);
      if (!idiomResult.success && idiomResult.reason === 'no_idiom_found') {
        console.warn('No idioms found in background scan. Falling back to all-word extraction.');
        return {
          result: await extractWordsFromImage(base64Image, openaiApiKey, { includeExamples: true }) as ExtractionLikeResult,
          warningCode: 'grammar_not_found',
        };
      }
      return { result: idiomResult as ExtractionLikeResult };
    }
    default: {
      return { result: await extractWordsFromImage(base64Image, openaiApiKey, { includeExamples: true }) as ExtractionLikeResult };
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, processSchema, {
      invalidMessage: 'Missing jobId',
    });
    if (!parsed.ok) {
      return parsed.response;
    }
    const { jobId } = parsed.data;

    const { data: job, error: jobError } = await getSupabaseAdmin()
      .from('scan_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      console.error('Job not found:', jobError);
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.status !== 'pending') {
      return NextResponse.json({ message: 'Job already processed' });
    }

    await getSupabaseAdmin()
      .from('scan_jobs')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', jobId);

    const openaiApiKey = process.env.OPENAI_API_KEY;

    try {
      // Collect all image paths (support both single and multiple)
      const imagePaths: string[] = job.image_paths || (job.image_path ? [job.image_path] : []);

      if (imagePaths.length === 0) {
        throw new Error('No images to process');
      }

      const mode = job.scan_mode as ExtractMode;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allExtractedWords: any[] = [];
      let firstExtractionError: string | null = null;
      const warningCodes = new Set<ExtractionWarningCode>();
      let grammarWarningNotified = false;

      // Process each image and merge results
      for (const imagePath of imagePaths) {
        const { data: imageData, error: downloadError } = await getSupabaseAdmin().storage
          .from('scan-images')
          .download(imagePath);

        if (downloadError || !imageData) {
          console.error(`Failed to download image ${imagePath}:`, downloadError);
          if (!firstExtractionError) {
            firstExtractionError = '画像データの取得に失敗しました';
          }
          continue; // Skip failed images, process the rest
        }

        const buffer = await imageData.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const ext = imagePath.split('.').pop()?.toLowerCase();
        const mimeType = ext === 'pdf'
          ? 'application/pdf'
          : ext === 'png'
          ? 'image/png'
          : ext === 'webp'
          ? 'image/webp'
          : 'image/jpeg';
        const base64Image = `data:${mimeType};base64,${base64}`;

        let extractionResult: { result: ExtractionLikeResult; warningCode?: ExtractionWarningCode } | null = null;
        try {
          extractionResult = await withTimeout(
            extractFromImage(base64Image, mode, job.eiken_level, openaiApiKey),
            EXTRACTION_TIMEOUT_MS,
            '画像解析がタイムアウトしました'
          );
        } catch (error) {
          console.error(`Extraction timed out or failed unexpectedly for ${imagePath}:`, error);
          if (!firstExtractionError) {
            firstExtractionError = error instanceof Error ? error.message : '画像解析に失敗しました';
          }
          continue;
        }

        const { result, warningCode } = extractionResult;

        if (warningCode) {
          warningCodes.add(warningCode);
        }
        if (warningCode === 'grammar_not_found' && !grammarWarningNotified) {
          grammarWarningNotified = true;
          await sendScanJobPushNotifications(getSupabaseAdmin(), {
            userId: job.user_id,
            jobId,
            projectId: null,
            projectTitle: job.project_title,
            status: 'warning',
          });
        }

        if (result.success && result.data?.words) {
          allExtractedWords.push(...result.data.words);
        } else if (!result.success) {
          console.error(`Extraction failed for ${imagePath}:`, result.error);
          if (!firstExtractionError) {
            firstExtractionError = result.error || '画像の解析に失敗しました';
          }
        }
      }

      if (allExtractedWords.length === 0) {
        const errorMessage = firstExtractionError || 'No words found in any image';
        await getSupabaseAdmin()
          .from('scan_jobs')
          .update({
            status: 'failed',
            error_message: errorMessage,
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);

        await sendScanJobPushNotifications(getSupabaseAdmin(), {
          userId: job.user_id,
          jobId,
          projectId: null,
          projectTitle: job.project_title,
          status: 'failed',
          wordCount: 0,
        });

        return NextResponse.json({ error: errorMessage }, { status: 400 });
      }

      // Create project and save all words at once
      const { data: newProject, error: projectError } = await getSupabaseAdmin()
        .from('projects')
        .insert({
          user_id: job.user_id,
          title: job.project_title,
          icon_image: job.project_icon_image ?? null,
        })
        .select()
        .single();

      if (projectError || !newProject) {
        console.error('Project creation error:', projectError);
        throw new Error('Failed to create project');
      }

      const wordsToInsert = allExtractedWords.map((word) => ({
        project_id: newProject.id,
        english: word.english,
        japanese: word.japanese,
        distractors: word.distractors || [],
        example_sentence: word.exampleSentence || null,
        example_sentence_ja: word.exampleSentenceJa || null,
      }));

      const { data: insertedWords, error: wordsError } = await getSupabaseAdmin()
        .from('words')
        .insert(wordsToInsert)
        .select('id, english, japanese');

      if (wordsError) {
        await getSupabaseAdmin().from('projects').delete().eq('id', newProject.id);
        throw new Error('Failed to insert words');
      }

      const insertedWordsArray = insertedWords ?? [];

      const resultPayload: { wordCount: number; warnings?: ExtractionWarningCode[] } = {
        wordCount: allExtractedWords.length,
      };
      if (warningCodes.size > 0) {
        resultPayload.warnings = Array.from(warningCodes);
      }

      await getSupabaseAdmin()
        .from('scan_jobs')
        .update({
          status: 'completed',
          project_id: newProject.id,
          result: JSON.stringify(resultPayload),
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      void sendScanJobPushNotifications(getSupabaseAdmin(), {
        userId: job.user_id,
        jobId,
        projectId: newProject.id,
        projectTitle: job.project_title,
        status: 'completed',
        wordCount: allExtractedWords.length,
      }).catch((error) => {
        console.error('Failed to send completed push notification:', error);
      });

      // Heavy/non-critical tasks run after completion update so users are not blocked.
      void (async () => {
        if (insertedWordsArray.length === 0) return;

        // Generate embeddings for semantic search (best effort)
        try {
          const texts = insertedWordsArray.map((w: { english: string; japanese: string }) =>
            `${w.english} - ${w.japanese}`
          );
          const embeddings = await batchGenerateEmbeddings(texts);

          await Promise.all(
            insertedWordsArray.map((word: { id: string }, i: number) => {
              if (!embeddings[i]) return Promise.resolve();
              return getSupabaseAdmin().rpc('update_word_embedding', {
                word_id: word.id,
                new_embedding: embeddings[i],
              });
            })
          );
          console.log(`Generated embeddings for ${insertedWordsArray.length} words`);
        } catch (embeddingError) {
          console.error('Embedding generation failed (non-critical):', embeddingError);
        }

        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (serviceRoleKey) {
          const rebuildUrl = new URL('/api/similar-cache/rebuild', request.url);
          fetch(rebuildUrl.toString(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({
              userId: job.user_id,
              mode: 'on_new_words',
              newWordIds: insertedWordsArray.map((word: { id: string }) => word.id),
            }),
          }).catch((error) => {
            console.error('Failed to trigger similar cache rebuild:', error);
          });
        }

        // Pre-generate quiz distractors and example sentences (best effort)
        try {
          const quizSeedWords = insertedWordsArray
            .slice(0, 30)
            .map((w: { id: string; english: string; japanese: string }) => ({
              id: w.id,
              english: w.english,
              japanese: w.japanese,
            }));

          const generatedQuizContent = await generateQuizContentForWords(quizSeedWords);
          await Promise.all(
            generatedQuizContent.map((item) =>
              getSupabaseAdmin()
                .from('words')
                .update({
                  distractors: item.distractors,
                  example_sentence: item.exampleSentence || null,
                  example_sentence_ja: item.exampleSentenceJa || null,
                })
                .eq('id', item.wordId)
            )
          );
        } catch (quizGenerationError) {
          console.error('Quiz pre-generation failed (non-critical):', quizGenerationError);
        }
      })();

      return NextResponse.json({
        success: true,
        projectId: newProject.id,
        wordCount: allExtractedWords.length,
      });

    } catch (processingError) {
      console.error('Processing error:', processingError);

      await getSupabaseAdmin()
        .from('scan_jobs')
        .update({
          status: 'failed',
          error_message: processingError instanceof Error ? processingError.message : 'Processing failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      await sendScanJobPushNotifications(getSupabaseAdmin(), {
        userId: job.user_id,
        jobId,
        projectId: null,
        projectTitle: job.project_title,
        status: 'failed',
        wordCount: 0,
      });

      return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }

  } catch (error) {
    console.error('Process route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
