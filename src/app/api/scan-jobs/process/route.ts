import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractWordsFromImage } from '@/lib/ai/extract-words';
import { extractCircledWordsFromImage } from '@/lib/ai/extract-circled-words';
import { extractHighlightedWordsFromImage } from '@/lib/ai/extract-highlighted-words';
import { extractEikenWordsFromImage } from '@/lib/ai/extract-eiken-words';
import { extractIdiomsFromImage } from '@/lib/ai/extract-idioms';
import { AI_CONFIG } from '@/lib/ai/config';
import type { ExtractMode } from '@/app/api/extract/route';

// Service role client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!.startsWith('http') 
    ? process.env.NEXT_PUBLIC_SUPABASE_URL! 
    : `https://${process.env.NEXT_PUBLIC_SUPABASE_URL}`,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const maxDuration = 60; // Allow up to 60 seconds for processing

export async function POST(request: NextRequest) {
  try {
    // Verify internal call (service role key)
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = await request.json();
    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    // Get job details
    const { data: job, error: jobError } = await supabaseAdmin
      .from('scan_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      console.error('Job not found:', jobError);
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Skip if already processed
    if (job.status !== 'pending') {
      return NextResponse.json({ message: 'Job already processed' });
    }

    // Update status to processing
    await supabaseAdmin
      .from('scan_jobs')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', jobId);

    const geminiApiKey = process.env.GOOGLE_AI_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    try {
      // Download image from storage
      const { data: imageData, error: downloadError } = await supabaseAdmin.storage
        .from('scan-images')
        .download(job.image_path);

      if (downloadError || !imageData) {
        throw new Error('Failed to download image');
      }

      // Convert to base64
      const buffer = await imageData.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const ext = job.image_path.split('.').pop()?.toLowerCase();
      const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const base64Image = `data:${mimeType};base64,${base64}`;

      // Extract words based on scan mode
      const mode = job.scan_mode as ExtractMode;
      let result;

      switch (mode) {
        case 'circled': {
          const circledProvider = AI_CONFIG.extraction.circled.provider;
          const circledApiKey = circledProvider === 'gemini' ? geminiApiKey : openaiApiKey;
          if (!circledApiKey) throw new Error('API key not configured');
          result = await extractCircledWordsFromImage(base64Image, circledApiKey, {}, openaiApiKey);
          break;
        }
        case 'highlighted': {
          const highlightedProvider = AI_CONFIG.extraction.circled.provider;
          const highlightedApiKey = highlightedProvider === 'gemini' ? geminiApiKey : openaiApiKey;
          if (!highlightedApiKey) throw new Error('API key not configured');
          result = await extractHighlightedWordsFromImage(base64Image, highlightedApiKey, openaiApiKey);
          break;
        }
        case 'eiken': {
          if (!geminiApiKey || !openaiApiKey) throw new Error('API keys not configured');
          const levels = job.eiken_level?.split(',') || ['3', 'pre2', '2'];
          result = await extractEikenWordsFromImage(base64Image, geminiApiKey, openaiApiKey, levels[0]);
          break;
        }
        case 'idiom': {
          const idiomsProvider = AI_CONFIG.extraction.idioms.provider;
          const idiomsApiKey = idiomsProvider === 'gemini' ? geminiApiKey : openaiApiKey;
          if (!idiomsApiKey) throw new Error('API key not configured');
          result = await extractIdiomsFromImage(base64Image, idiomsApiKey);
          break;
        }
        default: {
          const wordsProvider = AI_CONFIG.extraction.words.provider;
          const wordsApiKey = wordsProvider === 'gemini' ? geminiApiKey : openaiApiKey;
          if (!wordsApiKey) throw new Error('API key not configured');
          result = await extractWordsFromImage(base64Image, wordsApiKey, { includeExamples: true });
        }
      }

      if (!result.success) {
        await supabaseAdmin
          .from('scan_jobs')
          .update({
            status: 'failed',
            error_message: result.error || '単語の抽出に失敗しました',
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);

        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      const extractedWords = result.data.words;

      if (extractedWords.length === 0) {
        await supabaseAdmin
          .from('scan_jobs')
          .update({
            status: 'failed',
            error_message: '単語が見つかりませんでした',
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);

        return NextResponse.json({ error: 'No words found' }, { status: 400 });
      }

      // Create project
      const { data: project, error: projectError } = await supabaseAdmin
        .from('projects')
        .insert({
          user_id: job.user_id,
          title: job.project_title,
        })
        .select()
        .single();

      if (projectError || !project) {
        console.error('Project creation error:', projectError);
        throw new Error('Failed to create project');
      }

      // Insert words
      const wordsToInsert = extractedWords.map((word) => ({
        project_id: project.id,
        english: word.english,
        japanese: word.japanese,
        distractors: word.distractors || [],
        example_sentence: word.exampleSentence || null,
        example_sentence_ja: word.exampleSentenceJa || null,
      }));

      const { error: wordsError } = await supabaseAdmin
        .from('words')
        .insert(wordsToInsert);

      if (wordsError) {
        // Clean up project if words insertion failed
        await supabaseAdmin.from('projects').delete().eq('id', project.id);
        throw new Error('Failed to insert words');
      }

      // Update job as completed
      await supabaseAdmin
        .from('scan_jobs')
        .update({
          status: 'completed',
          project_id: project.id,
          result: JSON.stringify({ wordCount: extractedWords.length }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      return NextResponse.json({
        success: true,
        projectId: project.id,
        wordCount: extractedWords.length,
      });

    } catch (processingError) {
      console.error('Processing error:', processingError);
      
      await supabaseAdmin
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
