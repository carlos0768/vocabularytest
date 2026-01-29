# スキャンジョブ ポーリングロジック解説

## 概要

PWAでバックグラウンドに移動しても、スキャン処理が正常に継続・復帰するための適応型ポーリングシステム。

## 主要な変数

```typescript
// ポーリングタイマーのref
const pollingRef = useRef<NodeJS.Timeout | null>(null);

// 適応型ポーリング間隔（500ms → 2000msまで増加）
const pollingIntervalRef = useRef<number>(500);

// ポーリングがアクティブかどうかのフラグ
const isPollingActiveRef = useRef<boolean>(false);

// 現在処理中のジョブID
const [currentJobId, setCurrentJobId] = useState<string | null>(null);
```

## 1. ポーリング開始（startPolling）

```typescript
const startPolling = useCallback((jobId: string) => {
  // 初期間隔を500msにリセット
  pollingIntervalRef.current = 500;

  // ポーリングをアクティブに設定
  isPollingActiveRef.current = true;

  // バックグラウンド処理を開始（fire-and-forget）
  fetch(`/api/scan-jobs/${jobId}/process`, { method: 'POST' })
    .catch(err => console.error('Failed to start processing:', err));

  // 適応型ポーリングを開始
  pollingRef.current = setTimeout(() => pollJobStatus(jobId), 500);
}, [pollJobStatus]);
```

**ポイント**:
- `setInterval`ではなく`setTimeout`を使用
- 処理開始リクエストは「fire-and-forget」（結果を待たない）
- 初回は500msで開始

## 2. ジョブステータス確認（pollJobStatus）

```typescript
const pollJobStatus = useCallback(async (jobId: string) => {
  // ポーリングが停止されていたら何もしない
  if (!isPollingActiveRef.current) return;

  try {
    const response = await fetch(`/api/scan-jobs/${jobId}`);

    // フェッチ後にもう一度チェック（フェッチ中に停止された可能性）
    if (!isPollingActiveRef.current) return;

    const data = await response.json();

    if (!data.success) {
      stopPolling();
      setProcessing(false);
      // 404 = 既に処理済み
      if (response.status === 404) {
        console.log('Job not found (already processed)');
        return;
      }
      showToast({ message: data.error, type: 'error' });
      return;
    }

    const job = data.job as ScanJob;

    if (job.status === 'completed') {
      // 完了 → 結果を処理
      stopPolling();
      handleCompletedJob(job);

    } else if (job.status === 'failed') {
      // 失敗 → エラー表示
      stopPolling();
      setProcessing(false);
      // エラーステップを表示

    } else if (isPollingActiveRef.current) {
      // まだ処理中 → 適応型間隔で次のポーリングをスケジュール
      // 500ms → 1000ms → 1500ms → 2000ms（最大）
      pollingIntervalRef.current = Math.min(pollingIntervalRef.current + 500, 2000);
      pollingRef.current = setTimeout(
        () => pollJobStatus(jobId),
        pollingIntervalRef.current
      );
    }
  } catch (error) {
    if (!isPollingActiveRef.current) return;
    console.error('Polling error:', error);
    // エラー時は2秒後にリトライ
    pollingRef.current = setTimeout(() => pollJobStatus(jobId), 2000);
  }
}, [stopPolling, handleCompletedJob, showToast]);
```

**ポイント**:
- フェッチ前後で`isPollingActiveRef`をチェック
- 適応型間隔: 最初は速く、徐々に遅く（サーバー負荷軽減）
- エラー時もリトライ（ネットワーク一時切断対応）

## 3. ポーリング停止（stopPolling）

```typescript
const stopPolling = useCallback(() => {
  // フラグをfalseに設定（これが最重要）
  isPollingActiveRef.current = false;

  // タイマーをクリア
  if (pollingRef.current) {
    clearTimeout(pollingRef.current);
    pollingRef.current = null;
  }

  // ジョブIDをクリア
  setCurrentJobId(null);
}, []);
```

**ポイント**:
- `isPollingActiveRef = false`を最初に設定
- これにより進行中のフェッチが完了しても、次のポーリングがスケジュールされない

## 4. PWAバックグラウンド復帰対応

```typescript
// アプリ起動時に保留中のジョブをチェック
useEffect(() => {
  if (authLoading || !isAuthenticated) return;
  checkPendingJobs();

  return () => {
    isPollingActiveRef.current = false;
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
    }
  };
}, [authLoading, isAuthenticated, checkPendingJobs]);

// visibilitychangeイベントでバックグラウンド復帰を検知
useEffect(() => {
  if (!isAuthenticated) return;

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      // アプリがフォアグラウンドに戻った
      // 保留中/完了済みのジョブをチェック
      checkPendingJobs();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}, [isAuthenticated, checkPendingJobs]);
```

**ポイント**:
- `visibilitychange`でPWAのバックグラウンド復帰を検知
- 復帰時に`checkPendingJobs()`で未処理のジョブを確認
- 完了済みならすぐに結果を表示、処理中ならポーリング再開

## 5. 保留中ジョブの確認（checkPendingJobs）

```typescript
const checkPendingJobs = useCallback(async (): Promise<boolean> => {
  if (!isAuthenticated) return false;

  try {
    const response = await fetch('/api/scan-jobs');
    const data = await response.json();

    if (data.success && data.jobs?.length > 0) {
      // 完了済みジョブを優先
      const completedJob = data.jobs.find((j: ScanJob) => j.status === 'completed');
      if (completedJob) {
        handleCompletedJob(completedJob);
        return true;
      }

      // 処理中/保留中のジョブ
      const pendingJob = data.jobs.find(
        (j: ScanJob) => j.status === 'pending' || j.status === 'processing'
      );
      if (pendingJob) {
        setCurrentJobId(pendingJob.id);
        setProcessing(true);
        setProcessingSteps([...]);
        startPolling(pendingJob.id);
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('Failed to check pending jobs:', error);
    return false;
  }
}, [isAuthenticated, handleCompletedJob, startPolling]);
```

## フロー図

```
[スキャン開始]
     │
     ▼
[ジョブ作成API] ─→ [startPolling(jobId)]
     │                    │
     │                    ▼
     │            [isPollingActiveRef = true]
     │                    │
     │                    ▼
     │            [setTimeout(pollJobStatus, 500ms)]
     │                    │
     ▼                    │
[バックグラウンド処理開始] │
                          │
                          ▼
                   [pollJobStatus]
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   [completed]      [processing]       [failed]
        │                 │                 │
        ▼                 ▼                 ▼
 [handleCompletedJob] [setTimeout    [stopPolling]
        │              (次の間隔)]    [エラー表示]
        ▼                 │
 [結果画面へ遷移]          │
                          ▼
                   [間隔を増加]
                   500→1000→1500→2000ms
                          │
                          ▼
                   [pollJobStatus] (ループ)
```

## なぜsetIntervalではなくsetTimeoutを使うのか

1. **制御可能性**: 各ポーリング後に次のタイミングを動的に決定できる
2. **適応型間隔**: 処理が長引くにつれて間隔を延ばせる
3. **クリーンな停止**: `isPollingActiveRef`チェックで確実に停止
4. **エラー回復**: エラー時に異なる間隔でリトライ可能

## isPollingActiveRefが重要な理由

```typescript
// 問題のあるコード（refなし）
const pollJobStatus = async (jobId: string) => {
  const response = await fetch(...); // ← この間にstopPollingが呼ばれる可能性
  // ↓ stopPollingが呼ばれた後でも実行される
  setTimeout(() => pollJobStatus(jobId), interval);
};

// 解決策（refあり）
const pollJobStatus = async (jobId: string) => {
  if (!isPollingActiveRef.current) return; // ← 開始前チェック
  const response = await fetch(...);
  if (!isPollingActiveRef.current) return; // ← フェッチ後チェック
  setTimeout(() => pollJobStatus(jobId), interval);
};
```

## ネットワークエラー対応

```typescript
} catch (error) {
  if (!isPollingActiveRef.current) return;

  // ネットワークエラー（PWAバックグラウンド移動など）
  const isNetworkError = error instanceof Error && (
    error.message.includes('Load failed') ||
    error.message.includes('Failed to fetch') ||
    error.message.includes('network')
  );

  if (isNetworkError) {
    // ジョブは継続している可能性があるので、復帰時にチェック
    const foundJob = await checkPendingJobs();
    if (foundJob) return; // ジョブが見つかった場合は正常に処理継続
  }

  // その他のエラーは2秒後にリトライ
  pollingRef.current = setTimeout(() => pollJobStatus(jobId), 2000);
}
```
