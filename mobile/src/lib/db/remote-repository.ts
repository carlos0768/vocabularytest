import { supabase } from '../supabase';
import type { Project, Word, WordRepository } from '../../types';
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
} from '../../shared/db';

// Remote implementation of WordRepository using Supabase
// Used for Pro tier users - data synced across devices

export class RemoteWordRepository implements WordRepository {
  // ============ Projects ============

  async createProject(
    project: Omit<Project, 'id' | 'createdAt'>
  ): Promise<Project> {
    const { data, error } = await supabase
      .from('projects')
      .insert(mapProjectToInsert(project))
      .select()
      .single();

    if (error) throw new Error(`Failed to create project: ${error.message}`);

    return mapProjectFromRow(data as ProjectRow);
  }

  async getProjects(userId: string): Promise<Project[]> {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to get projects: ${error.message}`);

    return (data as ProjectRow[]).map(mapProjectFromRow);
  }

  async getProject(id: string): Promise<Project | undefined> {
    const { data, error } = await supabase
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
    const { error } = await supabase
      .from('projects')
      .update(mapProjectUpdates(updates))
      .eq('id', id);

    if (error) throw new Error(`Failed to update project: ${error.message}`);
  }

  async deleteProject(id: string): Promise<void> {
    // Words are deleted automatically via CASCADE
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete project: ${error.message}`);
  }

  // ============ Words ============

  async createWords(words: WordInput[]): Promise<Word[]> {
    const wordsToInsert = words.map(mapWordToInsert);

    const { data, error } = await supabase
      .from('words')
      .insert(wordsToInsert)
      .select();

    if (error) throw new Error(`Failed to create words: ${error.message}`);

    return (data as WordRow[]).map(mapWordFromRow);
  }

  async getWords(projectId: string): Promise<Word[]> {
    const { data, error } = await supabase
      .from('words')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to get words: ${error.message}`);

    return (data as WordRow[]).map(mapWordFromRow);
  }

  async getWord(id: string): Promise<Word | undefined> {
    const { data, error } = await supabase
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
    const { error } = await supabase
      .from('words')
      .update(mapWordUpdates(updates))
      .eq('id', id);

    if (error) throw new Error(`Failed to update word: ${error.message}`);
  }

  async deleteWord(id: string): Promise<void> {
    const { error } = await supabase
      .from('words')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete word: ${error.message}`);
  }

  async deleteWordsByProject(projectId: string): Promise<void> {
    const { error } = await supabase
      .from('words')
      .delete()
      .eq('project_id', projectId);

    if (error) throw new Error(`Failed to delete words: ${error.message}`);
  }
}

// Export singleton
export const remoteRepository = new RemoteWordRepository();
