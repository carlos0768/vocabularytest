# ScanVocab 機能一覧 (完全版)

## 📱 ページ構成

### 認証系
| ページ | パス | 説明 |
|--------|------|------|
| ログイン | `/login` | メール+パスワード認証 |
| 新規登録 | `/signup` | OTP認証付きサインアップ |
| パスワードリセット | `/reset-password` | OTP認証でリセット |
| 認証コールバック | `/auth/callback` | OAuth コールバック |
| 認証確認 | `/auth/confirm` | メール確認 |

### メイン機能
| ページ | パス | 説明 |
|--------|------|------|
| ホーム | `/` | プロジェクト一覧 + 選択時に詳細表示 |
| スキャン | `/scan` | カメラ/画像アップロード + モード選択 |
| スキャン確認 | `/scan/confirm` | 抽出結果の編集・保存 |
| 検索 | `/search` | テキスト検索 + 意味検索 (Pro) |
| 統計 | `/stats` | ヒートマップ + 習得率 |
| 設定 | `/settings` | テーマ、アカウント、サポート |

### 学習機能
| ページ | パス | 説明 | アクセス |
|--------|------|------|----------|
| クイズ | `/quiz/[projectId]` | 4択テスト | 全員 |
| 苦手クイズ | `/quiz/[projectId]/favorites` | 苦手単語のみ | Pro |
| フラッシュカード | `/flashcard/[projectId]` | スワイプ復習 | Pro |
| 例文クイズ | `/sentence-quiz/[projectId]` | 穴埋め・並び替え | Pro |

### サブスクリプション
| ページ | パス | 説明 |
|--------|------|------|
| プラン選択 | `/subscription` | Free vs Pro 比較 |
| 購入成功 | `/subscription/success` | 決済完了画面 |
| 解約 | `/subscription/cancel` | 解約確認 |

### その他
| ページ | パス | 説明 |
|--------|------|------|
| 苦手一覧 | `/favorites` | 全プロジェクトの苦手単語 |
| 共有閲覧 | `/share/[shareId]` | 共有リンクから閲覧 |
| お問い合わせ | `/contact` | サポートメール |
| 利用規約 | `/terms` | 規約ページ |
| プライバシー | `/privacy` | ポリシーページ |

---

## 🔧 機能詳細

### 1. スキャン機能
**目的**: 写真から英単語を自動抽出

**フロー**:
1. カメラ撮影 or 画像アップロード
2. スキャンモード選択
3. AI 抽出処理 (プログレス表示)
4. 結果確認・編集画面
5. プロジェクト保存

**スキャンモード**:
| モード | 説明 | AI | Pro |
|--------|------|-----|-----|
| `all` | 全単語抽出 | OpenAI/Gemini | ❌ |
| `circled` | 丸で囲った単語 | Gemini | ✅ |
| `highlighted` | マーカー部分 | Gemini 2.5 Flash | ✅ |
| `eiken` | 英検レベルフィルタ | Gemini→GPT | ✅ |
| `idiom` | イディオム抽出 | OpenAI/Gemini | ✅ |
| `wrong` | 間違えた単語のみ | Gemini→GPT | ✅ |

**制限**:
- Free: 3回/日 (サーバーサイドでアトミックにカウント)
- Pro: 無制限

### 2. 確認・編集画面 (`/scan/confirm`)
**機能**:
- 抽出された単語の一覧表示
- 各単語の選択/非選択トグル
- 単語の編集 (英語・日本語)
- 単語の削除
- 手動追加ボタン
- プロジェクト名入力 (新規時)
- 既存プロジェクトへの追加対応

**制限警告**:
- Free ユーザーが 100 語制限に近づくと警告バナー
- 超過時は保存不可 + Pro 誘導

### 3. ホーム画面 (`/`)
**レイアウト**:
- ヘッダー: ロゴ + スキャンボタン
- プロジェクト一覧 (カード形式)
- 選択時: プロジェクト詳細展開

**プロジェクトカード情報**:
- タイトル
- 単語数
- 作成日
- お気に入りバッジ

**プロジェクト詳細 (選択時)**:
- 単語一覧 (折りたたみ)
- 学習モード選択カード
  - クイズ開始
  - フラッシュカード (Pro)
  - 例文クイズ (Pro)
- インラインフラッシュカード
- 苦手単語へのリンク
- 共有リンク生成 (Pro)

**モーダル類**:
- プロジェクト選択シート
- スキャンモード選択
- 処理中モーダル

### 4. クイズ機能 (`/quiz/[projectId]`)
**フロー**:
1. 問題数選択画面 (入力 or プリセット)
2. クイズ開始
3. 英単語表示 + 4択 (日本語訳)
4. 回答判定
   - 正解: 緑表示 → 自動で次へ
   - 不正解: 赤表示 → 「次へ」ボタン待ち
5. 完了画面 (スコア + 評価メッセージ)

**UI要素**:
- 進捗バー (上部)
- 問題番号 (X / Y)
- 苦手マークボタン (Flag)
- 例文表示 (回答後、Pro)

### 5. 苦手クイズ (`/quiz/[projectId]/favorites`)
- 苦手マークされた単語のみ
- オレンジ色テーマ
- Pro 限定

### 6. フラッシュカード (`/flashcard/[projectId]`)
**機能**:
- スワイプ操作 (左: わからない、右: わかった)
- カードフリップ (タップで裏面)
- 進捗表示
- Pro 限定

### 7. 例文クイズ (`/sentence-quiz/[projectId]`)
**問題タイプ**:
1. **穴埋め (fill-in-blank)**: 3箇所空欄、4択
2. **複数穴埋め (multi-fill-in-blank)**: VectorDB統合、関連単語も空欄化
3. **並び替え (word-order)**: 単語を正しい順序に並べる

**UI**:
- Duolingo 風のインタラクション
- 日本語訳ヒント表示
- Pro 限定

### 8. 検索機能 (`/search`)
**モード**:
1. **テキスト検索**: 英語/日本語の部分一致
2. **意味検索 (Pro)**: Embeddings + pgvector で類似度検索

**結果表示**:
- 単語カード
- 類似度パーセント (意味検索時)
- プロジェクトへのリンク

### 9. 統計画面 (`/stats`)
**表示内容**:
- **アクティビティヒートマップ**: 4週間分、GitHub草風
  - 色の濃さ = クイズ回答数
  - 日曜始まり
- **今日の学習**: 回答数、正答率
- **単語統計**:
  - 習得率プログレスバー
  - 習得済み/復習中/未学習の内訳
- **概要カード**: プロジェクト数、総単語数、苦手単語数、間違えた単語数

### 10. 設定画面 (`/settings`)
**セクション**:
- **テーマ**: ライト/ダーク/システム
- **アカウント**: ログイン状態、メールアドレス
- **プラン**: Free/Pro 表示、Pro バッジ
- **サポート**: お問い合わせ、利用規約、プライバシーポリシー
- **解約** (Pro のみ): 確認モーダル付き

### 11. サブスクリプション (`/subscription`)
**表示内容**:
- Free vs Pro 比較表
- Pro 機能一覧
- 価格: ¥500/月
- KOMOJU 決済ボタン

**Pro 機能**:
- スキャン無制限
- 単語数無制限
- クラウド同期
- マルチデバイス
- フラッシュカード
- 例文クイズ
- 意味検索
- 高度なスキャンモード
- 共有リンク

### 12. 共有機能 (`/share/[shareId]`)
**機能**:
- 共有リンクからプロジェクト閲覧
- 単語一覧 (読み取り専用)
- 「自分の単語帳に追加」ボタン
- Pro 限定

### 13. 苦手一覧 (`/favorites`)
**機能**:
- 全プロジェクトの苦手単語を一覧表示
- 各単語にプロジェクト名リンク
- 苦手解除ボタン

---

## 🧩 コンポーネント

### UI コンポーネント
- `Button`: プライマリ/セカンダリ/テキスト
- `Card`: カード容器
- `Modal`: モーダルダイアログ
- `BottomNav`: 4タブナビゲーション (ホーム/検索/統計/設定)
- `Toast`: 通知メッセージ
- `OtpInput`: 6桁認証コード入力
- `ProgressSteps`: ステップ進捗表示
- `DeleteConfirmModal`: 削除確認

### ホーム系
- `ProjectCard`: プロジェクトカード
- `ScanButton`: スキャン開始ボタン
- `WordList`: 単語一覧 (折りたたみ式、検索付き)
- `StudyModeCard`: 学習モード選択カード
- `InlineFlashcard`: ホーム内フラッシュカード
- `ProcessingModal`: AI処理中モーダル
- `ProjectModals`: プロジェクト関連モーダル群
- `ProjectSelectionSheet`: プロジェクト選択シート
- `ScanModeModal`: スキャンモード選択

### クイズ系
- `QuizOption`: 4択選択肢

### 例文クイズ系
- `FillInBlankQuestion`: 穴埋め問題
- `MultiFillInBlankQuestion`: 複数穴埋め問題
- `WordOrderQuestion`: 並び替え問題
- `QuizProgress`: 進捗表示
- `QuizResult`: 結果画面
- `LoadingScreen`: ローディング

### 制限系
- `ScanLimitModal`: スキャン制限モーダル
- `WordLimitBanner`: 単語制限警告バナー
- `WordLimitModal`: 単語制限モーダル

---

## 🔌 API エンドポイント

### 認証
- `POST /api/auth/send-otp`: OTP送信
- `POST /api/auth/verify-otp`: OTP検証
- `POST /api/auth/signup-verify`: サインアップ完了
- `POST /api/auth/reset-password`: パスワードリセット

### AI処理
- `POST /api/extract`: 画像から単語抽出
- `POST /api/generate-examples`: 例文生成
- `POST /api/generate-quiz-distractors`: 誤答選択肢生成
- `POST /api/regenerate-distractors`: 誤答再生成
- `POST /api/sentence-quiz`: 例文クイズ生成

### 検索
- `POST /api/search/semantic`: 意味検索
- `POST /api/embeddings/sync`: Embeddings同期

### 決済
- `POST /api/subscription/create`: サブスク作成
- `POST /api/subscription/cancel`: サブスク解約
- `POST /api/subscription/webhook`: KOMOJU Webhook

---

## 📊 データモデル

### Word
```typescript
{
  id: string;
  projectId: string;
  english: string;
  japanese: string;
  distractors: string[]; // 3つの誤答
  exampleSentence?: string;
  exampleSentenceJa?: string;
  status: 'new' | 'review' | 'mastered';
  isFavorite: boolean;
  // SM-2 アルゴリズム
  easeFactor: number;
  intervalDays: number;
  repetition: number;
  lastReviewedAt?: string;
  nextReviewAt?: string;
}
```

### Project
```typescript
{
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  isSynced?: boolean;
  shareId?: string;
  isFavorite?: boolean;
}
```

---

## 🎨 デザインシステム

### カラー変数
- `--color-primary`: メインカラー
- `--color-peach`: アクセント (ピーチ)
- `--color-peach-light`: 薄いピーチ
- `--color-foreground`: テキスト
- `--color-muted`: サブテキスト
- `--color-background`: 背景
- `--color-surface`: カード背景
- `--color-border`: ボーダー
- `--color-error`: エラー
- `--color-success`: 成功

### テーマ
- ライト
- ダーク
- システム (自動切替)

---

*生成日: 2026-02-01*
*ステータス: 全ページ・コンポーネント網羅完了*
