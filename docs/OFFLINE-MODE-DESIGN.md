# オフラインモード設計書

## 現状アーキテクチャ

```
Free User → LocalRepository → IndexedDB (Dexie)
Pro User  → RemoteRepository → Supabase
```

## 目標

Pro ユーザーがオフラインでも単語・フラッシュカード・クイズを利用可能にする。

## 設計: ハイブリッドリポジトリ

```
Pro User (Online)  → HybridRepository → Local (IndexedDB) + Remote (Supabase)
Pro User (Offline) → HybridRepository → Local (IndexedDB) のみ
```

### 動作原理

1. **読み取り**: 常に Local から（高速）
2. **書き込み**: Local に即座反映 + Sync Queue に追加
3. **同期**: オンライン時に Sync Queue を処理

## 実装フェーズ

### Phase 1: PWA 基盤 (1-2日)

**目的:** アプリをインストール可能に + 静的アセットをキャッシュ

**タスク:**
- [ ] `public/manifest.json` 作成
- [ ] `public/sw.js` Service Worker 作成
- [ ] `next.config.js` に PWA 設定追加
- [ ] `_app.tsx` で Service Worker 登録
- [ ] オフライン時のフォールバック UI

**ファイル:**
```
public/
  manifest.json
  sw.js
  icons/
    icon-192x192.png
    icon-512x512.png
src/
  app/
    layout.tsx  (manifest link追加)
  lib/
    pwa/
      register-sw.ts
```

### Phase 2: データ同期基盤 (2-3日)

**目的:** Pro ユーザーのデータを IndexedDB にキャッシュ

**タスク:**
- [ ] `SyncQueue` テーブルを Dexie に追加
- [ ] `HybridRepository` 実装
- [ ] ログイン時のフルデータダウンロード
- [ ] オフライン検出 (`navigator.onLine` + fetch エラー)
- [ ] バックグラウンド同期 (Sync Queue 処理)

**新規ファイル:**
```
src/lib/db/
  hybrid-repository.ts  # 新規
  sync-queue.ts         # 新規
src/hooks/
  use-online-status.ts  # 新規
```

**Dexie スキーマ拡張:**
```typescript
// sync_queue テーブル
interface SyncQueueItem {
  id: string;
  operation: 'create' | 'update' | 'delete';
  table: 'projects' | 'words';
  data: unknown;
  createdAt: string;
  retryCount: number;
}
```

### Phase 3: 自動同期 (1-2日)

**目的:** シームレスなオンライン/オフライン切り替え

**タスク:**
- [ ] アプリ起動時の差分同期
- [ ] 定期的なバックグラウンド同期 (5分間隔)
- [ ] オンライン復帰時の即座同期
- [ ] 同期状態インジケーター UI

### Phase 4: コンフリクト解決 (オプション)

**目的:** 複数デバイス使用時の競合対応

**方針:** Last-Write-Wins (updatedAt ベース)

**タスク:**
- [ ] `updatedAt` フィールド追加
- [ ] コンフリクト検出ロジック
- [ ] コンフリクト解決 UI (必要なら)

---

## 技術詳細

### HybridRepository 実装

```typescript
class HybridRepository implements WordRepository {
  private local: LocalWordRepository;
  private remote: RemoteWordRepository;
  private syncQueue: SyncQueue;
  
  async createProject(project: Omit<Project, 'id' | 'createdAt'>): Promise<Project> {
    // 1. Local に即座保存
    const created = await this.local.createProject(project);
    
    // 2. Sync Queue に追加
    await this.syncQueue.add({
      operation: 'create',
      table: 'projects',
      data: created,
    });
    
    // 3. オンラインなら即座同期試行
    if (navigator.onLine) {
      this.processSyncQueue();
    }
    
    return created;
  }
  
  async getProjects(userId: string): Promise<Project[]> {
    // 常に Local から読み取り（高速）
    return this.local.getProjects(userId);
  }
}
```

### 初回同期フロー

```
1. ログイン成功
2. Supabase から全 projects/words 取得
3. IndexedDB に bulk insert
4. 完了フラグ保存 (localStorage: lastSyncAt)
```

### オフライン検出

```typescript
function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  return isOnline;
}
```

---

## 容量制限

- IndexedDB: 通常 50-100MB+ (ブラウザによる)
- 見積もり: 1単語 ≈ 500 bytes → 10,000単語 ≈ 5MB
- 十分な余裕あり

---

## 次のステップ

1. Phase 1 から順に実装
2. 各フェーズ完了後にテスト & デプロイ
3. ユーザーフィードバック収集
