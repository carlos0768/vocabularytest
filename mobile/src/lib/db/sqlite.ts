import * as SQLite from 'expo-sqlite';
import { generateId } from '../utils';
import type { Project, Word, WordRepository, WordStatus } from '../../types';

let db: SQLite.SQLiteDatabase | null = null;

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('scanvocab.db');
    await initDatabase(db);
  }
  return db;
}

async function initDatabase(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      title TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      isSynced INTEGER DEFAULT 0,
      shareId TEXT
    );

    CREATE TABLE IF NOT EXISTS words (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      english TEXT NOT NULL,
      japanese TEXT NOT NULL,
      distractors TEXT NOT NULL,
      exampleSentence TEXT,
      exampleSentenceJa TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      createdAt TEXT NOT NULL,
      lastReviewedAt TEXT,
      nextReviewAt TEXT,
      easeFactor REAL DEFAULT 2.5,
      intervalDays INTEGER DEFAULT 0,
      repetition INTEGER DEFAULT 0,
      isFavorite INTEGER DEFAULT 0,
      FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_projects_userId ON projects(userId);
    CREATE INDEX IF NOT EXISTS idx_words_projectId ON words(projectId);
  `);

  // Migration: Add new columns if they don't exist (for existing databases)
  try {
    await database.execAsync(`ALTER TABLE projects ADD COLUMN shareId TEXT`);
  } catch {
    // Column already exists
  }
  try {
    await database.execAsync(`ALTER TABLE words ADD COLUMN exampleSentence TEXT`);
  } catch {
    // Column already exists
  }
  try {
    await database.execAsync(`ALTER TABLE words ADD COLUMN exampleSentenceJa TEXT`);
  } catch {
    // Column already exists
  }
  try {
    await database.execAsync(`ALTER TABLE words ADD COLUMN lastReviewedAt TEXT`);
  } catch {
    // Column already exists
  }
  try {
    await database.execAsync(`ALTER TABLE words ADD COLUMN nextReviewAt TEXT`);
  } catch {
    // Column already exists
  }
  try {
    await database.execAsync(`ALTER TABLE words ADD COLUMN easeFactor REAL DEFAULT 2.5`);
  } catch {
    // Column already exists
  }
  try {
    await database.execAsync(`ALTER TABLE words ADD COLUMN intervalDays INTEGER DEFAULT 0`);
  } catch {
    // Column already exists
  }
  try {
    await database.execAsync(`ALTER TABLE words ADD COLUMN repetition INTEGER DEFAULT 0`);
  } catch {
    // Column already exists
  }
  try {
    await database.execAsync(`ALTER TABLE words ADD COLUMN isFavorite INTEGER DEFAULT 0`);
  } catch {
    // Column already exists
  }
}

export class LocalWordRepository implements WordRepository {
  // Projects
  async createProject(project: Omit<Project, 'id' | 'createdAt'>): Promise<Project> {
    const database = await getDatabase();
    const id = generateId();
    const createdAt = new Date().toISOString();

    await database.runAsync(
      'INSERT INTO projects (id, userId, title, createdAt, isSynced) VALUES (?, ?, ?, ?, ?)',
      [id, project.userId, project.title, createdAt, project.isSynced ? 1 : 0]
    );

    return {
      id,
      userId: project.userId,
      title: project.title,
      createdAt,
      isSynced: project.isSynced,
    };
  }

  async getProjects(userId: string): Promise<Project[]> {
    const database = await getDatabase();
    const rows = await database.getAllAsync<{
      id: string;
      userId: string;
      title: string;
      createdAt: string;
      isSynced: number;
      shareId: string | null;
    }>(
      'SELECT * FROM projects WHERE userId = ? ORDER BY createdAt DESC',
      [userId]
    );

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      title: row.title,
      createdAt: row.createdAt,
      isSynced: row.isSynced === 1,
      shareId: row.shareId || undefined,
    }));
  }

  async getProject(id: string): Promise<Project | undefined> {
    const database = await getDatabase();
    const row = await database.getFirstAsync<{
      id: string;
      userId: string;
      title: string;
      createdAt: string;
      isSynced: number;
      shareId: string | null;
    }>('SELECT * FROM projects WHERE id = ?', [id]);

    if (!row) return undefined;

    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      createdAt: row.createdAt,
      isSynced: row.isSynced === 1,
      shareId: row.shareId || undefined,
    };
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<void> {
    const database = await getDatabase();
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.isSynced !== undefined) {
      fields.push('isSynced = ?');
      values.push(updates.isSynced ? 1 : 0);
    }
    if (updates.shareId !== undefined) {
      fields.push('shareId = ?');
      values.push(updates.shareId || null);
    }

    if (fields.length > 0) {
      values.push(id);
      await database.runAsync(
        `UPDATE projects SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
    }
  }

  async deleteProject(id: string): Promise<void> {
    const database = await getDatabase();
    await database.runAsync('DELETE FROM words WHERE projectId = ?', [id]);
    await database.runAsync('DELETE FROM projects WHERE id = ?', [id]);
  }

  // Words
  async createWords(words: Omit<Word, 'id' | 'createdAt' | 'easeFactor' | 'intervalDays' | 'repetition' | 'isFavorite' | 'lastReviewedAt' | 'nextReviewAt' | 'status'>[]): Promise<Word[]> {
    const database = await getDatabase();
    const createdWords: Word[] = [];

    for (const word of words) {
      const id = generateId();
      const createdAt = new Date().toISOString();

      await database.runAsync(
        'INSERT INTO words (id, projectId, english, japanese, distractors, exampleSentence, exampleSentenceJa, status, createdAt, easeFactor, intervalDays, repetition, isFavorite) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          id,
          word.projectId,
          word.english,
          word.japanese,
          JSON.stringify(word.distractors),
          word.exampleSentence || null,
          word.exampleSentenceJa || null,
          'new',
          createdAt,
          2.5,
          0,
          0,
          0,
        ]
      );

      createdWords.push({
        id,
        projectId: word.projectId,
        english: word.english,
        japanese: word.japanese,
        distractors: word.distractors,
        exampleSentence: word.exampleSentence,
        exampleSentenceJa: word.exampleSentenceJa,
        status: 'new',
        createdAt,
        easeFactor: 2.5,
        intervalDays: 0,
        repetition: 0,
        isFavorite: false,
      });
    }

    return createdWords;
  }

  async getWords(projectId: string): Promise<Word[]> {
    const database = await getDatabase();
    const rows = await database.getAllAsync<{
      id: string;
      projectId: string;
      english: string;
      japanese: string;
      distractors: string;
      exampleSentence: string | null;
      exampleSentenceJa: string | null;
      status: string;
      createdAt: string;
      lastReviewedAt: string | null;
      nextReviewAt: string | null;
      easeFactor: number;
      intervalDays: number;
      repetition: number;
      isFavorite: number;
    }>('SELECT * FROM words WHERE projectId = ? ORDER BY createdAt ASC', [
      projectId,
    ]);

    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      english: row.english,
      japanese: row.japanese,
      distractors: JSON.parse(row.distractors),
      exampleSentence: row.exampleSentence || undefined,
      exampleSentenceJa: row.exampleSentenceJa || undefined,
      status: row.status as WordStatus,
      createdAt: row.createdAt,
      lastReviewedAt: row.lastReviewedAt || undefined,
      nextReviewAt: row.nextReviewAt || undefined,
      easeFactor: row.easeFactor ?? 2.5,
      intervalDays: row.intervalDays ?? 0,
      repetition: row.repetition ?? 0,
      isFavorite: row.isFavorite === 1,
    }));
  }

  async getWord(id: string): Promise<Word | undefined> {
    const database = await getDatabase();
    const row = await database.getFirstAsync<{
      id: string;
      projectId: string;
      english: string;
      japanese: string;
      distractors: string;
      exampleSentence: string | null;
      exampleSentenceJa: string | null;
      status: string;
      createdAt: string;
      lastReviewedAt: string | null;
      nextReviewAt: string | null;
      easeFactor: number;
      intervalDays: number;
      repetition: number;
      isFavorite: number;
    }>('SELECT * FROM words WHERE id = ?', [id]);

    if (!row) return undefined;

    return {
      id: row.id,
      projectId: row.projectId,
      english: row.english,
      japanese: row.japanese,
      distractors: JSON.parse(row.distractors),
      exampleSentence: row.exampleSentence || undefined,
      exampleSentenceJa: row.exampleSentenceJa || undefined,
      status: row.status as WordStatus,
      createdAt: row.createdAt,
      lastReviewedAt: row.lastReviewedAt || undefined,
      nextReviewAt: row.nextReviewAt || undefined,
      easeFactor: row.easeFactor ?? 2.5,
      intervalDays: row.intervalDays ?? 0,
      repetition: row.repetition ?? 0,
      isFavorite: row.isFavorite === 1,
    };
  }

  async updateWord(id: string, updates: Partial<Word>): Promise<void> {
    const database = await getDatabase();
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.english !== undefined) {
      fields.push('english = ?');
      values.push(updates.english);
    }
    if (updates.japanese !== undefined) {
      fields.push('japanese = ?');
      values.push(updates.japanese);
    }
    if (updates.distractors !== undefined) {
      fields.push('distractors = ?');
      values.push(JSON.stringify(updates.distractors));
    }
    if (updates.exampleSentence !== undefined) {
      fields.push('exampleSentence = ?');
      values.push(updates.exampleSentence || null);
    }
    if (updates.exampleSentenceJa !== undefined) {
      fields.push('exampleSentenceJa = ?');
      values.push(updates.exampleSentenceJa || null);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.lastReviewedAt !== undefined) {
      fields.push('lastReviewedAt = ?');
      values.push(updates.lastReviewedAt || null);
    }
    if (updates.nextReviewAt !== undefined) {
      fields.push('nextReviewAt = ?');
      values.push(updates.nextReviewAt || null);
    }
    if (updates.easeFactor !== undefined) {
      fields.push('easeFactor = ?');
      values.push(updates.easeFactor);
    }
    if (updates.intervalDays !== undefined) {
      fields.push('intervalDays = ?');
      values.push(updates.intervalDays);
    }
    if (updates.repetition !== undefined) {
      fields.push('repetition = ?');
      values.push(updates.repetition);
    }
    if (updates.isFavorite !== undefined) {
      fields.push('isFavorite = ?');
      values.push(updates.isFavorite ? 1 : 0);
    }

    if (fields.length > 0) {
      values.push(id);
      await database.runAsync(
        `UPDATE words SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
    }
  }

  async deleteWord(id: string): Promise<void> {
    const database = await getDatabase();
    await database.runAsync('DELETE FROM words WHERE id = ?', [id]);
  }

  async deleteWordsByProject(projectId: string): Promise<void> {
    const database = await getDatabase();
    await database.runAsync('DELETE FROM words WHERE projectId = ?', [projectId]);
  }
}
