# Task: プロジェクト一覧ページの独立化

## 目標
現在ホーム画面に埋め込まれているプロジェクト一覧を、独立したページとして切り出す。

## 現状
- `src/app/page.tsx` にプロジェクト選択ドロップダウンがある
- BottomNav の検索タブは使われていない

## 実装内容

### 1. 新規ページ作成: `/projects`
ファイル: `src/app/projects/page.tsx`

**レイアウト:**
- ヘッダー: 「プロジェクト」タイトル + 新規作成ボタン
- 検索バー (フィルタリング用)
- プロジェクトカードのグリッド/リスト

**各プロジェクトカードに表示:**
- プロジェクト名
- 単語数
- 最終学習日
- 進捗バー (習得率)

### 2. BottomNav 更新
ファイル: `src/components/ui/bottom-nav.tsx`

- 検索アイコン → フォルダアイコンに変更
- ラベル: 「検索」→「プロジェクト」
- リンク先: `/projects`

### 3. ホーム画面の簡略化
- プロジェクトドロップダウンを削除 or シンプル化
- 「最近のプロジェクト」のみ表示 (DashboardHeader で対応済み)

## 参考ファイル
- `docs/UIUX_REDESIGN.md` の「ナビゲーション」セクション
- `src/components/home/DashboardHeader.tsx` (最近のプロジェクト表示)

## テスト
- TypeScript エラーなし: `npx tsc --noEmit`
- 開発サーバー確認: `npm run dev`

## 完了後
```bash
git add -A
git commit -m "feat: add dedicated projects page, update bottom nav"
git push -u origin feature/project-list-page
```
