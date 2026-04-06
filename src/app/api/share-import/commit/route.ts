import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolveOrCreateLexiconEntry } from '@/lib/lexicon/resolver';
import { RESOLVED_WORD_TEXT_SELECT_COLUMNS } from '@/lib/words/resolved';
import { mapWordFromRow, type WordRow as SharedWordRow } from '../../../../../shared/db';
import {
  buildDefaultProjectTitle,
  normalizeEnglish,
  normalizeJapanese,
  resolveAuthenticatedUser,
} from '@/app/api/share-import/shared';

const requestSchema = z.object({
  targetProjectId: z.string().uuid().nullable().optional(),
  newProjectTitle: z.string().trim().max(120).optional(),
  english: z.string().trim().min(1).max(128),
  japanese: z.string().trim().min(1).max(256),
  originalText: z.string().trim().max(2000).optional(),
  sourceApp: z.string().trim().max(120).optional(),
}).strict();

type ProjectRow = {
  id: string;
  title: string;
  user_id: string;
};

type WordRow = {
  id: string;
  english: string;
  japanese: string;
};

type InsertedWord = {
  id: string;
};

type CommitDeps = {
  resolveUser: (request: NextRequest) => Promise<{ id: string } | null>;
  findOwnedProject: (request: NextRequest, userId: string, projectId: string) => Promise<ProjectRow | null>;
  createProject: (request: NextRequest, userId: string, title: string) => Promise<ProjectRow>;
  listWords: (request: NextRequest, projectId: string) => Promise<WordRow[]>;
  insertWord: (
    request: NextRequest,
    projectId: string,
    english: string,
    japanese: string,
  ) => Promise<InsertedWord>;
};

const defaultDeps: CommitDeps = {
  resolveUser: resolveAuthenticatedUser,
  async findOwnedProject(request: NextRequest, userId: string, projectId: string) {
    const supabase = await createRouteHandlerClient(request);
    const { data, error } = await supabase
      .from('projects')
      .select('id,title,user_id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle<ProjectRow>();

    if (error) {
      throw new Error(error.message || 'project_find_failed');
    }

    return data;
  },
  async createProject(request: NextRequest, userId: string, title: string) {
    const supabase = await createRouteHandlerClient(request);
    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        title,
      })
      .select('id,title,user_id')
      .single<ProjectRow>();

    if (error || !data) {
      throw new Error(error?.message || 'project_create_failed');
    }

    return data;
  },
  async listWords(request: NextRequest, projectId: string) {
    const supabase = await createRouteHandlerClient(request);
    const { data, error } = await supabase
      .from('words')
      .select(RESOLVED_WORD_TEXT_SELECT_COLUMNS)
      .eq('project_id', projectId)
      .limit(5000);

    if (error) {
      throw new Error(error.message || 'word_list_failed');
    }

    return ((data ?? []) as SharedWordRow[]).map((row) => {
      const word = mapWordFromRow(row);
      return {
        id: word.id,
        english: word.english,
        japanese: word.japanese,
      };
    });
  },
  async insertWord(request: NextRequest, projectId: string, english: string, japanese: string) {
    const supabase = await createRouteHandlerClient(request);
    const lexiconEntry = await resolveOrCreateLexiconEntry({
      english,
      japaneseHint: japanese,
      partOfSpeechTags: ['other'],
    });
    const { data, error } = await supabase
      .from('words')
      .insert({
        project_id: projectId,
        english,
        japanese,
        lexicon_entry_id: lexiconEntry?.id ?? null,
        distractors: [],
      })
      .select('id')
      .single<InsertedWord>();

    if (error || !data) {
      throw new Error(error?.message || 'word_insert_failed');
    }

    return data;
  },
};

/** Fire-and-forget: log share import for admin analytics */
function logShareImport(
  userId: string,
  projectId: string,
  wordId: string,
  english: string,
  japanese: string,
  sourceApp: string | undefined,
  duplicate: boolean,
) {
  try {
    const admin = getSupabaseAdmin();
    admin
      .from('share_import_logs')
      .insert({ user_id: userId, project_id: projectId, word_id: wordId, english, japanese, source_app: sourceApp ?? null, duplicate })
      .then(({ error }) => { if (error) console.error('share_import_log insert failed:', error.message); });
  } catch {
    // non-critical — swallow
  }
}

function findDuplicateWord(rows: WordRow[], english: string, japanese: string): WordRow | null {
  const normalizedEnglish = normalizeEnglish(english);
  const normalizedJapanese = normalizeJapanese(japanese);

  for (const row of rows) {
    if (
      normalizeEnglish(row.english) === normalizedEnglish
      && normalizeJapanese(row.japanese) === normalizedJapanese
    ) {
      return row;
    }
  }

  return null;
}

export async function handleShareImportCommitPost(
  request: NextRequest,
  deps: CommitDeps = defaultDeps,
) {
  try {
    const user = await deps.resolveUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '保存データが不正です',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const normalizedEnglishValue = normalizeEnglish(parsed.data.english);
    const normalizedJapaneseValue = normalizeJapanese(parsed.data.japanese);
    if (!normalizedEnglishValue || !normalizedJapaneseValue) {
      return NextResponse.json({ success: false, error: '保存データが不正です。' }, { status: 400 });
    }

    let project: ProjectRow;
    const requestedProjectId = parsed.data.targetProjectId ?? null;

    if (requestedProjectId) {
      const existing = await deps.findOwnedProject(request, user.id, requestedProjectId);
      if (!existing) {
        return NextResponse.json({ success: false, error: '指定した単語帳にアクセスできません。' }, { status: 403 });
      }
      project = existing;
    } else {
      const trimmed = parsed.data.newProjectTitle?.trim() ?? '';
      const title = trimmed.length > 0 ? trimmed : buildDefaultProjectTitle();
      project = await deps.createProject(request, user.id, title);
    }

    const words = await deps.listWords(request, project.id);
    const duplicate = findDuplicateWord(words, normalizedEnglishValue, normalizedJapaneseValue);

    if (duplicate) {
      logShareImport(user.id, project.id, duplicate.id, normalizedEnglishValue, normalizedJapaneseValue, parsed.data.sourceApp, true);
      return NextResponse.json({
        success: true,
        projectId: project.id,
        projectTitle: project.title,
        wordId: duplicate.id,
        created: false,
        duplicate: true,
      });
    }

    const inserted = await deps.insertWord(
      request,
      project.id,
      normalizedEnglishValue,
      normalizedJapaneseValue,
    );

    logShareImport(user.id, project.id, inserted.id, normalizedEnglishValue, normalizedJapaneseValue, parsed.data.sourceApp, false);

    return NextResponse.json({
      success: true,
      projectId: project.id,
      projectTitle: project.title,
      wordId: inserted.id,
      created: true,
      duplicate: false,
    });
  } catch (error) {
    console.error('share-import commit error:', error);
    return NextResponse.json({ success: false, error: '保存に失敗しました。' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleShareImportCommitPost(request);
}

export const __internal = {
  findDuplicateWord,
};
