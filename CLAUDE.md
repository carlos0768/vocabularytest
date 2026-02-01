# Task: プロジェクト詳細ページのタブ化

## 目標
プロジェクト詳細ページ (`/project/[id]`) を、情報をタブで整理した形式にリデザインする。

## 現状
- `src/app/project/[id]/page.tsx` は現在存在しない
- ホーム画面がプロジェクト詳細の役割も担っている

## 実装内容

### 1. プロジェクト詳細ページ作成: `/project/[id]`
ファイル: `src/app/project/[id]/page.tsx`

**タブ構成:**
1. **学習** (デフォルト)
   - クイズ開始ボタン
   - フラッシュカード開始ボタン
   - 例文クイズ開始ボタン (Pro)
   - 進捗サマリー
   
2. **単語**
   - 単語一覧 (現在のWordListと同等)
   - 検索・フィルター機能
   - お気に入り・苦手フィルター
   
3. **統計** (Pro)
   - 学習グラフ
   - 正答率推移
   - 苦手単語ランキング

### 2. タブコンポーネント作成
ファイル: `src/components/ui/tabs.tsx`

シンプルなタブUI:
- 3つのタブボタン
- アクティブ状態のスタイリング
- アニメーション付き切り替え

### 3. ホーム画面からの遷移
- プロジェクトカードクリック → `/project/[id]`

## デザイン参考
- `docs/UIUX_REDESIGN.md` の「プロジェクト詳細の再設計」
- 既存の `StudyModeCard` コンポーネント活用

## テスト
- TypeScript エラーなし: `npx tsc --noEmit`
- 開発サーバー確認: `npm run dev`

## 完了後
```bash
git add -A
git commit -m "feat: add tabbed project detail page"
git push -u origin feature/project-detail-tabs
```
