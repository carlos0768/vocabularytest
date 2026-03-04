# デザインテーマ適用計画書

## 概要
現在の「Stitch Blue」テーマに加え、2つの新テーマを追加し、ユーザーが切り替え可能にする。
対象ページ: **ホーム(ダッシュボード)** と **単語帳ページ(プロジェクト詳細)**

## テーマ定義

### 案2: Deep Navy × Copper
| トークン | Light | Dark |
|----------|-------|------|
| `--color-primary` | `#C87941` (銅) | `#C87941` |
| `--color-primary-dark` | `#A86330` | `#D48A52` |
| `--color-primary-light` | `#FDF3EB` | `#1F1510` |
| `--color-background` | `#F4F1ED` (暖かいオフホワイト) | `#0A1628` |
| `--color-surface` | `#FFFFFF` | `#121F36` |
| `--color-foreground` | `#1A1A2E` | `#D4D0C8` |
| `--color-muted` | `#7A7A8A` | `#8A9AB0` |
| `--color-border` | `#DDD5CC` | `#1E3050` |
| `--color-border-light` | `#EDE8E2` | `#162640` |
| `--color-hero` | `#0F2240` | `#0A1628` |
| `--color-dot` | `#B0A89E` | `#15253D` |
| Secondary accent | `#2E7D8C` (ティール) | `#2E7D8C` |

**性格**: 高級感・落ち着き。革装丁のノートブック的。

### 案3: Charcoal × Electric Lime
| トークン | Light | Dark |
|----------|-------|------|
| `--color-primary` | `#7CB518` (ライム) | `#B4E33D` |
| `--color-primary-dark` | `#5A8A0F` | `#9ACD32` |
| `--color-primary-light` | `#F2F9E6` | `#161E0A` |
| `--color-background` | `#F5F5F0` (ウォームグレー) | `#141414` |
| `--color-surface` | `#FFFFFF` | `#1E1E1E` |
| `--color-foreground` | `#1A1A1A` | `#F0F0F0` |
| `--color-muted` | `#6E6E6E` | `#8A8A8A` |
| `--color-border` | `#E0E0DA` | `#2E2E2E` |
| `--color-border-light` | `#EBEBEB` | `#242424` |
| `--color-hero` | `#1A1A1A` | `#141414` |
| `--color-dot` | `#CCCCCC` | `#222222` |
| Secondary accent | なし (モノクロ+ライムのみ) | 同左 |

**性格**: シャープ・モダン。テックツール感。

---

## 実装方針

### Step 1: CSS変数のテーマ化
**ファイル**: `globals.css`

現在の構造:
```
:root { ... }        ← ライトテーマ
.dark { ... }        ← ダークテーマ
```

新構造:
```
:root { ... }                    ← デフォルト (Stitch Blue) ライト
.dark { ... }                    ← デフォルト ダーク

[data-theme="navy-copper"] { ... }           ← 案2 ライト
[data-theme="navy-copper"].dark { ... }      ← 案2 ダーク

[data-theme="charcoal-lime"] { ... }         ← 案3 ライト
[data-theme="charcoal-lime"].dark { ... }    ← 案3 ダーク
```

`data-theme` 属性を `<html>` に付与。既存の `dark` クラスとの共存。

### Step 2: テーマ切替ロジック
**ファイル**: `theme-provider.tsx`

- 既存の dark/light 切替に加え `theme` state を追加
- `localStorage` に保存 (`merken-theme`)
- `useTheme()` hook に `theme` / `setTheme` を追加

### Step 3: ホームページのテーマ対応
**ファイル**: `src/app/page.tsx`

主な変更箇所:
1. **ヒーローセクション**: `--color-hero` ベースのグラデーション → テーマごとに自動反映
2. **プロジェクトカード (BookTile)**: 現在は `getBookCoverColors()` でランダム色 → テーマのプライマリカラーベースに調整
3. **アクションボタン**: primary カラーは CSS変数経由なので自動対応
4. **背景ドットグリッド**: `--color-dot` で自動対応

### Step 4: 単語帳ページ (VocabularyTab) のテーマ対応
**ファイル**: `src/components/project/VocabularyTab.tsx`

主な変更箇所:
1. **ヘッダー/タブバー**: primary カラーのアクセント
2. **単語カード**: surface + border で自動対応
3. **クイズボタン**: primary カラーで自動対応
4. **進捗バー**: primary カラー

### Step 5: テーマ選択UI
**場所**: 設定ページ or ホームのヘッダー内

- 3つのテーマをプレビュー付きで表示
- タップで即時切替

---

## 影響範囲

### 自動で対応するもの (CSS変数経由)
- ボタン色、背景色、テキスト色、ボーダー
- ドットグリッド背景
- ヒーローセクション
- シャドウ (相対的なので問題なし)

### 手動対応が必要なもの
- `ProjectBookTile` の `getBookCoverColors()` — ハードコードされたグラデーション
- `.dark .bg-gray-*` 系の直書きオーバーライド — テーマ別に調整
- テーマによって `success/error/warning` の色味調整が必要か検討

### 変更しないもの
- success/error/warning (セマンティックカラー) — 全テーマ共通
- フォント — 全テーマ共通
- レイアウト/間隔 — 変更なし

---

## 作業順序

1. `globals.css` にテーマ変数追加 (30min)
2. `theme-provider.tsx` にテーマ切替追加 (20min)
3. `getBookCoverColors()` のテーマ対応 (15min)
4. ホーム画面で確認・微調整 (20min)
5. 単語帳ページで確認・微調整 (15min)
6. テーマ選択UIの実装 (20min)

**合計: 約2時間**

---

## 備考
- 現在のテーマ (Stitch Blue) はデフォルトとして残す
- テーマ切替はフリーユーザーも使用可能 (Pro制限なし)
- 案2・案3どちらかに絞る可能性あり → 両方実装して Carlos が判断
