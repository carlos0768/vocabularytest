# 新規ユーザ オンボーディング UX 改善プラン

| 項目 | 値 |
|---|---|
| ステータス | プラン段階・実装未着手 |
| 対象ブランチ | `claude/improve-onboarding-ux-mfDfy` |
| 初版作成日 | 2026-05-06 |
| 関連ドキュメント | `docs/architecture.md`, `docs/boundaries.md`, `docs/invariants.md` |

---

## 1. 背景と目的

### 1.1 問題
- 最新の調査で、新規アカウント登録直後のユーザがホームに着地後、何をすればいいか分からないためアクション低下が起きている。
- 現状のホーム空状態は「単語帳はまだありません」というテキストと「新規スキャン」CTA のみで、「なぜ撮るのか」「どう撮ればいいのか」「撮ったあと何が起きるのか」が不可視。
- `is_new_user` のような初回フラグが DB / localStorage いずれにも存在せず、初回限定UIを制御する土台が無い。

### 1.2 目的
- 登録直後の新規ユーザに対して、最初の成功体験（=最初の単語帳作成と最初のクイズ完走）までを明確にガイドする。
- 登録 → 初回スキャン → 初回クイズ完了 のファネルを可視化・改善する。

### 1.3 対象ユーザ
- 「新規登録ユーザ」のみを対象とする。
- 既存ユーザは `onboarding_step='completed'` で初期化され、UX に変化を与えない。

---

## 2. スコープ

### 2.1 含むもの
- DB スキーマ拡張：`profiles.onboarding_step` カラム追加、`projects.is_sample` カラム追加
- `handle_new_user()` トリガ拡張：新規ユーザに `onboarding_step='signed_up'` を設定し、サンプル単語帳を投入
- WelcomeOverlay コンポーネント（ホーム上に乗る初回限定オーバーレイ）
- ステップ遷移ロジック（`/scan/confirm` 保存時、クイズ完了時）
- 各画面の文脈ヒント（step に応じた小さな誘導バナー）
- 1回目クイズ完了時の PWA インストール促し
- 計測イベント発火
- ホーム空状態（=onboarding 完了後にプロジェクトが0件のユーザ）の3ステップガイド化

### 2.2 含まないもの (Out of Scope)
- 名前入力（後続のオンボーディング機能で実装予定）
- カメラ権限の pre-prompt パターン（現在の `/scan` 自然遷移を維持）
- Pro 導線の文脈化（別フィーチャーとして後追い）
- 既存ユーザの巻き込み（プロジェクト0件の既存ユーザを初回扱いする等）
- スポットライトツアー（react-joyride 等の依存追加）
- 多言語対応（現状 Japanese のみで継続）

---

## 3. 確定した設計判断

| 項目 | 決定 |
|---|---|
| 着地点 | ホームに着地、初回のみ Welcome オーバーレイを上に乗せる |
| スキップ | Welcome の右上 × でスキップ可能。`onboarding_step='skipped'` に遷移 |
| スキップ後の文脈ヒント | 出さない（×を押した人＝説明不要の意思表示と解釈） |
| サンプル単語帳：投入タイミング | `handle_new_user()` トリガ実行時 |
| サンプル単語帳：内容生成 | マイグレーション SQL にベタ書き（API 課金ゼロ・固定） |
| サンプル単語帳：扱い | 編集可・削除可・再生成なし・100語上限から除外・「サンプル」バッジ永続 |
| サンプル単語帳：内容（語数/テーマ） | 画面実装後に決定（保留） |
| ステップ遷移：`signed_up → first_scan_done` | `/scan/confirm` の保存ボタン押下時 |
| ステップ遷移：`first_scan_done → completed` | 任意のクイズ完了時 |
| ステップ遷移：サンプルクイズ経由 | サンプルクイズ完走で `signed_up → completed` 直接遷移 |
| カメラ権限要求 | 現状通り `/scan` 着地時の自然なタイミング（pre-prompt 無し） |
| PWA インストール促し | 1回目クイズ完了直後にモーダル + ホーム空状態に常設バナー（B+C 併用） |
| Pro 導線の文脈化 | スコープ外（後続） |
| 計測 | 入れる。基盤調査結果に応じて手段決定 |
| Welcome 見出し | 「ようこそ。3ステップではじめよう。」 |
| サンプル訴求文 | 入れない |
| 3ステップカード | 縦並び |
| ユーザ名表示 | 今回は出さない（別オンボーディング機能で対応予定） |
| Welcome の主CTA | 「最初の1枚を撮影 →」（黒地ボタン） |
| Welcome の副CTA | 「サンプルでクイズを試す ▸」（テキストリンク） |

---

## 4. データモデル

### 4.1 `profiles.onboarding_step`

新規列を追加。

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_step TEXT NOT NULL DEFAULT 'completed'
  CHECK (onboarding_step IN ('signed_up', 'first_scan_done', 'completed', 'skipped'));
```

- DEFAULT 'completed' により既存ユーザは初期状態から「完了済み」扱い → UX 影響ゼロ。
- 新規ユーザは `handle_new_user()` 内で 'signed_up' に上書きする。

### 4.2 `projects.is_sample`

サンプル単語帳識別用のフラグ。

```sql
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS is_sample BOOLEAN NOT NULL DEFAULT FALSE;
```

- 100語上限カウント時、`is_sample=TRUE` に紐付く単語を除外。
- UI 側で `is_sample=TRUE` の場合は「サンプル」バッジを永続表示。

### 4.3 状態遷移図

```
signed_up
  ├─ Welcomeの × 押下          ──→ skipped
  ├─ /scan/confirm 保存ボタン  ──→ first_scan_done
  └─ サンプルクイズ完走        ──→ completed (直接遷移)

first_scan_done
  └─ 任意のクイズ完走          ──→ completed
```

---

## 5. ユーザフロー

### 5.1 通常フロー（撮影ルート）

1. OTP 検証完了 → リダイレクト先 `/`
2. `handle_new_user()` トリガ実行
   - `subscriptions` 行作成（既存）
   - `profiles` 行作成、`onboarding_step='signed_up'` 設定（追加）
   - サンプル単語帳プロジェクト + 単語投入（追加）
   - 既存の auto-pro キャンペーンロジック（最初66人に test Pro 付与）は維持
3. ホーム描画。MY BOOKS にサンプル単語帳が「サンプル」バッジ付きで1件表示。
4. プロファイル読み込み完了後、`onboarding_step='signed_up'` を検知して WelcomeOverlay 表示。
5. ユーザが主CTA「最初の1枚を撮影」をタップ → `/scan` へ遷移。
6. 撮影 → AI 抽出 → `/scan/confirm` で内容確認。
7. 保存ボタン押下 → 単語帳作成 + `onboarding_step='first_scan_done'` 更新 + 計測イベント `onboarding_first_scan` 発火。
8. ホームに戻る → MY BOOKS 上に「次はクイズで覚えよう →」バナー表示。
9. クイズで1回目完走 → `onboarding_step='completed'` 更新 + 計測イベント `onboarding_completed` 発火。
10. PWA インストール促しモーダル表示（既にスタンドアロン起動中なら表示しない）。

### 5.2 サンプルクイズルート

1〜4 まで通常フローと同じ。
5. ユーザが副CTA「サンプルでクイズを試す」をタップ → `/quiz/{sampleProjectId}` へ遷移。
6. サンプル単語帳のクイズ完走 → `onboarding_step='completed'` 更新 + 計測イベント発火。
7. PWA インストール促しモーダル表示。
8. ホームの空状態に「自分の単語帳を作ってみよう →」3ステップガイドで撮影誘導。

### 5.3 スキップルート

1〜4 まで通常フローと同じ。
5. ユーザが × をタップ → `onboarding_step='skipped'` 更新 + 計測イベント `onboarding_skipped` 発火。
6. オーバーレイ消滅。文脈ヒント・PWA促しは出ない。サンプル単語帳は残る。

---

## 6. WelcomeOverlay コンポーネント仕様

### 6.1 配置
- 新規ファイル：`src/components/onboarding/WelcomeOverlay.tsx`
- 親：`src/app/page.tsx` のルートに配置（既存の `ScanCaptureModal` と同列）

### 6.2 表示条件
- `useAuth()` のロード完了
- `useProfile()` のロード完了
- `profile.onboarding_step === 'signed_up'`

上記すべてを満たすまでオーバーレイは描画しない（フラッシュ防止）。

### 6.3 構造（モバイル幅基準・1画面完結）

```
[Backdrop: rgba(26,26,26,0.55)]
  [Modal: 中央配置 / max-w-[420px] / rounded-[24px] / 影 4.5px]
    [Header]
      [×ボタン: 右上]
    [Body]
      [Logo: MERKEN .]
      [見出し: 「ようこそ。」]
      [サブ見出し: 「3 ステップではじめよう。」]
      [3ステップカード縦並び]
        ┌ 撮る   / photo_camera / ノートや本を撮影     ┐
        ├ 確認   / edit_note    / AIが単語と訳を抽出   ┤
        └ 覚える / psychology   / クイズで記憶に定着   ┘
      [主CTA: 黒地ボタン「最初の1枚を撮影 →」]
      [副CTA: テキストリンク「サンプルでクイズを試す ▸」]
```

### 6.4 動作仕様
- **背景クリック**：何もしない（誤操作防止）
- **ESCキー**：何もしない
- **× 押下**：`profiles.onboarding_step` を `'skipped'` に更新 → オーバーレイ消滅
- **主CTA**：`/scan` へ `next/navigation` の `router.push()`（DB更新は撮影保存時）
- **副CTA**：`/quiz/{sampleProjectId}` へ遷移（sampleProjectId はホーム読み込み時に判定）
- **body スクロールロック**：表示中は `overflow: hidden`
- **z-index**：底部ナビ・トーストより上（既存値を確認の上で必要なら +10）
- **SSR**：サーバではレンダリングしない（`'use client'`）
- **フラッシュ防止**：プロファイル読み込み完了まで何もレンダリングしない

### 6.5 スタイル
- 既存 `SolidPanel` 系（border 1.25px / 影 2.5px / インクカラー）に揃える
- アイコンは `Icon` コンポーネント（Material Symbols）
  - 撮る：`photo_camera`
  - 確認：`edit_note`
  - 覚える：`psychology`
- 主CTA は既存の `solid-link-primary` クラスを流用候補

### 6.6 補助フック
- 新規 `src/hooks/use-onboarding.ts`：
  - `step` の取得（profiles テーブルから）
  - `setStep(next)` の更新（API or RPC 経由）
  - 楽観的更新で UI 即時反映 → サーバ確定で確定

---

## 7. ページ別の文脈ヒント

WelcomeOverlay は1回限りだが、文脈ヒントは step に応じて継続的に出る。

### 7.1 ホーム (`src/app/page.tsx`)

| step | 表示内容 |
|---|---|
| `signed_up` | （オーバーレイで覆われるため特になし） |
| `first_scan_done` | MY BOOKS 直上に「次はクイズで覚えよう →」バナー（CTA → 直近作成プロジェクトのクイズ） |
| `completed` && projects=0 | 3ステップガイド付き空状態（撮る/確認/覚える カード + 撮影CTA） |
| `skipped` | 通常UI（ヒントなし） |

### 7.2 スキャン (`src/app/scan/`)

| step | 表示内容 |
|---|---|
| `signed_up` | 画面上部に細い帯「ノートや本を撮影してみましょう」 |

### 7.3 スキャン確認 (`src/app/scan/confirm/`)

| step | 表示内容 |
|---|---|
| `signed_up` | 「保存ボタンを押して単語帳を作成しましょう」のヒント |

保存成功時に `onboarding_step='first_scan_done'` 更新を行う。

### 7.4 クイズ (`src/app/quiz/`)

| step | 表示内容 |
|---|---|
| `first_scan_done` | 開始画面に「４択から正しい意味を選びましょう」のヒント |

完了時に `onboarding_step='completed'` 更新を行う（サンプルクイズの場合は `signed_up → completed` の直接遷移も同じハンドラで処理）。

---

## 8. PWA インストール促し

### 8.1 既存基盤の調査（実装着手前に実施）
- `src/components/pwa/` 配下を Explore で調査し、既に install prompt の捕捉実装があるか確認。
- 存在する場合：呼び出しタイミングを「1回目クイズ完了後」に追加するだけで良い。
- 存在しない場合：以下の最小実装を追加。

### 8.2 最小実装案
- `beforeinstallprompt` イベントを window レベルで捕捉して保持（dispatched event を `event.preventDefault()` で抑止し、後で `prompt()` を呼ぶ）。
- 1回目クイズ完了時にネイティブプロンプトを `prompt()` で起動。
- 拒否された場合はホーム空状態に常設バナー「アプリとしてインストール」を出す。
- localStorage に "pwa_prompt_last_at" を保存して再表示頻度を制御（最低24h は再表示しない）。

### 8.3 iOS Safari の扱い
- iOS Safari は `beforeinstallprompt` 非対応。
- ユーザエージェント判定でスタンドアロン未起動の場合のみ「ホーム画面に追加」のヘルプ画像を表示。
- 既に `display-mode: standalone` で起動している場合は何も出さない。

---

## 9. 計測

### 9.1 既存基盤の調査（実装着手前に実施）
- 以下を Explore で調査：
  - PostHog / Mixpanel / Vercel Analytics / GA4 の有無
  - `src/lib/analytics/` 等のディレクトリやイベント発火関数の存在
  - `package.json` の関連依存関係

### 9.2 イベント案
| イベント名 | 発火タイミング |
|---|---|
| `onboarding_started` | WelcomeOverlay が初めて表示された |
| `onboarding_skipped` | × ボタン押下 |
| `onboarding_cta_scan_clicked` | 主CTA押下 |
| `onboarding_cta_sample_clicked` | 副CTA押下 |
| `onboarding_first_scan` | 1回目スキャン保存（=`first_scan_done` 遷移） |
| `onboarding_completed` | クイズ完走で `completed` 遷移 |
| `onboarding_pwa_prompted` | PWAインストール促し提示 |
| `onboarding_pwa_installed` | PWAインストール成功 |

### 9.3 既存基盤がない場合の最小実装
- マイグレーション：
  ```sql
  CREATE TABLE public.onboarding_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload JSONB
  );
  ```
- API ルート：`POST /api/onboarding/event` で INSERT。RLS で本人のみ書き込み可。
- フック：`useOnboarding()` から発火。

### 9.4 ファネル分析
- リリース後、SQL で集計：
  - `onboarding_started` → `onboarding_first_scan` の率
  - `onboarding_first_scan` → `onboarding_completed` の率
  - `onboarding_started` → `onboarding_skipped` の率
  - `onboarding_completed` → `onboarding_pwa_installed` の率

---

## 10. サンプル単語帳（保留事項）

画面実装後に確定する。決め切ること：

- **語数**：5 / 10 / 15 のいずれか（推奨：10）
- **テーマ**：中学英語 / EIKEN3級 / ビジネス基礎 / 旅行英会話 等（推奨：中学〜高1混合）
- **各単語のフィールド**：英単語、品詞、和訳、例文、誤答選択肢×3
- **マイグレーションでのシード形式**：
  - `INSERT INTO projects (...) VALUES (...)`
  - `INSERT INTO words (...) VALUES (...)` を10行
  - すべて `is_sample=TRUE` で投入
- **100語上限への除外ロジック**：単語数カウント時の WHERE 句に `AND is_sample=FALSE` を追加（既存カウント箇所の調査が必要）

---

## 11. 実装フェーズ

レビュー負荷を考慮した分割案。すべて単一PRでも可。

### Phase 1: データモデル基盤
- マイグレーション：`profiles.onboarding_step` 追加 + チェック制約
- マイグレーション：`projects.is_sample` 追加
- `handle_new_user()` 拡張：`onboarding_step='signed_up'` 設定 + サンプル単語帳投入
  - 注：`auth.users` を SELECT しないこと（過去の障害を踏襲しない）
- 単語数カウント（100語上限）から `is_sample=TRUE` を除外

### Phase 2: WelcomeOverlay
- `WelcomeOverlay` コンポーネント新規作成
- `useOnboarding` フック新規作成（step 読み書き）
- `src/app/page.tsx` への組み込み
- ×時の `skipped` 遷移
- 主CTA・副CTA ルーティング

### Phase 3: ステップ遷移ロジック
- `/scan/confirm` の保存ボタンに `signed_up → first_scan_done` 更新
- 任意のクイズ完了時に `→ completed` 更新
- サンプルクイズ完走時の `signed_up → completed` 直接遷移

### Phase 4: 文脈ヒント
- 各ページに step 連動の小さなヒントバナー
- ホーム空状態 (completed + projects=0) の3ステップガイド化

### Phase 5: PWA インストール促し
- 既存基盤調査
- 1回目クイズ完了直後のモーダル
- ホーム空状態の常設バナー

### Phase 6: 計測
- 既存基盤調査
- イベント発火
- 必要なら `onboarding_events` テーブル追加

---

## 12. リスクと懸念

### 12.1 信頼境界とトリガ
- `handle_new_user()` は SECURITY DEFINER で auth トリガ実行中に走る。
- 過去の修正履歴（`20260404160000_fix_handle_new_user_auto_pro.sql`）で `auth.users` を SELECT する処理が原因の signup 失敗があった。
- 同じ轍を踏まないよう、サンプル単語帳投入は `INSERT ... VALUES (...)` の単純形のみで実装し、トリガから他テーブルの SELECT を増やさない。

### 12.2 既存ユーザへの影響ゼロを担保
- マイグレーションの `DEFAULT 'completed'` により既存ユーザは初期状態から「完了済み」。
- 文脈ヒントも `step !== 'completed' && step !== 'skipped'` でガード。
- `is_sample` のデフォルト FALSE で既存プロジェクトに影響なし。

### 12.3 サンプル単語帳の重複作成
- ユーザがサンプルを削除した後の再ログインで再生成は行わない。
- `handle_new_user()` のみが投入し、それ以外で作成しない。
- 削除後の状態は「サンプル無し」で確定。

### 12.4 同時複数デバイスでの再表示
- 2デバイス目に来た時、step='signed_up' のままなら再度オーバーレイが出る。
- これは仕様として許容（再表示自体は害がなく、ユーザは × かCTA で対応できる）。

### 12.5 ネットワーク不調時
- サンプル単語帳は DB 投入なので、リモートが取れない初回起動では見えない可能性。
- WelcomeOverlay 自体はプロファイル取得後に出るため、profile が取れない状態では出ない。
- IndexedDB との同期は `HybridWordRepository` の通常ロジックに任せる。

### 12.6 RLS / 単語数カウントのチェック
- `is_sample=TRUE` の単語に対する RLS は通常の所有者ポリシーを継承（特別扱い不要）。
- 100語上限のカウントロジックを変更する箇所すべてに `is_sample=FALSE` の WHERE が漏れなく入っているか確認すること。

---

## 13. 受け入れ基準

実装完了の判定基準：

- [ ] 新規登録したユーザのホームに WelcomeOverlay が表示される
- [ ] × でスキップ後は再表示されない（同デバイス）
- [ ] 主CTA から `/scan` に到達できる
- [ ] 副CTA から `/quiz/{sampleProjectId}` に到達できる
- [ ] サンプル単語帳が「サンプル」バッジ付きでホームと一覧に表示される
- [ ] サンプル単語帳の単語が100語上限のカウントに含まれない
- [ ] `/scan/confirm` の保存ボタン押下で `onboarding_step` が `first_scan_done` に更新される
- [ ] 1回目クイズ完了で `onboarding_step` が `completed` に更新される
- [ ] サンプルクイズ完了で `signed_up` から `completed` に直接遷移する
- [ ] PWA インストール促しが1回目クイズ完了直後に表示される（対応ブラウザ）
- [ ] 既存ユーザのホーム表示・スキャン・クイズ動作に変更がない
- [ ] 計測イベントが各遷移で発火している
- [ ] `npm run lint && npm test && npm run build` が通る

---

## 14. 開いている論点 / 未決定事項

| 項目 | 状態 | 備考 |
|---|---|---|
| サンプル単語帳の語数とテーマ | 保留 | WelcomeOverlay 実装後に確定 |
| サンプル単語帳の具体的な単語リスト | 保留 | 同上 |
| 計測基盤（既存有無） | 保留 | 実装着手直前に Explore で調査 |
| PWA促し基盤（既存有無） | 保留 | 同上 |
| 名前入力 | スコープ外 | 別オンボーディング機能で実装予定 |
| カメラ権限 pre-prompt | スコープ外 | 今回は自然遷移のまま |
| Pro 導線の文脈化 | スコープ外 | 別フィーチャー |

---

## 15. 参考ファイル

- `src/app/page.tsx` — ホーム画面、WelcomeOverlay 組み込み先
- `src/app/api/auth/verify-otp/route.ts` — OTP検証フロー
- `supabase/migrations/20260403180000_create_profiles.sql` — profiles テーブル定義
- `supabase/migrations/20260404160000_fix_handle_new_user_auto_pro.sql` — 現行 handle_new_user 関数
- `src/components/redesign/SolidPage.tsx` — 既存デザイン言語のソース（SolidEmpty / SolidPanel）
- `src/components/ui/Icon.tsx` — Material Symbols 経由のアイコン
- `src/hooks/use-auth.ts`, `src/hooks/use-profile.ts` — 既存認証・プロファイルフック
- `docs/invariants.md` — 信頼境界に関するルール
- `docs/boundaries.md` — 触ってはいけない箇所

---

## 16. 改訂履歴
- 2026-05-06: 初版（プラン段階・実装未着手）
