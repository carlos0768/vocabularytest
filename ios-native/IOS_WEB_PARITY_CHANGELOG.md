# iOS Web Mobile Parity Changelog

最終更新: 2026-05-10  
対象ブランチ: `codex/ios-mobile-responsive`  
対象アプリ: `ios-native/MerkenIOS`

## 目的

現在のiOS版は、古い作りかけSwiftUIをそのまま維持するのではなく、Webモバイル版の見た目と導線に寄せる方針で大きく更新した。

この文書は、現ブランチで入っているiOS側の変更を後続作業者が迷わず引き継ぐための実装スナップショットである。古い `IOS_REDESIGN_PLAN.md` や `PHASE1_REMAINING_WORK.md` より、この文書を優先して参照する。

## 検証状況

- `git diff --check -- ios-native/...`: 通過
- `build_run_sim`: 成功
- Simulator: `iPhone 17 Pro`
- Scheme: `MerkenIOS`
- Project: `ios-native/MerkenIOS.xcodeproj`
- 既知の警告:
  - `BackgroundUploadService.swift`: `shouldUseExtendedBackgroundIdleMode` deprecated
  - 一部 `HomeView.swift` / `StatsView.swift`: iOS 17+ / iOS 26 deprecation warning

## 追加・更新された基盤

### Solid / Web Mobile Component Layer

追加:
- `MerkenIOS/DesignSystem/SolidComponents.swift`
- `MerkenIOS/DesignSystem/WebMobileComponents.swift`

主な責務:
- Web版のsolid UIに合わせたカード、面、ボタン、チップ、ページヘッダー、メトリックタイルをSwiftUIで再現する。
- `SolidSurface`, `SolidButtonStyle`, `SolidIconButton`, `SolidChip`, `SolidPageHeader`, `SolidMetricTile`, `SolidEmptyState` を共通化する。
- 影はWebのsolid shadowに合わせて、黒またはアクセント色のオフセット面で表現する。
- ボタンは太すぎる塗りを避け、Web相当の薄い高さ・細い余白・明確な枠線へ寄せる。

### Theme / Dark Mode

更新:
- `DesignSystem/Theme.swift`
- `DesignSystem/AppBackground.swift`
- `DesignSystem/GlassSurface.swift`
- `DesignSystem/ThemeCubeSelector.swift`

方針:
- Webの `--solid-ink`, `--color-accent`, success/error/warning をiOSトークンへ対応させる。
- ダークモードでは背景・面・文字・ボーダーが沈みすぎないようにadaptive colorを使う。
- ブックマーク系の色は緑に統一する。アクティブなbookmark表示は `MerkenTheme.accentGreen` を使う。
- 画面下部のタブバーは簡素なLiquid Glass表現へ更新する。

## 画面別変更

### App Shell / Bottom Bar

対象:
- `App/RootTabView.swift`
- `App/MerkenIOSApp.swift`

変更:
- 画面下部バーをWeb寄せのシンプルなLiquid Glass系UIに変更した。
- タブの選択状態、中央スキャンボタン、背景の透過・ぼかし感を調整した。
- 既存の太い装飾を減らし、ホーム/共有/スキャン/進み/アカウントの主要導線を整理した。

### Home

対象:
- `Features/Home/HomeView.swift`
- `Features/Home/HomeViewModel.swift`

変更:
- Webモバイル版のダッシュボード構成へ寄せた。
- 単語帳がない状態で「単語がありません」だけにならないよう、Webの空状態ガイドに近いビジュアルカードを追加した。
- ホームの単語帳ウィジェットをWeb版に寄せた。
- マイ単語帳の表示数は5件に揃えた。
- Webに存在しない「共有単語帳」セクションはホームから削除した。
- 復習開始、単語帳カード、学習進捗の表示密度をWebのモバイルUIに合わせた。

### Project List / My Books

対象:
- `Features/Project/ProjectListView.swift`
- `Features/Project/ProjectListViewModel.swift`

変更:
- 単語帳一覧ページから新規ボタンを削除した。
- 単語帳ウィジェットをWeb版のsolid card表現へ寄せた。
- ピン/ブックマーク状態の表示は緑アクセントへ寄せた。
- 太いボタン・大きすぎる余白を減らした。

### Project Detail / Word List

対象:
- `Features/Project/ProjectDetailView.swift`
- `Features/Project/ProjectDetailViewModel.swift`
- `Features/Project/WordListView.swift`
- `Features/Project/VocabularyTypeCycleButton.swift`
- `Features/Project/NotionCheckboxProgress.swift`

変更:
- 単語帳ページをWeb版のNotion風リストに寄せた。
- チェックボックス3個が詰まって連結して見える問題を修正した。
- 単語帳ページ内の太すぎるボタンをWeb相当の細いsolid buttonへ寄せた。
- ブックマーク絞り込み・一括ブックマーク・単語行のbookmark表示を緑へ統一した。
- 単語詳細は専用ページ遷移ではなく、Web版に近いミニウィンドウ/モーダル表示へ変更した。
- 選択モード、一括削除、一括ブックマーク、検索、フィルター、ソートをWeb寄せの配置にした。

### Word Detail Modal

対象:
- `Features/Project/WordDetailView.swift`

変更:
- 単語詳細UIをWeb版のミニウィンドウに近い構成へ更新した。
- 発音、語彙タイプ、ブックマーク、例文、関連語、用法、Insight、編集導線を同一モーダル内に整理した。
- ブックマーク色は茶/黄から緑へ統一した。
- ダークモード時のコントラストと面の沈み込みを修正した。

### Flashcard

対象:
- `Features/Flashcard/FlashcardCardView.swift`
- `Features/Flashcard/FlashcardView.swift`
- `Features/Flashcard/FlashcardViewModel.swift`

変更:
- フラッシュカードに載せる情報をWeb版に寄せた。
- 英語、意味、発音、品詞、例文、関連語、用法、進捗、ブックマーク情報を整理した。
- 操作チップのボタンが太く見える問題を修正し、Web相当の細いアクションに寄せた。
- ブックマーク色は緑へ統一した。
- フラッシュカード画面の主要操作とカード面の密度をWebモバイル版に近づけた。

### Quiz / Four Choice

対象:
- `Features/Quiz/QuizView.swift`
- `Features/Quiz/QuizViewModel.swift`
- `Features/Quiz2/Quiz2View.swift`

変更:
- 四択クイズページをWeb版に寄せた。
- 「次へ」ボタンは細すぎた状態からWeb相当の太さへ調整した。
- 正解/不正解の選択肢表示を再設計した。
  - 成功色: `#22c55e`
  - 失敗色: `#ef4444`
  - 淡い面、太い色枠、色付き影、色付きバッジ、色付きアイコンを使い、単なる濃い塗りではなく鮮明に見えるようにした。
- クイズ内bookmarkは緑アクセントへ統一した。
- セットアップ、進行中、結果画面のsolid UIをWebモバイル版へ寄せた。

### Stats / Progress

対象:
- `Features/Stats/StatsView.swift`
- `Features/Stats/StatsViewModel.swift`

変更:
- 進歩ページをWebモバイル版に寄せた。
- KPI、リング、週間グラフ、ヒートマップ、内訳カードをsolid UIへ更新した。
- bookmark/苦手単語系のメトリック色を緑に統一した。
- ダークモードでの文字、背景、グラフ色のコントラストを改善した。

### Bookshelf / Shared Projects

対象:
- `Features/Bookshelf/BookshelfListView.swift`
- `Features/Bookshelf/BookshelfListViewModel.swift`
- `Features/Bookshelf/BookshelfDetailView.swift`
- `Features/Bookshelf/BookshelfDetailViewModel.swift`
- `Services/WebAPIClient.swift`

変更:
- 共有単語帳一覧のタイトル位置が下がりすぎる問題を修正した。
- 共有単語帳一覧ページのカードをホームの単語帳ウィジェットへ寄せた。
- 表示されない共有単語帳がある問題を修正した。
  - `/api/shared-projects/public` をページング取得する `fetchPublicSharedProjects` を追加。
  - `ownedProjects + joinedProjects + publicProjects` を重複排除して `allSharedProjects` として表示する。
- 共有単語帳一覧と単語帳詳細のキャッシュを追加した。
  - メモリキャッシュで画面再表示を高速化。
  - Application Support配下にJSON保存し、アプリキル後も即時表示できるようにした。
  - 保存先: `Application Support/MerkenIOS/SharedProjectCache`
- ネットワーク取得前にキャッシュをseedし、成功時にキャッシュを更新する。

### Account / Settings / Support

対象:
- `Features/Settings/SettingsView.swift`
- `Features/Support/ContactView.swift`
- `Features/Support/PrivacyView.swift`
- `Features/Support/TermsView.swift`
- `Features/Auth/SignUpView.swift`

変更:
- アカウントページをWeb寄せに修正した。
- サポートページ内をWebを参考に全面的に書き直した。
- 利用規約・プライバシー・問い合わせ画面をsolid UIとダークモード対応へ寄せた。
- サインアップ画面の視覚表現を現行iOSデザインへ合わせた。

### Search / Favorites

対象:
- `Features/Search/SearchView.swift`
- `Features/Favorites/FavoritesView.swift`
- `Features/Favorites/FavoritesViewModel.swift`

変更:
- 検索画面をWeb寄せのsolid input/empty stateへ更新した。
- 苦手単語一覧のbookmark色を緑へ統一した。
- 空状態と一覧の密度をWebモバイル版に近づけた。

## API / Data Contract

### Public Shared Projects

`WebAPIClient` に公開共有単語帳用のページング取得を追加した。

- Endpoint: `GET /api/shared-projects/public?limit=24&cursor=...`
- 最大ページ数: 12
- レスポンス: `items`, `nextCursor`, `error`
- 失敗時は既存catalog responseの `publicProjects` へフォールバックする。

### Shared Project Persistent Cache

`SharedProjectPersistentCache` を追加した。

保存内容:
- Catalog:
  - `ownedProjects`
  - `joinedProjects`
  - `publicProjects`
  - `cachedAt`
- Detail:
  - `project`
  - `words`
  - `accessRole`
  - `collaboratorCount`
  - `cachedAt`

キー:
- catalog: user id / active user id をfile-safe base64化
- detail: project id をfile-safe base64化

挙動:
- 初回表示時にキャッシュがあれば即時反映し、`loading = false` にする。
- その後ネットワーク更新を走らせ、成功したらメモリ/ディスクキャッシュを更新する。
- ネットワーク失敗時もキャッシュがあれば既存表示を維持し、空画面に戻さない。

## UIルール

今後のiOS変更では以下を守る。

- WebにないセクションをiOSだけで追加しない。
- ホームのマイ単語帳表示は5件に揃える。
- 主要ボタンは太くしすぎない。Webのsolid button相当の高さ、枠、影にする。
- ブックマーク色は緑に統一する。
- 単語詳細はページ遷移ではなくミニウィンドウ表示を基本にする。
- 共有単語帳カードはホームの単語帳カードと見た目を揃える。
- ダークモードでは、淡い面をそのまま使わずadaptive colorで沈み込みを避ける。
- 四択の正解/不正解は、濃いベタ塗りだけでなく、明るい色・輪郭・影・バッジ・アイコンで鮮明に見せる。

## 手動QA対象

最低限、以下はライト/ダーク両方で確認する。

- Home
  - 単語帳あり
  - 単語帳なし
  - マイ単語帳5件表示
- Project List
  - 新規ボタンがないこと
  - ピン/ブックマーク表示
- Project Detail
  - 単語行
  - チェックボックス間隔
  - 一括操作バー
  - 単語詳細ミニウィンドウ
- Flashcard
  - 表面/裏面
  - 発音/例文/関連語/用法
  - bookmark色
- Quiz
  - 正解/不正解の鮮明なフィードバック
  - 次へボタン
  - 結果画面
- Stats
  - KPI
  - グラフ/ヒートマップ
  - bookmarkメトリック色
- Shared Bookshelf
  - 一覧タイトル位置
  - ホームと同じカード表示
  - public projectsが欠けないこと
  - アプリキル後もキャッシュから即時表示されること
- Account / Support
  - Accountトップ
  - Contact
  - Privacy
  - Terms

## 変更ファイル一覧

主な変更対象:

- `MerkenIOS.xcodeproj/project.pbxproj`
- `MerkenIOS/App/MerkenIOSApp.swift`
- `MerkenIOS/App/RootTabView.swift`
- `MerkenIOS/DesignSystem/AppBackground.swift`
- `MerkenIOS/DesignSystem/GlassSurface.swift`
- `MerkenIOS/DesignSystem/SolidComponents.swift`
- `MerkenIOS/DesignSystem/WebMobileComponents.swift`
- `MerkenIOS/DesignSystem/Theme.swift`
- `MerkenIOS/DesignSystem/ThemeCubeSelector.swift`
- `MerkenIOS/Features/Auth/SignUpView.swift`
- `MerkenIOS/Features/Bookshelf/BookshelfDetailView.swift`
- `MerkenIOS/Features/Bookshelf/BookshelfDetailViewModel.swift`
- `MerkenIOS/Features/Bookshelf/BookshelfListView.swift`
- `MerkenIOS/Features/Bookshelf/BookshelfListViewModel.swift`
- `MerkenIOS/Features/Favorites/FavoritesView.swift`
- `MerkenIOS/Features/Flashcard/FlashcardCardView.swift`
- `MerkenIOS/Features/Flashcard/FlashcardView.swift`
- `MerkenIOS/Features/Flashcard/FlashcardViewModel.swift`
- `MerkenIOS/Features/Home/HomeView.swift`
- `MerkenIOS/Features/Home/HomeViewModel.swift`
- `MerkenIOS/Features/Project/ProjectDetailView.swift`
- `MerkenIOS/Features/Project/ProjectDetailViewModel.swift`
- `MerkenIOS/Features/Project/ProjectListView.swift`
- `MerkenIOS/Features/Project/VocabularyTypeCycleButton.swift`
- `MerkenIOS/Features/Project/WordDetailView.swift`
- `MerkenIOS/Features/Project/WordListView.swift`
- `MerkenIOS/Features/Quiz/QuizView.swift`
- `MerkenIOS/Features/Quiz/QuizViewModel.swift`
- `MerkenIOS/Features/Quiz2/Quiz2View.swift`
- `MerkenIOS/Features/Search/SearchView.swift`
- `MerkenIOS/Features/Settings/SettingsView.swift`
- `MerkenIOS/Features/Stats/StatsView.swift`
- `MerkenIOS/Features/Stats/StatsViewModel.swift`
- `MerkenIOS/Features/Support/ContactView.swift`
- `MerkenIOS/Features/Support/PrivacyView.swift`
- `MerkenIOS/Features/Support/TermsView.swift`
- `MerkenIOS/Services/WebAPIClient.swift`

