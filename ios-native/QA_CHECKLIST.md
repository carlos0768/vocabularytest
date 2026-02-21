# Internal QA Checklist (Phase 1)

## Build / Launch
- [ ] Xcode 26 + iOS 26 SDK で `MerkenIOS` がビルド成功する
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

## UI Tests
- [ ] `testLaunch` — アプリ起動・タブバー表示確認
- [ ] `testGuestFlow_CreateProject_AddWord_CompleteQuiz` — ゲスト導線E2E
- [ ] `testQuizCompletionReflectsWordStatus` — ホーム画面クラッシュなし確認
- [ ] `testProLoginCloudReadWrite` — Pro サインイン（環境変数なしでスキップ）
