import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCAN_CONFIRM_SESSION_KEYS,
  clearScanConfirmProjectIcon,
  getScanConfirmProjectDraft,
  hasScanConfirmExistingProject,
  prepareScanConfirmForExistingProject,
  saveScanConfirmProjectDraft,
  saveScanConfirmResultPayload,
  setScanConfirmExistingProject,
  type ScanConfirmStorage,
} from './scan-session-storage';

class MemoryStorage implements ScanConfirmStorage {
  readonly removedKeys: string[] = [];
  private readonly values = new Map<string, string>();

  constructor(initialValues: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initialValues)) {
      this.values.set(key, value);
    }
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.removedKeys.push(key);
    this.values.delete(key);
  }

  entries(): Record<string, string> {
    return Object.fromEntries(this.values.entries());
  }
}

test('saveScanConfirmResultPayload fixes the scan confirm result keys and JSON shape', () => {
  const storage = new MemoryStorage();
  const words = [
    {
      english: 'book',
      japanese: '本',
      distractors: ['ペン', '机', '紙'],
      partOfSpeechTags: ['noun'],
    },
  ];
  const sourceLabels = ['鉄壁'];
  const lexiconEntries = [
    {
      id: 'lexicon-book',
      headword: 'book',
      normalizedHeadword: 'book',
      pos: 'noun',
    },
  ];

  saveScanConfirmResultPayload(storage, {
    words,
    sourceLabels,
    lexiconEntries,
  });

  assert.deepEqual(storage.entries(), {
    [SCAN_CONFIRM_SESSION_KEYS.extractedWords]: JSON.stringify(words),
    [SCAN_CONFIRM_SESSION_KEYS.sourceLabels]: JSON.stringify(sourceLabels),
    [SCAN_CONFIRM_SESSION_KEYS.lexiconEntries]: JSON.stringify(lexiconEntries),
  });
});

test('setScanConfirmExistingProject stores the target id and clears new-project draft fields', () => {
  const storage = new MemoryStorage({
    [SCAN_CONFIRM_SESSION_KEYS.projectName]: 'New Project',
    [SCAN_CONFIRM_SESSION_KEYS.projectIcon]: 'data:image/png;base64,icon',
  });

  setScanConfirmExistingProject(storage, 'project-1');

  assert.equal(storage.getItem(SCAN_CONFIRM_SESSION_KEYS.existingProjectId), 'project-1');
  assert.equal(storage.getItem(SCAN_CONFIRM_SESSION_KEYS.projectName), null);
  assert.equal(storage.getItem(SCAN_CONFIRM_SESSION_KEYS.projectIcon), null);
  assert.deepEqual(storage.removedKeys, [
    SCAN_CONFIRM_SESSION_KEYS.projectName,
    SCAN_CONFIRM_SESSION_KEYS.projectIcon,
  ]);
});

test('prepareScanConfirmForExistingProject clears stale project scan-to-add metadata', () => {
  const storage = new MemoryStorage({
    [SCAN_CONFIRM_SESSION_KEYS.extractedWords]: '[{"english":"old"}]',
    [SCAN_CONFIRM_SESSION_KEYS.sourceLabels]: '["old source"]',
    [SCAN_CONFIRM_SESSION_KEYS.lexiconEntries]: '[{"id":"old-entry"}]',
    [SCAN_CONFIRM_SESSION_KEYS.projectName]: 'New Project',
    [SCAN_CONFIRM_SESSION_KEYS.projectIcon]: 'data:image/png;base64,icon',
  });

  prepareScanConfirmForExistingProject(storage, 'project-2');

  assert.equal(storage.getItem(SCAN_CONFIRM_SESSION_KEYS.existingProjectId), 'project-2');
  assert.equal(storage.getItem(SCAN_CONFIRM_SESSION_KEYS.extractedWords), '[{"english":"old"}]');
  assert.equal(storage.getItem(SCAN_CONFIRM_SESSION_KEYS.sourceLabels), null);
  assert.equal(storage.getItem(SCAN_CONFIRM_SESSION_KEYS.lexiconEntries), null);
  assert.equal(storage.getItem(SCAN_CONFIRM_SESSION_KEYS.projectName), null);
  assert.equal(storage.getItem(SCAN_CONFIRM_SESSION_KEYS.projectIcon), null);
  assert.deepEqual(storage.removedKeys, [
    SCAN_CONFIRM_SESSION_KEYS.projectName,
    SCAN_CONFIRM_SESSION_KEYS.projectIcon,
    SCAN_CONFIRM_SESSION_KEYS.sourceLabels,
    SCAN_CONFIRM_SESSION_KEYS.lexiconEntries,
  ]);
});

test('project draft read returns trimmed title and optional icon only when no existing project is set', () => {
  const storage = new MemoryStorage({
    [SCAN_CONFIRM_SESSION_KEYS.projectName]: '  Biology Notes  ',
    [SCAN_CONFIRM_SESSION_KEYS.projectIcon]: 'data:image/png;base64,icon',
  });

  assert.deepEqual(getScanConfirmProjectDraft(storage), {
    title: 'Biology Notes',
    iconDataUrl: 'data:image/png;base64,icon',
  });

  storage.setItem(SCAN_CONFIRM_SESSION_KEYS.existingProjectId, 'project-1');
  assert.equal(hasScanConfirmExistingProject(storage), true);
  assert.equal(getScanConfirmProjectDraft(storage), null);
});

test('project draft write preserves project name and removes icon when omitted', () => {
  const storage = new MemoryStorage({
    [SCAN_CONFIRM_SESSION_KEYS.projectIcon]: 'data:image/png;base64,old-icon',
  });

  saveScanConfirmProjectDraft(storage, {
    projectName: 'World History',
    projectIcon: null,
  });

  assert.equal(storage.getItem(SCAN_CONFIRM_SESSION_KEYS.projectName), 'World History');
  assert.equal(storage.getItem(SCAN_CONFIRM_SESSION_KEYS.projectIcon), null);
  assert.deepEqual(storage.removedKeys, [SCAN_CONFIRM_SESSION_KEYS.projectIcon]);
});

test('clearScanConfirmProjectIcon removes only the project icon key', () => {
  const storage = new MemoryStorage({
    [SCAN_CONFIRM_SESSION_KEYS.projectName]: 'Chemistry',
    [SCAN_CONFIRM_SESSION_KEYS.projectIcon]: 'data:image/png;base64,icon',
  });

  clearScanConfirmProjectIcon(storage);

  assert.deepEqual(storage.entries(), {
    [SCAN_CONFIRM_SESSION_KEYS.projectName]: 'Chemistry',
  });
  assert.deepEqual(storage.removedKeys, [SCAN_CONFIRM_SESSION_KEYS.projectIcon]);
});
