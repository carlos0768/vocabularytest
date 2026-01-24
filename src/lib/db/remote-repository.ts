import { createBrowserClient } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Project, Word, WordRepository } from '@/types';

// Remote implementation of WordRepository using Supabase
// Used for Pro tier users - data synced across devices

export class RemoteWordRepository implements WordRepository {
  private _supabase: SupabaseClient | null = null;

  // Lazy initialization to avoid SSR issues
  private get supabase(): SupabaseClient {
    if (!this._supabase) {
      this._supabase = createBrowserClient();
    }
    return this._supabase;
  }

  // ============ Projects ============

  async createProject(
    project: Omit<Project, 'id' | 'createdAt'>
  ): Promise<Project> {
    const { data, error } = await this.supabase
      .from('projects')
      .insert({
        user_id: project.userId,
        title: project.title,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create project: ${error.message}`);

    return {
      id: data.id,
      userId: data.user_id,
      title: data.title,
      createdAt: data.created_at,
    };
  }

  async getProjects(userId: string): Promise<Project[]> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to get projects: ${error.message}`);

    return data.map((p) => ({
      id: p.id,
      userId: p.user_id,
      title: p.title,
      createdAt: p.created_at,
    }));
  }

  async getProject(id: string): Promise<Project | undefined> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return undefined;
      throw new Error(`Failed to get project: ${error.message}`);
    }

    return {
      id: data.id,
      userId: data.user_id,
      title: data.title,
      createdAt: data.created_at,
    };
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<void> {
    const { error } = await this.supabase
      .from('projects')
      .update({
        title: updates.title,
      })
      .eq('id', id);

    if (error) throw new Error(`Failed to update project: ${error.message}`);
  }

  async deleteProject(id: string): Promise<void> {
    // Words are deleted automatically via CASCADE
    const { error } = await this.supabase
      .from('projects')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete project: ${error.message}`);
  }

  // ============ Words ============

  async createWords(
    words: Omit<Word, 'id' | 'createdAt' | 'isFavorite'>[]
  ): Promise<Word[]> {
    const wordsToInsert = words.map((w) => ({
      project_id: w.projectId,
      english: w.english,
      japanese: w.japanese,
      distractors: w.distractors,
      status: w.status,
      is_favorite: false,
    }));

    const { data, error } = await this.supabase
      .from('words')
      .insert(wordsToInsert)
      .select();

    if (error) throw new Error(`Failed to create words: ${error.message}`);

    return data.map((w) => ({
      id: w.id,
      projectId: w.project_id,
      english: w.english,
      japanese: w.japanese,
      distractors: w.distractors,
      status: w.status,
      createdAt: w.created_at,
      isFavorite: w.is_favorite ?? false,
    }));
  }

  async getWords(projectId: string): Promise<Word[]> {
    const { data, error } = await this.supabase
      .from('words')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to get words: ${error.message}`);

    return data.map((w) => ({
      id: w.id,
      projectId: w.project_id,
      english: w.english,
      japanese: w.japanese,
      distractors: w.distractors,
      status: w.status,
      createdAt: w.created_at,
      isFavorite: w.is_favorite ?? false,
    }));
  }

  async getWord(id: string): Promise<Word | undefined> {
    const { data, error } = await this.supabase
      .from('words')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return undefined;
      throw new Error(`Failed to get word: ${error.message}`);
    }

    return {
      id: data.id,
      projectId: data.project_id,
      english: data.english,
      japanese: data.japanese,
      distractors: data.distractors,
      status: data.status,
      createdAt: data.created_at,
      isFavorite: data.is_favorite ?? false,
    };
  }

  async updateWord(id: string, updates: Partial<Word>): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (updates.english !== undefined) updateData.english = updates.english;
    if (updates.japanese !== undefined) updateData.japanese = updates.japanese;
    if (updates.distractors !== undefined) updateData.distractors = updates.distractors;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.isFavorite !== undefined) updateData.is_favorite = updates.isFavorite;

    const { error } = await this.supabase
      .from('words')
      .update(updateData)
      .eq('id', id);

    if (error) throw new Error(`Failed to update word: ${error.message}`);
  }

  async deleteWord(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('words')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete word: ${error.message}`);
  }

  async deleteWordsByProject(projectId: string): Promise<void> {
    const { error } = await this.supabase
      .from('words')
      .delete()
      .eq('project_id', projectId);

    if (error) throw new Error(`Failed to delete words: ${error.message}`);
  }
}

// Export singleton
export const remoteRepository = new RemoteWordRepository();
