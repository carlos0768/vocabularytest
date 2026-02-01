# Task: 設定画面のリデザイン

## 目標
設定画面をグループ化し、整理された見やすい形式にリデザインする。

## 現状
- `src/app/settings/page.tsx` に設定項目がフラットに並んでいる

## 実装内容

### 1. 設定のグループ化

**グループ構成:**

1. **アカウント**
   - プロフィール情報
   - ログアウト
   - アカウント削除

2. **学習設定**
   - デフォルトクイズ問題数
   - 音声読み上げ ON/OFF
   - 復習リマインダー

3. **表示設定**
   - ダークモード切り替え
   - フォントサイズ
   - 言語設定

4. **サブスクリプション** (Pro 関連)
   - 現在のプラン
   - プランアップグレード
   - 支払い履歴

5. **サポート**
   - お問い合わせ
   - FAQ
   - 利用規約・プライバシーポリシー

### 2. グループカードコンポーネント
ファイル: `src/components/settings/SettingsGroup.tsx`

```tsx
interface SettingsGroupProps {
  title: string;
  children: React.ReactNode;
}
```

- グループタイトル
- カード内に設定項目をまとめる
- 各項目は SettingsItem コンポーネント

### 3. SettingsItem コンポーネント
ファイル: `src/components/settings/SettingsItem.tsx`

- アイコン + ラベル + 値/トグル
- クリック可能な項目はシェブロン表示
- トグル項目は右側にスイッチ

## デザイン参考
- iOS の設定アプリ風
- 丸みを帯びたカード
- グループ間のスペーシング

## テスト
- TypeScript エラーなし: `npx tsc --noEmit`
- 開発サーバー確認: `npm run dev`

## 完了後
```bash
git add -A
git commit -m "feat: redesign settings page with grouped sections"
git push -u origin feature/settings-redesign
```
