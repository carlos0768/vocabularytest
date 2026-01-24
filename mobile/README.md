# ScanVocab Mobile

React Native (Expo) で作成されたScanVocabのモバイルアプリです。Webアプリと同じデザインと機能を提供します。

## 機能

- **画像スキャン**: ノートやプリントを撮影して英単語を自動抽出
- **AI翻訳**: OpenAI GPT-4o を使用した日本語翻訳と間違い選択肢の生成
- **クイズモード**: 4択クイズで効率的に単語を学習
- **進捗管理**: 新規/復習中/習得済みのステータス管理
- **統計表示**: 今日の学習数、正答率、連続日数などを表示

## 技術スタック

- **フレームワーク**: React Native + Expo
- **ナビゲーション**: React Navigation
- **ローカルDB**: expo-sqlite
- **画像処理**: expo-image-picker, expo-camera
- **アイコン**: lucide-react-native
- **認証**: Supabase Auth (予定)
- **クラウドDB**: Supabase PostgreSQL (Pro版)

## ディレクトリ構造

```
src/
├── components/
│   ├── ui/              # 共通UIコンポーネント
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   └── ProgressSteps.tsx
│   ├── project/         # プロジェクト関連コンポーネント
│   │   ├── ProjectCard.tsx
│   │   └── ScanButton.tsx
│   ├── quiz/            # クイズ関連コンポーネント
│   │   └── QuizOption.tsx
│   └── ProcessingModal.tsx
├── screens/
│   ├── HomeScreen.tsx       # ホーム画面（プロジェクト一覧）
│   ├── ProjectScreen.tsx    # プロジェクト詳細
│   ├── QuizScreen.tsx       # クイズ画面
│   ├── ScanConfirmScreen.tsx # スキャン確認
│   ├── LoginScreen.tsx      # ログイン
│   ├── SignupScreen.tsx     # 新規登録
│   ├── SettingsScreen.tsx   # 設定
│   └── SubscriptionScreen.tsx # サブスクリプション
├── navigation/          # ナビゲーション設定
├── hooks/              # カスタムフック
├── lib/
│   ├── db/             # データベース (SQLite)
│   │   ├── sqlite.ts   # SQLite操作
│   │   └── index.ts    # リポジトリファクトリ
│   ├── ai/             # AI連携
│   │   └── extract-words.ts
│   └── utils.ts        # ユーティリティ関数
├── types/              # TypeScript型定義
└── constants/          # 定数（カラー等）
```

## セットアップ

### 1. 依存関係のインストール

```bash
cd mobile
npm install
```

### 2. 環境設定

OpenAI APIキーをアプリ内の設定画面で入力するか、環境変数として設定してください。

### 3. 開発サーバーの起動

```bash
npm start
```

### 4. デバイスで実行

- iOS: `npm run ios`
- Android: `npm run android`

## ビルド

### iOS

```bash
npx expo build:ios
# または EAS Build を使用
eas build --platform ios
```

### Android

```bash
npx expo build:android
# または EAS Build を使用
eas build --platform android
```

## Webアプリとの対応

| Web (Next.js) | Mobile (React Native) |
|---------------|----------------------|
| `src/app/page.tsx` | `src/screens/HomeScreen.tsx` |
| `src/app/project/[id]/page.tsx` | `src/screens/ProjectScreen.tsx` |
| `src/app/quiz/[projectId]/page.tsx` | `src/screens/QuizScreen.tsx` |
| `src/app/scan/confirm/page.tsx` | `src/screens/ScanConfirmScreen.tsx` |
| `src/lib/db/dexie.ts` (IndexedDB) | `src/lib/db/sqlite.ts` (SQLite) |
| Tailwind CSS | React Native StyleSheet |

## プラン

| 機能 | Free | Pro (¥500/月) |
|------|------|--------------|
| 1日のスキャン | 3回 | 無制限 |
| データ保存 | ローカルのみ | クラウド同期 |
| 複数デバイス | × | ○ |
