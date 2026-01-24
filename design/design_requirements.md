# 英単語クイズアプリ デザイン要件定義書

## 1. プロジェクト概要

### 1.1 アプリ概要
- **アプリ名**: 未定（現仮称: ScanVocab）
- **目的**: 英単語学習のためのクイズアプリ
- **ターゲット**: 学生（中学生〜大学生）
- **プラットフォーム**: Webアプリ（レスポンシブ対応）

### 1.2 デザインコンセプト
- **キーワード**: 落ち着き、集中、洗練、ミニマル
- **参考**: Medium、Bear（読書・学習アプリ系）
- **避けるべき要素**: 絵文字、イラスト、過度な装飾、AI感のあるデフォルトUI

---

## 2. デザイントークン（Design Tokens）

### 2.1 カラーパレット

```css
:root {
  /* ========== ベースカラー ========== */
  --color-bg-primary: #fafaf9;        /* 背景：オフホワイト */
  --color-bg-secondary: #f5f5f4;      /* 背景（セカンダリ）：薄いグレー */
  --color-bg-card: #ffffff;           /* カード背景：ホワイト */
  
  /* ========== テキストカラー ========== */
  --color-text-primary: #1c1917;      /* テキスト（主）：ウォームブラック */
  --color-text-secondary: #78716c;    /* テキスト（副）：ウォームグレー */
  --color-text-tertiary: #a8a29e;     /* テキスト（補足）：ライトグレー */
  --color-text-inverse: #ffffff;      /* テキスト（反転）：ホワイト */
  
  /* ========== ボーダー・区切り線 ========== */
  --color-border-default: #e7e5e4;    /* ボーダー（通常） */
  --color-border-light: #f5f5f4;      /* ボーダー（薄い） */
  --color-border-focus: #d6d3d1;      /* ボーダー（フォーカス時） */
  
  /* ========== アクセントカラー ========== */
  --color-accent-primary: #f59e0b;    /* アクセント（琥珀）：主要ボタン等 */
  --color-accent-hover: #d97706;      /* アクセント（ホバー時） */
  --color-accent-light: #fef3c7;      /* アクセント（薄い）：背景強調 */
  --color-accent-subtle: #fffbeb;     /* アクセント（極薄）：ホバー背景 */
  
  /* ========== セマンティックカラー ========== */
  --color-success: #16a34a;           /* 正解・成功：グリーン */
  --color-success-light: #dcfce7;     /* 正解背景 */
  --color-error: #dc2626;             /* 不正解・エラー：レッド */
  --color-error-light: #fee2e2;       /* 不正解背景 */
  --color-warning: #f59e0b;           /* 警告：アンバー */
  --color-info: #0ea5e9;              /* 情報：スカイブルー */
  
  /* ========== 学習ステータスカラー ========== */
  --color-status-new: #3b82f6;        /* 新規：ブルー */
  --color-status-new-light: #dbeafe;
  --color-status-learning: #f59e0b;   /* 復習中：アンバー */
  --color-status-learning-light: #fef3c7;
  --color-status-mastered: #16a34a;   /* 習得済み：グリーン */
  --color-status-mastered-light: #dcfce7;
}
```

### 2.2 タイポグラフィ

```css
:root {
  /* ========== フォントファミリー ========== */
  --font-family-base: 'Inter', 'Noto Sans JP', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-family-mono: 'JetBrains Mono', 'Fira Code', monospace;
  
  /* ========== フォントサイズ ========== */
  --font-size-xs: 0.75rem;      /* 12px - キャプション、バッジ */
  --font-size-sm: 0.875rem;     /* 14px - 補足テキスト */
  --font-size-base: 1rem;       /* 16px - 本文 */
  --font-size-lg: 1.125rem;     /* 18px - 強調テキスト */
  --font-size-xl: 1.25rem;      /* 20px - 小見出し */
  --font-size-2xl: 1.5rem;      /* 24px - セクション見出し */
  --font-size-3xl: 1.875rem;    /* 30px - ページタイトル */
  --font-size-4xl: 2.25rem;     /* 36px - クイズの英単語表示 */
  --font-size-5xl: 3rem;        /* 48px - ヒーロー見出し */
  
  /* ========== フォントウェイト ========== */
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  
  /* ========== 行間 ========== */
  --line-height-tight: 1.25;    /* 見出し用 */
  --line-height-normal: 1.5;    /* 本文用 */
  --line-height-relaxed: 1.75;  /* 長文用 */
  
  /* ========== 字間 ========== */
  --letter-spacing-tight: -0.02em;   /* 見出し用 */
  --letter-spacing-normal: 0;
  --letter-spacing-wide: 0.025em;    /* 小さい文字用 */
}

/* タイポグラフィユーティリティ */
.heading-1 {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-tight);
  letter-spacing: var(--letter-spacing-tight);
  color: var(--color-text-primary);
}

.heading-2 {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-tight);
  letter-spacing: var(--letter-spacing-tight);
  color: var(--color-text-primary);
}

.heading-3 {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-tight);
  color: var(--color-text-primary);
}

.body-text {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-normal);
  line-height: var(--line-height-normal);
  color: var(--color-text-primary);
}

.caption {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-normal);
  line-height: var(--line-height-normal);
  color: var(--color-text-secondary);
}
```

### 2.3 スペーシング

```css
:root {
  /* ========== スペーシングスケール ========== */
  --space-0: 0;
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
  --space-20: 5rem;     /* 80px */
  --space-24: 6rem;     /* 96px */
}
```

### 2.4 角丸・シャドウ

```css
:root {
  /* ========== 角丸 ========== */
  --radius-sm: 6px;     /* 小さいボタン、バッジ */
  --radius-md: 8px;     /* ボタン、入力フィールド */
  --radius-lg: 12px;    /* カード */
  --radius-xl: 16px;    /* モーダル、大きなカード */
  --radius-full: 9999px; /* ピル型ボタン */
  
  /* ========== シャドウ ========== */
  /* 重要: AI感を避けるため、シャドウは控えめに */
  --shadow-sm: 0 1px 2px rgba(28, 25, 23, 0.04);
  --shadow-md: 0 2px 8px rgba(28, 25, 23, 0.06);
  --shadow-lg: 0 4px 16px rgba(28, 25, 23, 0.08);
  --shadow-xl: 0 8px 32px rgba(28, 25, 23, 0.10);
  
  /* フォーカスリング（アクセシビリティ） */
  --shadow-focus: 0 0 0 3px rgba(245, 158, 11, 0.3);
}
```

---

## 3. コンポーネント仕様

### 3.1 ボタン

#### プライマリボタン
```css
.btn-primary {
  background-color: var(--color-accent-primary);
  color: var(--color-text-inverse);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius-md);
  border: none;
  cursor: pointer;
  transition: all 0.15s ease-out;
}

.btn-primary:hover {
  background-color: var(--color-accent-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.btn-primary:active {
  transform: scale(0.98);
}

.btn-primary:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}
```

#### セカンダリボタン
```css
.btn-secondary {
  background-color: transparent;
  color: var(--color-text-primary);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-default);
  cursor: pointer;
  transition: all 0.15s ease-out;
}

.btn-secondary:hover {
  background-color: var(--color-bg-secondary);
  border-color: var(--color-border-focus);
}
```

#### ゴーストボタン（テキストのみ）
```css
.btn-ghost {
  background-color: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  border: none;
  cursor: pointer;
  transition: all 0.15s ease-out;
}

.btn-ghost:hover {
  color: var(--color-text-primary);
  background-color: var(--color-bg-secondary);
}
```

### 3.2 カード

#### 基本カード
```css
.card {
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  transition: all 0.2s ease-out;
}

.card:hover {
  border-color: var(--color-border-focus);
  box-shadow: var(--shadow-sm);
}

/* クリック可能なカード */
.card-interactive {
  cursor: pointer;
}

.card-interactive:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.card-interactive:active {
  transform: translateY(0);
}
```

#### 単語カード（単語一覧用）
```css
.word-card {
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-lg);
  padding: var(--space-4) var(--space-5);
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.2s ease-out;
}

.word-card:hover {
  border-color: var(--color-border-focus);
}

.word-card__english {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.word-card__japanese {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
}

.word-card__status-badge {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  letter-spacing: var(--letter-spacing-wide);
}

.word-card__status-badge--new {
  background-color: var(--color-status-new-light);
  color: var(--color-status-new);
}

.word-card__status-badge--learning {
  background-color: var(--color-status-learning-light);
  color: var(--color-status-learning);
}

.word-card__status-badge--mastered {
  background-color: var(--color-status-mastered-light);
  color: var(--color-status-mastered);
}
```

### 3.3 クイズ選択肢

```css
.quiz-option {
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-lg);
  padding: var(--space-4) var(--space-5);
  display: flex;
  align-items: center;
  gap: var(--space-4);
  cursor: pointer;
  transition: all 0.15s ease-out;
}

.quiz-option:hover {
  border-color: var(--color-accent-primary);
  background-color: var(--color-accent-subtle);
}

.quiz-option:active {
  transform: scale(0.99);
}

/* 選択肢ラベル（A, B, C, D） */
.quiz-option__label {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-accent-primary);
  background-color: var(--color-accent-light);
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.quiz-option__text {
  font-size: var(--font-size-lg);
  color: var(--color-text-primary);
}

/* 正解時 */
.quiz-option--correct {
  border-color: var(--color-success);
  background-color: var(--color-success-light);
}

.quiz-option--correct .quiz-option__label {
  background-color: var(--color-success);
  color: var(--color-text-inverse);
}

/* 不正解時 */
.quiz-option--incorrect {
  border-color: var(--color-error);
  background-color: var(--color-error-light);
}

.quiz-option--incorrect .quiz-option__label {
  background-color: var(--color-error);
  color: var(--color-text-inverse);
}
```

### 3.4 プログレスバー

```css
.progress-bar {
  width: 100%;
  height: 4px;
  background-color: var(--color-border-light);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progress-bar__fill {
  height: 100%;
  background-color: var(--color-accent-primary);
  border-radius: var(--radius-full);
  transition: width 0.3s ease-out;
}
```

### 3.5 ステータスカード（統計表示）

```css
.stat-card {
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  text-align: center;
  min-width: 100px;
}

.stat-card__value {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  line-height: 1;
  margin-bottom: var(--space-2);
}

.stat-card__label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* カラーバリエーション */
.stat-card--new .stat-card__value {
  color: var(--color-status-new);
}

.stat-card--learning .stat-card__value {
  color: var(--color-status-learning);
}

.stat-card--mastered .stat-card__value {
  color: var(--color-status-mastered);
}
```

### 3.6 入力フィールド

```css
.input {
  width: 100%;
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  transition: all 0.15s ease-out;
}

.input::placeholder {
  color: var(--color-text-tertiary);
}

.input:hover {
  border-color: var(--color-border-focus);
}

.input:focus {
  outline: none;
  border-color: var(--color-accent-primary);
  box-shadow: var(--shadow-focus);
}
```

---

## 4. アニメーション仕様

### 4.1 基本原則
- **控えめ**: 派手なアニメーションは避け、機能的な動きのみ
- **高速**: 200ms以下を基本とし、ユーザーを待たせない
- **イージング**: `ease-out`を基本とし、自然な減速感を出す

### 4.2 トランジション定義

```css
:root {
  /* ========== デュレーション ========== */
  --duration-fast: 100ms;
  --duration-normal: 150ms;
  --duration-slow: 200ms;
  --duration-slower: 300ms;
  
  /* ========== イージング ========== */
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

### 4.3 アニメーション実装

#### ページ遷移（フェードイン）
```css
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.page-enter {
  animation: fadeIn var(--duration-slow) var(--ease-out);
}
```

#### ホバーエフェクト
```css
/* カード・ボタンのホバー */
.hover-lift {
  transition: transform var(--duration-normal) var(--ease-out),
              box-shadow var(--duration-normal) var(--ease-out);
}

.hover-lift:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
```

#### ボタン押下
```css
.press-effect {
  transition: transform var(--duration-fast) var(--ease-out);
}

.press-effect:active {
  transform: scale(0.98);
}
```

#### 正解/不正解フィードバック
```css
/* 背景色のスムーズな変化 */
.quiz-option {
  transition: background-color var(--duration-slower) var(--ease-out),
              border-color var(--duration-slower) var(--ease-out);
}

/* 軽いシェイク（不正解時・オプション） */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}

.shake {
  animation: shake var(--duration-slow) var(--ease-out);
}
```

#### プログレスバー
```css
.progress-bar__fill {
  transition: width var(--duration-slower) var(--ease-out);
}
```

#### リストアイテムのスタガー表示
```css
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.list-item {
  animation: slideUp var(--duration-slow) var(--ease-out) both;
}

/* JavaScriptで動的にdelayを設定: index * 50ms */
.list-item:nth-child(1) { animation-delay: 0ms; }
.list-item:nth-child(2) { animation-delay: 50ms; }
.list-item:nth-child(3) { animation-delay: 100ms; }
/* ... */
```

---

## 5. レイアウト仕様

### 5.1 グリッドシステム

```css
.container {
  width: 100%;
  max-width: 640px;  /* モバイルファーストの単一カラム */
  margin: 0 auto;
  padding: 0 var(--space-4);
}

@media (min-width: 768px) {
  .container {
    padding: 0 var(--space-6);
  }
}

@media (min-width: 1024px) {
  .container {
    max-width: 800px;
  }
}
```

### 5.2 ページ共通レイアウト

```css
.page {
  min-height: 100vh;
  background-color: var(--color-bg-primary);
  padding-top: var(--space-6);
  padding-bottom: var(--space-12);
}

.page__header {
  margin-bottom: var(--space-8);
}

.page__title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  letter-spacing: var(--letter-spacing-tight);
}

.page__subtitle {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  margin-top: var(--space-2);
}
```

---

## 6. ページ別UI仕様

### 6.1 ホーム画面（スキャン一覧）

#### 構成要素
1. ヘッダー（アプリ名 + 残り回数表示）
2. スキャン一覧（カードリスト）
3. 新規スキャンボタン（FAB）

#### 詳細仕様

```
┌─────────────────────────────────────┐
│  AppName                    残り9回/日  │  ← ヘッダー（sticky）
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐   │
│  │ スキャン 1/23 22:30          │   │  ← スキャンカード
│  │ 15語  •  2026年1月23日       │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ スキャン 1/22 18:45          │   │
│  │ 23語  •  2026年1月22日       │   │
│  └─────────────────────────────┘   │
│                                     │
│                          ┌─────┐   │
│                          │  +  │   │  ← FAB（新規スキャン）
│                          └─────┘   │
└─────────────────────────────────────┘
```

#### スキャンカード仕様
- 背景: `--color-bg-card`
- ボーダー: `1px solid --color-border-default`
- 角丸: `--radius-lg`
- パディング: `--space-5`
- ホバー時: 軽いリフト効果 + ボーダー色変化
- タイトル: `--font-size-lg`, `--font-weight-medium`
- メタ情報: `--font-size-sm`, `--color-text-secondary`

### 6.2 単語一覧画面

#### 構成要素
1. バックボタン + タイトル
2. 統計カード（新規・復習中・習得済み）
3. クイズ開始ボタン
4. 単語リスト

#### 詳細仕様

```
┌─────────────────────────────────────┐
│  ←  スキャン 1/23 22:30             │  ← ヘッダー
├─────────────────────────────────────┤
│                                     │
│  ┌────────┐ ┌────────┐ ┌────────┐  │
│  │   6    │ │   9    │ │   0    │  │  ← 統計カード
│  │  新規  │ │ 復習中 │ │習得済み│  │
│  └────────┘ └────────┘ └────────┘  │
│                                     │
│  ┌─────────────────────────────┐   │
│  │      ▶ クイズを始める         │   │  ← プライマリボタン
│  └─────────────────────────────┘   │
│                                     │
│  単語一覧 (15語)                    │  ← セクション見出し
│                                     │
│  ┌─────────────────────────────┐   │
│  │ snake                   新規 │   │  ← 単語カード
│  │ ヘビ                         │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ sunflower             復習中 │   │
│  │ ヒマワリ                     │   │
│  └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

#### 統計カード仕様
- 3カラム均等配置（`gap: --space-3`）
- 各カード背景: `--color-bg-card`
- 数値: `--font-size-3xl`, `--font-weight-bold`
- ラベル: `--font-size-sm`, `--color-text-secondary`
- 数値の色は各ステータスカラーを使用

### 6.3 クイズ画面

#### 構成要素
1. 閉じるボタン + プログレス表示
2. 問題（英単語）
3. 選択肢（4択）

#### 詳細仕様

```
┌─────────────────────────────────────┐
│  ×                         1 / 10 ■│  ← ヘッダー + プログレスバー
├─────────────────────────────────────┤
│                                     │
│                                     │
│                                     │
│              worm                   │  ← 問題の英単語
│                                     │     font-size: 4xl
│                                     │     font-weight: bold
│                                     │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ Ⓐ  ゴムヘビ                  │   │  ← 選択肢
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ Ⓑ  ミミズ                    │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ Ⓒ  ヤモリ                    │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ Ⓓ  ミミズク                  │   │
│  └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

#### クイズ画面仕様
- 問題の英単語: 画面中央配置、`--font-size-4xl`, `--font-weight-bold`
- 選択肢間のスペース: `--space-3`
- プログレス表示: 「1 / 10」形式 + 細いプログレスバー
- 回答後のフィードバック: 背景色が0.3秒でスムーズに変化

---

## 7. レスポンシブ対応

### 7.1 ブレイクポイント

```css
/* モバイルファースト */
/* 基本スタイル: ~767px */

/* タブレット */
@media (min-width: 768px) {
  /* md */
}

/* デスクトップ */
@media (min-width: 1024px) {
  /* lg */
}
```

### 7.2 調整項目

| 要素 | モバイル | タブレット以上 |
|------|----------|----------------|
| コンテナ幅 | 100% - padding | max-width: 800px |
| 基本余白 | 16px | 24px |
| 問題の文字サイズ | 30px | 36px |
| 統計カード | 3列均等 | 3列均等（幅広め） |

---

## 8. アクセシビリティ

### 8.1 必須対応

1. **フォーカスインジケーター**: すべてのインタラクティブ要素に`--shadow-focus`を適用
2. **色のコントラスト比**: テキストは4.5:1以上を確保
3. **タッチターゲット**: 最小44x44px
4. **キーボード操作**: Tab, Enter, Spaceで全機能操作可能

### 8.2 実装例

```css
/* フォーカス状態 */
:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

/* スクリーンリーダー用非表示テキスト */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

---

## 9. 実装優先順位

### Phase 1: 基盤
1. CSS変数（デザイントークン）の設定
2. グローバルスタイル（リセット、タイポグラフィ）
3. 共通コンポーネント（ボタン、カード）

### Phase 2: ページ実装
1. クイズ画面（コア機能）
2. 単語一覧画面
3. ホーム画面

### Phase 3: 磨き込み
1. アニメーションの追加
2. レスポンシブ調整
3. アクセシビリティ対応

---

## 10. 注意事項

### やるべきこと
- デザイントークンを一貫して使用する
- 余白は`--space-*`変数のみ使用
- 色は必ずCSS変数を参照
- ホバー・フォーカス状態を必ず実装

### 避けるべきこと
- Tailwindのデフォルト青（#3b82f6）をメインカラーに使わない
- 絵文字・イラストを使わない
- 角丸を大きくしすぎない（max: 16px）
- シャドウを濃くしすぎない
- 過度なアニメーション（バウンス、揺れなど）

---

## 付録: Tailwind設定例

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#fafaf9',
          secondary: '#f5f5f4',
          card: '#ffffff',
        },
        text: {
          primary: '#1c1917',
          secondary: '#78716c',
          tertiary: '#a8a29e',
        },
        border: {
          DEFAULT: '#e7e5e4',
          light: '#f5f5f4',
          focus: '#d6d3d1',
        },
        accent: {
          DEFAULT: '#f59e0b',
          hover: '#d97706',
          light: '#fef3c7',
          subtle: '#fffbeb',
        },
        success: {
          DEFAULT: '#16a34a',
          light: '#dcfce7',
        },
        error: {
          DEFAULT: '#dc2626',
          light: '#fee2e2',
        },
        status: {
          new: '#3b82f6',
          'new-light': '#dbeafe',
          learning: '#f59e0b',
          'learning-light': '#fef3c7',
          mastered: '#16a34a',
          'mastered-light': '#dcfce7',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans JP', 'sans-serif'],
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '8px',
        lg: '12px',
        xl: '16px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(28, 25, 23, 0.04)',
        DEFAULT: '0 2px 8px rgba(28, 25, 23, 0.06)',
        lg: '0 4px 16px rgba(28, 25, 23, 0.08)',
        focus: '0 0 0 3px rgba(245, 158, 11, 0.3)',
      },
    },
  },
}
```