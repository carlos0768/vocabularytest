# Internal QA Checklist (Phase 1)

現ブランチのWebモバイル寄せ変更は `IOS_WEB_PARITY_CHANGELOG.md` も併せて確認すること。

## Build / Launch
- [x] iPhone 17 Pro Simulator で `MerkenIOS` がビルド・起動成功する（2026-05-10 `build_run_sim`）
- [ ] Xcode 26 + iOS 26 SDK で `MerkenIOS` が実機ビルド成功する
- [ ] iPhone 実機で起動し、クラッシュしない
- [ ] 主要画面で Glass スタイルが適用されている（toolbar ボタン、カード背景）

## Guest Local Flow
- [ ] 初回起動でゲストIDが生成される
- [ ] 単語帳作成 → 単語追加/編集/削除ができる
- [ ] 4択クイズ完了まで進行できる
- [ ] クイズ後に単語ステータスが反映される（HomeView/ProjectDetailView が dataVersion を監視）

## Pro Cloud Flow
- [ ] Pro アカウントでサインインできる
- [ ] `projects` / `words` の読み書きが Supabase 上で反映される
- [ ] 非Proログイン時にクラウド書き込みしない

## Failure Modes
- [ ] セッション切れ時に再ログイン案内バナーを表示する（SettingsView）
- [ ] セッション切れ時に repositoryMode を変更しない
- [ ] ネットワーク断時にエラー表示と再試行導線がある
- [ ] 空データ時に初回案内が表示される

## Visual
- [ ] ダークテーマで文字コントラストが十分
- [ ] iPhone Portrait で崩れがない
- [ ] `.buttonStyle(.plain)` が MerkenIOS/ 内に残っていないこと

## Web Mobile Parity Regression
- [ ] Home: 単語帳なし状態でWeb相当の空状態ガイドが表示される
- [ ] Home: マイ単語帳の表示数が5件で揃っている
- [ ] Home: Webにない共有単語帳セクションが表示されない
- [ ] Project List: 新規ボタンが表示されない
- [ ] Project Detail: チェックボックス3個が連結して見えない
- [ ] Project Detail: 単語詳細がページ遷移ではなくミニウィンドウで開く
- [ ] Project Detail: 単語帳ページ内の主要ボタンが太すぎない
- [ ] Flashcard: Web版と同等の単語情報が表示される
- [ ] Quiz: 正解/不正解の選択肢が鮮明な緑/赤で識別できる
- [ ] Quiz: 次へボタンがWeb相当の太さで表示される
- [ ] Stats: 進歩ページがWebモバイル版の構成に寄っている
- [ ] Account: サポート/規約/プライバシーがWeb参考の内容になっている
- [ ] Shared Bookshelf: 一覧タイトル位置が下がりすぎていない
- [ ] Shared Bookshelf: 共有単語帳カードがホームの単語帳カードと揃っている
- [ ] Shared Bookshelf: 公開共有単語帳が欠けずに表示される
- [ ] Shared Bookshelf: アプリキル後もキャッシュから即時表示される
- [ ] Bookmark: 全画面でアクティブbookmark色が緑に統一されている

## UI Tests
- [ ] `testLaunch` — アプリ起動・タブバー表示確認
- [ ] `testGuestFlow_CreateProject_AddWord_CompleteQuiz` — ゲスト導線E2E
- [ ] `testQuizCompletionReflectsWordStatus` — ホーム画面クラッシュなし確認
- [ ] `testProLoginCloudReadWrite` — Pro サインイン（環境変数なしでスキップ）
