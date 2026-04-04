import type { Project, Word, WordRepository } from '../../types';
import { generateId } from '../utils';

interface PersistedState {
  projects: Project[];
  words: Word[];
}

const STORAGE_KEY = 'merken_mobile_web_repository_v1';

function getDefaultState(): PersistedState {
  return {
    projects: [],
    words: [],
  };
}

function readState(): PersistedState {
  if (typeof window === 'undefined') {
    return getDefaultState();
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return getDefaultState();
    const parsed = JSON.parse(stored) as PersistedState;
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      words: Array.isArray(parsed.words) ? parsed.words : [],
    };
  } catch {
    return getDefaultState();
  }
}

function writeState(state: PersistedState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export class WebLocalWordRepository implements WordRepository {
  async createProject(
    project: Omit<Project, 'id' | 'createdAt' | 'sourceLabels'> & { sourceLabels?: string[] }
  ): Promise<Project> {
    const state = readState();
    const createdProject: Project = {
      id: generateId(),
      userId: project.userId,
      title: project.title,
      sourceLabels: project.sourceLabels ?? [],
      iconImage: project.iconImage,
      createdAt: new Date().toISOString(),
      isSynced: project.isSynced,
      shareId: project.shareId,
      shareScope: project.shareScope ?? 'private',
      isFavorite: project.isFavorite ?? false,
    };

    state.projects = [createdProject, ...state.projects];
    writeState(state);
    return createdProject;
  }

  async getProjects(userId: string): Promise<Project[]> {
    const state = readState();
    return state.projects
      .filter((project) => project.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getProject(id: string): Promise<Project | undefined> {
    const state = readState();
    return state.projects.find((project) => project.id === id);
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<void> {
    const state = readState();
    state.projects = state.projects.map((project) =>
      project.id === id ? { ...project, ...updates } : project
    );
    writeState(state);
  }

  async deleteProject(id: string): Promise<void> {
    const state = readState();
    state.projects = state.projects.filter((project) => project.id !== id);
    state.words = state.words.filter((word) => word.projectId !== id);
    writeState(state);
  }

  async createWords(
    words: Omit<
      Word,
      | 'id'
      | 'createdAt'
      | 'easeFactor'
      | 'intervalDays'
      | 'repetition'
      | 'isFavorite'
      | 'lastReviewedAt'
      | 'nextReviewAt'
      | 'status'
    >[]
  ): Promise<Word[]> {
    const state = readState();
    const createdWords = words.map((word) => ({
      ...word,
      id: generateId(),
      createdAt: new Date().toISOString(),
      status: 'new' as const,
      easeFactor: 2.5,
      intervalDays: 0,
      repetition: 0,
      isFavorite: false,
    }));

    state.words = [...state.words, ...createdWords];
    writeState(state);
    return createdWords;
  }

  async getWords(projectId: string): Promise<Word[]> {
    const state = readState();
    return state.words
      .filter((word) => word.projectId === projectId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async getWord(id: string): Promise<Word | undefined> {
    const state = readState();
    return state.words.find((word) => word.id === id);
  }

  async updateWord(id: string, updates: Partial<Word>): Promise<void> {
    const state = readState();
    state.words = state.words.map((word) =>
      word.id === id ? { ...word, ...updates } : word
    );
    writeState(state);
  }

  async deleteWord(id: string): Promise<void> {
    const state = readState();
    state.words = state.words.filter((word) => word.id !== id);
    writeState(state);
  }

  async deleteWordsByProject(projectId: string): Promise<void> {
    const state = readState();
    state.words = state.words.filter((word) => word.projectId !== projectId);
    writeState(state);
  }
}
