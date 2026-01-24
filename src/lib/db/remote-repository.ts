import { createBrowserClient } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Project, Word, WordRepository } from '@/types';
import { getDefaultSpacedRepetitionFields } from '@/lib/spaced-repetition';

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
      shareId: data.share_id,
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
      shareId: p.share_id,
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
      shareId: data.share_id,
    };
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.shareId !== undefined) updateData.share_id = updates.shareId;

    const { error } = await this.supabase
      .from('projects')
      .update(updateData)
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
    words: Omit<Word, 'id' | 'createdAt' | 'easeFactor' | 'intervalDays' | 'repetition' | 'isFavorite'>[]
  ): Promise<Word[]> {
    const defaultSR = getDefaultSpacedRepetitionFields();
    const wordsToInsert = words.map((w) => ({
      project_id: w.projectId,
      english: w.english,
      japanese: w.japanese,
      distractors: w.distractors,
      status: w.status,
      ease_factor: defaultSR.easeFactor,
      interval_days: defaultSR.intervalDays,
      repetition: defaultSR.repetition,
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
      lastReviewedAt: w.last_reviewed_at,
      nextReviewAt: w.next_review_at,
      easeFactor: w.ease_factor ?? defaultSR.easeFactor,
      intervalDays: w.interval_days ?? defaultSR.intervalDays,
      repetition: w.repetition ?? defaultSR.repetition,
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

    const defaultSR = getDefaultSpacedRepetitionFields();
    return data.map((w) => ({
      id: w.id,
      projectId: w.project_id,
      english: w.english,
      japanese: w.japanese,
      distractors: w.distractors,
      status: w.status,
      createdAt: w.created_at,
      lastReviewedAt: w.last_reviewed_at,
      nextReviewAt: w.next_review_at,
      easeFactor: w.ease_factor ?? defaultSR.easeFactor,
      intervalDays: w.interval_days ?? defaultSR.intervalDays,
      repetition: w.repetition ?? defaultSR.repetition,
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

    const defaultSR = getDefaultSpacedRepetitionFields();
    return {
      id: data.id,
      projectId: data.project_id,
      english: data.english,
      japanese: data.japanese,
      distractors: data.distractors,
      status: data.status,
      createdAt: data.created_at,
      lastReviewedAt: data.last_reviewed_at,
      nextReviewAt: data.next_review_at,
      easeFactor: data.ease_factor ?? defaultSR.easeFactor,
      intervalDays: data.interval_days ?? defaultSR.intervalDays,
      repetition: data.repetition ?? defaultSR.repetition,
      isFavorite: data.is_favorite ?? false,
    };
  }

  async updateWord(id: string, updates: Partial<Word>): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (updates.english !== undefined) updateData.english = updates.english;
    if (updates.japanese !== undefined) updateData.japanese = updates.japanese;
    if (updates.distractors !== undefined) updateData.distractors = updates.distractors;
    if (updates.status !== undefined) updateData.status = updates.status;
    // Spaced repetition fields
    if (updates.lastReviewedAt !== undefined) updateData.last_reviewed_at = updates.lastReviewedAt;
    if (updates.nextReviewAt !== undefined) updateData.next_review_at = updates.nextReviewAt;
    if (updates.easeFactor !== undefined) updateData.ease_factor = updates.easeFactor;
    if (updates.intervalDays !== undefined) updateData.interval_days = updates.intervalDays;
    if (updates.repetition !== undefined) updateData.repetition = updates.repetition;
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

  // ============ Share Methods ============

  /**
   * Generate a unique share ID for a project
   */
  async generateShareId(projectId: string): Promise<string> {
    // Generate a random 12-character alphanumeric string
    const shareId = Array.from(crypto.getRandomValues(new Uint8Array(9)))
      .map((b) => b.toString(36).padStart(2, '0'))
      .join('')
      .slice(0, 12);

    const { error } = await this.supabase
      .from('projects')
      .update({ share_id: shareId })
      .eq('id', projectId);

    if (error) throw new Error(`Failed to generate share ID: ${error.message}`);

    return shareId;
  }

  /**
   * Get a project by its share ID
   */
  async getProjectByShareId(shareId: string): Promise<Project | undefined> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('share_id', shareId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return undefined;
      throw new Error(`Failed to get shared project: ${error.message}`);
    }

    return {
      id: data.id,
      userId: data.user_id,
      title: data.title,
      createdAt: data.created_at,
      shareId: data.share_id,
    };
  }

  /**
   * Get words for a shared project
   */
  async getWordsByShareId(shareId: string): Promise<Word[]> {
    // First get the project to get its ID
    const project = await this.getProjectByShareId(shareId);
    if (!project) return [];

    const { data, error } = await this.supabase
      .from('words')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to get shared words: ${error.message}`);

    const defaultSR = getDefaultSpacedRepetitionFields();
    return data.map((w) => ({
      id: w.id,
      projectId: w.project_id,
      english: w.english,
      japanese: w.japanese,
      distractors: w.distractors,
      status: w.status,
      createdAt: w.created_at,
      lastReviewedAt: w.last_reviewed_at,
      nextReviewAt: w.next_review_at,
      easeFactor: w.ease_factor ?? defaultSR.easeFactor,
      intervalDays: w.interval_days ?? defaultSR.intervalDays,
      repetition: w.repetition ?? defaultSR.repetition,
      isFavorite: w.is_favorite ?? false,
    }));
  }

  /**
   * Import a shared project (copy to user's own projects)
   */
  async importSharedProject(shareId: string, newUserId: string): Promise<Project> {
    // Get the shared project
    const sharedProject = await this.getProjectByShareId(shareId);
    if (!sharedProject) {
      throw new Error('Shared project not found');
    }

    // Get words from the shared project
    const sharedWords = await this.getWordsByShareId(shareId);

    // Create a new project for the user
    const newProject = await this.createProject({
      userId: newUserId,
      title: `${sharedProject.title} (コピー)`,
    });

    // Copy words to the new project (reset status to 'new')
    if (sharedWords.length > 0) {
      const wordsToCreate = sharedWords.map((w) => ({
        projectId: newProject.id,
        english: w.english,
        japanese: w.japanese,
        distractors: w.distractors,
        status: 'new' as const,
      }));

      await this.createWords(wordsToCreate);
    }

    return newProject;
  }
}

// Export singleton
export const remoteRepository = new RemoteWordRepository();
