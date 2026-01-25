import { createBrowserClient } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Project, Word, WordRepository } from '@/types';
import {
  mapProjectFromRow,
  mapProjectToInsert,
  mapProjectUpdates,
  mapWordFromRow,
  mapWordToInsert,
  mapWordUpdates,
  type ProjectRow,
  type WordRow,
  type WordInput,
} from '../../../shared/db';

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
      .insert(mapProjectToInsert(project))
      .select()
      .single();

    if (error) throw new Error(`Failed to create project: ${error.message}`);

    return mapProjectFromRow(data as ProjectRow);
  }

  async getProjects(userId: string): Promise<Project[]> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to get projects: ${error.message}`);

    return (data as ProjectRow[]).map(mapProjectFromRow);
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

    return mapProjectFromRow(data as ProjectRow);
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<void> {
    const { error } = await this.supabase
      .from('projects')
      .update(mapProjectUpdates(updates))
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

  async createWords(words: WordInput[]): Promise<Word[]> {
    const wordsToInsert = words.map(mapWordToInsert);

    const { data, error } = await this.supabase
      .from('words')
      .insert(wordsToInsert)
      .select();

    if (error) throw new Error(`Failed to create words: ${error.message}`);

    return (data as WordRow[]).map(mapWordFromRow);
  }

  async getWords(projectId: string): Promise<Word[]> {
    const { data, error } = await this.supabase
      .from('words')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to get words: ${error.message}`);

    return (data as WordRow[]).map(mapWordFromRow);
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

    return mapWordFromRow(data as WordRow);
  }

  async updateWord(id: string, updates: Partial<Word>): Promise<void> {
    const { error } = await this.supabase
      .from('words')
      .update(mapWordUpdates(updates))
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

    return mapProjectFromRow(data as ProjectRow);
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

    return (data as WordRow[]).map(mapWordFromRow);
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

    // Copy words to the new project
    if (sharedWords.length > 0) {
      const wordsToCreate: WordInput[] = sharedWords.map((w) => ({
        projectId: newProject.id,
        english: w.english,
        japanese: w.japanese,
        distractors: w.distractors,
        exampleSentence: w.exampleSentence,
        exampleSentenceJa: w.exampleSentenceJa,
      }));

      await this.createWords(wordsToCreate);
    }

    return newProject;
  }
}

// Export singleton
export const remoteRepository = new RemoteWordRepository();
