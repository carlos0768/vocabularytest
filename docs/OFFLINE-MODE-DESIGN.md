# オフラインモード設計書

> **実装済みの現状（2026-07）は下記「実装状況: オフラインで単語帳を開く」を参照。**
> この文書の以降のセクションは Phase 1〜4 の当初計画です。

## 実装状況: オフラインで単語帳を開く

オフラインで単語帳が開けるかどうかは、次の 3 レイヤーがすべて揃って初めて成立する。

| レイヤー | 実装 | 備考 |
|---|---|---|
| データ | `HybridWordRepository.fullSync()` が全単語帳・全単語を IndexedDB (Dexie `WordSnapDB`) に複製 | 読み取りは常にローカル。Free / Pro 共通 |
| 認証 | `resolveOfflineFallbackAuth()` (`src/lib/auth/offline-session.ts`) | アクセストークンは約1時間で失効し、オフラインでは更新できない。従来はここでゲスト扱いになり、ローカルにデータがあるのに「単語帳が見つかりません」になっていた。オフライン時のみ保存済みセッションを**身元確認のみ**に使う |
| 画面 | **オフライン・アプリシェル** (`public/sw-offline-shell.js`)。最後の砦として `public/offline.html` + `public/offline-viewer.js` | Service Worker はナビゲーションを network-first で処理し、オフライン時は アプリシェル → そのURLのキャッシュ済みドキュメント → `offline.html` の順で返す |

### オフライン・アプリシェル (`public/sw-offline-shell.js`)

オフラインでは Next.js の画面遷移がすべてフルナビゲーションになる（RSC の取得に失敗すると
MPA 遷移にフォールバックするため）。以前の SW はフルロードされたドキュメントしか持って
いなかったので、ほぼすべてのタップが `offline.html`（見た目の違う簡易ビューア）に落ちていた。

アプリシェルはこれを解消し、**オンライン時と同じ React の画面**をオフラインで開く。

- **補充**: ログイン中・オンラインのとき、`OfflineSyncProvider` が起動15秒後に SW へ
  `warm-offline-shell` を送る。SW は最短6時間おきに、`OFFLINE_SHELL_ROUTES` の各ルートの
  ドキュメントを1枚ずつ取得し、そこから参照される `/_next/static` のチャンクをすべて
  （JS が遅延ロードするチャンクも辿って）`STATIC_CACHE` に入れる。**全チャンクが揃ってから**
  ドキュメントを `SHELL_CACHE` に書くので、チャンク欠けのシェルが配信されることはない
  （過去の「PWA が起動画面で固まる」事故の再発防止）。データセーバー有効時は行わない
- **動的ルート**（`/project/[id]` など）は ID の代わりに番兵文字列
  `merken-offline-shell-param` を入れた URL で1回だけ取得する。これらのページは
  IndexedDB から描画するクライアントページなので、サーバーHTML中に ID が出るのは
  RSC ペイロード（ルートツリー・params）と href だけ。オフライン時は SW が番兵を要求された
  ID に置換して返し、サーバーが `/project/<id>` を描画したのと同じ状態でハイドレートする。
  URL は `location` から読まれるので `useSearchParams()` も正しい。置換するのは
  URL安全な文字だけの ID（UUID / `all` / パーセントエンコードされたバインダー名）に限る
- **対象ルート**を増やすときは、そのページが `'use client'` で、ID によってサーバー側の
  描画内容が変わらないこと（`src/lib/offline/offline-shell.test.ts` が固定している）
- **掃除**: 補充のたびに、キャッシュ済みドキュメント（シェル＋実ナビゲーションで保存した
  ページ）から辿れない `STATIC_CACHE` の項目を、**2回連続で**辿れなかったときだけ消す。
  前のビルドを開いたままのタブが遅延ロードするチャンクを即座に消さないため。フォントは
  CSS の相対URL（`../media/…`）から辿る。フォントは先読みしない（Noto Sans JP だけで
  100超の unicode-range ファイルがある）。実際に使われたものが実行時にキャッシュされる
- オンライン時のナビゲーションは一切変えていない（network-first のまま）

### オフライン単語帳ビューア (`public/offline-viewer.js`)

> アプリシェルが入ってからは、シェルがまだ一度も補充されていない端末（初回起動直後・
> 未ログイン）と、シェル対象外のルートでだけ表示される最後の砦。

`offline.html` は要求された URL のまま表示されるため、`location.pathname` から
「ユーザーがどの単語帳を開こうとしたか」が分かる。ビューアはそれを見て IndexedDB を
直接読み、単語帳を描画する。

- `/project/<id>` (`/words`, `/insights` も同じ) → 単語リスト + フラッシュカード
- `/flashcard/<id>` / `/quiz/<id>` → その単語帳のフラッシュカードを直接開く
  (`/quiz/all` など単語帳横断のIDは対象外)
- `/`, `/projects`, `/binder/<name>` → 保存済み単語帳の一覧
- それ以外 → 従来のオフライン通知のまま（データがあれば一覧への導線を追加）

制約（意図的なもの）:

1. **依存ゼロの単一ファイル**。ハッシュ付きチャンクを必要とする Next.js ドキュメントを
   フォールバックにすると、チャンク未キャッシュ時に PWA が起動不能になる（過去に発生）。
   プレーンな HTML/JS なのでその事故は起こり得ない。
2. **読み取り専用**。学習結果 (SM-2) は書き戻さない。Sync Queue と競合させない。
3. **プログレッシブエンハンスメント**。`offline-viewer.js` がキャッシュに無ければ
   `offline.html` は従来の静的な通知として動作する。

Service Worker 側は `PRECACHE_URLS` で `offline.html` と `offline-viewer.js` の両方を
install / activate 時にプリキャッシュする。

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
