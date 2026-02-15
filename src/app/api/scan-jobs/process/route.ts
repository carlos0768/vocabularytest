import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { extractWordsFromImage } from '@/lib/ai/extract-words';
import { extractCircledWordsFromImage } from '@/lib/ai/extract-circled-words';
import { extractHighlightedWordsFromImage } from '@/lib/ai/extract-highlighted-words';
import { extractEikenWordsFromImage } from '@/lib/ai/extract-eiken-words';
import { extractIdiomsFromImage } from '@/lib/ai/extract-idioms';
import { batchGenerateEmbeddings } from '@/lib/embeddings';
import type { ExtractMode } from '@/app/api/extract/route';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';

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

export const maxDuration = 120;

const processSchema = z.object({
  jobId: z.string().uuid(),
}).strict();

// Extract words from a single image using the appropriate mode
async function extractFromImage(
  base64Image: string,
  mode: ExtractMode,
  eikenLevel: string | null,
  openaiApiKey: string | undefined
) {
  if (!openaiApiKey) throw new Error('OpenAI API key not configured');

  switch (mode) {
    case 'circled': {
      return await extractCircledWordsFromImage(base64Image, openaiApiKey, {}, openaiApiKey);
    }
    case 'highlighted': {
      return await extractHighlightedWordsFromImage(base64Image, openaiApiKey, openaiApiKey);
    }
    case 'eiken': {
      const levels = eikenLevel?.split(',') || ['3', 'pre2', '2'];
      return await extractEikenWordsFromImage(base64Image, openaiApiKey, levels[0] as '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1');
    }
    case 'idiom': {
      return await extractIdiomsFromImage(base64Image, openaiApiKey);
    }
    default: {
      return await extractWordsFromImage(base64Image, openaiApiKey, { includeExamples: true });
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

      // Process each image and merge results
      for (const imagePath of imagePaths) {
        const { data: imageData, error: downloadError } = await getSupabaseAdmin().storage
          .from('scan-images')
          .download(imagePath);

        if (downloadError || !imageData) {
          console.error(`Failed to download image ${imagePath}:`, downloadError);
          continue; // Skip failed images, process the rest
        }

        const buffer = await imageData.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const ext = imagePath.split('.').pop()?.toLowerCase();
        const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        const base64Image = `data:${mimeType};base64,${base64}`;

        const result = await extractFromImage(base64Image, mode, job.eiken_level, openaiApiKey);

        if (result.success && result.data?.words) {
          allExtractedWords.push(...result.data.words);
        } else if (!result.success) {
          console.error(`Extraction failed for ${imagePath}:`, result.error);
        }
      }

      if (allExtractedWords.length === 0) {
        await getSupabaseAdmin()
          .from('scan_jobs')
          .update({
            status: 'failed',
            error_message: 'No words found in any image',
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);

        return NextResponse.json({ error: 'No words found' }, { status: 400 });
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

      // Generate embeddings for semantic search (fire and forget - don't block completion)
      if (insertedWords && insertedWords.length > 0) {
        try {
          const texts = insertedWords.map((w: { english: string; japanese: string }) =>
            `${w.english} - ${w.japanese}`
          );
          const embeddings = await batchGenerateEmbeddings(texts);

          for (let i = 0; i < insertedWords.length; i++) {
            if (embeddings[i]) {
              await getSupabaseAdmin().rpc('update_word_embedding', {
                word_id: insertedWords[i].id,
                new_embedding: embeddings[i],
              });
            }
          }
          console.log(`Generated embeddings for ${insertedWords.length} words`);
        } catch (embeddingError) {
          // Don't fail the scan if embedding generation fails
          console.error('Embedding generation failed (non-critical):', embeddingError);
        }
      }

      await getSupabaseAdmin()
        .from('scan_jobs')
        .update({
          status: 'completed',
          project_id: newProject.id,
          result: JSON.stringify({ wordCount: allExtractedWords.length }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);

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

      return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }

  } catch (error) {
    console.error('Process route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
