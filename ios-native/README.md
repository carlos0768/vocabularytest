# MerkenIOS (Native SwiftUI)

iOS 26+ 向けの MERKEN ネイティブ実装です。既存 `mobile` (Expo/React Native) と共存します。

## 現在の実装状態

現在の `codex/ios-mobile-responsive` ブランチでは、Webモバイル版に合わせたiOS UI再構築を進めています。最新の変更範囲、画面別の意図、QA観点は `IOS_WEB_PARITY_CHANGELOG.md` を参照してください。

## 前提
- Xcode 26 以上 (iOS 26 SDK)
- xcodegen (`brew install xcodegen`)

## セットアップ
```bash
cd ios-native
xcodegen generate --spec project.yml
open MerkenIOS.xcodeproj
```

## 構成
- `MerkenIOS/App`: エントリ、AppState、RootTab
- `MerkenIOS/DesignSystem`: Liquid Glass / Solid Components / Web Mobile 共通UI
- `MerkenIOS/Features`: Home / Project / Quiz / Flashcard / Bookshelf / Stats / Account / Support
- `MerkenIOS/Data`: モデル、SwiftData、Repository
- `MerkenIOS/Services`: Supabase Auth/REST、設定

## データ方針
- ゲスト: SwiftData ローカル保存
- ログイン + Active Pro: Supabase クラウド
- ログイン済みでも Pro 以外: ローカル継続

## 設定値
`MerkenIOS/Resources/Info.plist`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `WEB_API_BASE_URL`

## テスト
- `MerkenIOSTests/RepositoryRouterTests.swift`
- `MerkenIOSTests/QuizEngineTests.swift`
- `MerkenIOSTests/SupabaseMapperTests.swift`

## 残作業ドキュメント
- `IOS_WEB_PARITY_CHANGELOG.md`（現ブランチのWebモバイル寄せ実装スナップショット）
- `PHASE1_REMAINING_WORK.md`（Phase 1 完了までの詳細タスク、実行順、受け入れ条件）
