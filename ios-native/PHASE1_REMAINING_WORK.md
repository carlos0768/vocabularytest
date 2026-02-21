# MERKEN iOS Native Phase 1 残作業ドキュメント

最終更新: 2026-02-21
対象: `/Users/haradakarurosukei/Desktop/Working/englishvo/ios-native`

## 1. 目的
- Phase 1（Home / Projects / 4択Quiz / Auth / Guest+Proデータ運用）を完了判定に持っていくための残タスクを、実装ベースで明確化する。
- 「何を直すか」だけでなく、「どのファイルに」「どの順番で」「何をもって完了とするか」を固定する。

## 2. 現状サマリ
すでに実装済み:
- 新規ネイティブプロジェクト、SwiftData + Supabase REST 連携、Repository Router
- Home / Project List / Project Detail / Quiz / Settings の基本画面
- 単語 CRUD、Quiz status 更新ロジック、ユニットテスト（Router/QuizEngine/Mapper）

未完了/要修正:
- Liquid Glass 本実装の不整合（暫定軽量UIが残存）
- セッション切れ時の仕様不一致（ゲストフォールバック動作）
- テストターゲット設定不備で `xcodebuild test` が失敗
- UIテスト不足（起動確認のみ）
- Quiz完了後の画面反映導線が不安定な経路
- iPhone専用設定の徹底不足（iPad family 設定が一部残存）
- `project.yml` と `xcodeproj` の設定ドリフト

## 3. 完了判定（Phase 1 Done）
以下を全て満たした時点を Done とする。

1. Liquid Glass 要件
- 主要UI（カード、CTA、主要操作面）に `.glassEffect()` を適用。
- 複数ガラス要素は `GlassEffectContainer` で管理。
- ガラス代替実装コメント/実装が残っていない。

2. 機能要件
- Guest: ローカル保存で Project/Word/Quiz が完走できる。
- Pro: ログイン後、`active + pro` 時のみクラウド読み書きが有効。
- 非Proログインはローカル運用を継続。
- セッション切れ時は再ログイン導線を提示（勝手に guest へ降格しない）。

3. テスト要件
- `xcodebuild test` が通る。
- Unit: Router / Quiz status / Supabase DTO mapping が通る。
- UI Test: ゲスト一連導線、Pro導線、Quiz完了後反映が通る。

4. QA 要件
- `QA_CHECKLIST.md` の全チェック完了。

## 4. 残タスク詳細

### R-001: Liquid Glass 本実装へ戻す
優先度: P0

背景:
- 現在は GPU stall 回避のため、`GlassSurface.swift` が擬似背景へ置換されている。

対象ファイル:
- `/Users/haradakarurosukei/Desktop/Working/englishvo/ios-native/MerkenIOS/DesignSystem/GlassSurface.swift`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/ios-native/MerkenIOS/Features/Home/HomeView.swift`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/ios-native/MerkenIOS/Features/Project/ProjectListView.swift`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/ios-native/MerkenIOS/Features/Project/ProjectDetailView.swift`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/ios-native/MerkenIOS/Features/Quiz/QuizView.swift`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/ios-native/MerkenIOS/Features/Settings/SettingsView.swift`

実装方針:
1. `GlassCard` / `GlassPane` / ボタン系スタイルを `.glassEffect()` ベースに戻す。
2. 各画面で連続配置されるガラス要素を `GlassEffectContainer` で束ねる。
3. インタラクティブ要素は `.buttonStyle(.glass)` / `.buttonStyle(.glassProminent)` へ統一。
4. 体感遅延が再発する箇所は、描画回数削減（要素数削減・Lazy化）で対処し、代替UIには戻さない。

受け入れ条件:
- `rg -n "glassEffect|GlassEffectContainer|buttonStyle\\(\\.glass|\\.glassProminent\\)"` で主要画面に適用が確認できる。
- `GlassSurface.swift` の「lightweight replacement」コメントが撤去されている。

---

### R-002: セッション切れ仕様の是正
優先度: P0

背景:
- 現状 `refreshAuthState` 失敗時に `repositoryMode = .guestLocal` へフォールバックしている。
- 要件では、セッション切れ時は再ログイン導線を提示し、自動でゲストに落とさない。

対象ファイル:
- `/Users/haradakarurosukei/Desktop/Working/englishvo/ios-native/MerkenIOS/App/AppState.swift`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/ios-native/MerkenIOS/Features/Settings/SettingsView.swift`

実装方針:
1. `AuthServiceError.sessionExpired` を明示判定。
2. `session` は保持しない（または invalid 扱いにして再認証必須状態へ遷移）。
3. `repositoryMode` を暗黙 `guestLocal` に変更しない。
4. UI上で「セッション期限切れ。再ログインしてください」を表示し、再ログイン導線を強制。

受け入れ条件:
- セッション期限切れを再現したとき、データ保存先が勝手に guestLocal へ切り替わらない。
- Settings 上で再ログイン案内が必ず表示される。

---

### R-003: テストターゲット修正（Info.plist 問題）
優先度: P0

背景:
- `xcodebuild test` が以下で失敗:
  - `MerkenIOSTests`: Info.plist なし
  - `MerkenIOSUITests`: Info.plist なし

対象ファイル:
- `/Users/haradakarurosukei/Desktop/Working/englishvo/ios-native/MerkenIOS.xcodeproj/project.pbxproj`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/ios-native/project.yml`

実装方針:
1. テスト2ターゲットに `GENERATE_INFOPLIST_FILE = YES` を付与。
2. 可能なら `project.yml` 側に同設定を反映し、再生成後も崩れないようにする。
3. `xcodebuild test` で再検証。

受け入れ条件:
- `xcodebuild -scheme MerkenIOS ... test` が build setting エラーなしで実行開始できる。

---

### R-004: UIテスト拡充（受け入れ導線）
優先度: P0

背景:
- 現在 UI Test は起動確認のみで、Phase 1 受け入れ要件を担保できない。

対象ファイル:
- `/Users/haradakarurosukei/Desktop/Working/englishvo/ios-native/MerkenIOSUITests/MerkenIOSUITests.swift`

実装方針:
1. `testGuestFlow_CreateProject_AddWord_CompleteQuiz` を追加。
2. `testQuizCompletionReflectsWordStatus` を追加。
3. `testProLoginCloudReadWrite`（テスト用アカウント/fixture 前提）を追加。
4. アクセシビリティ識別子を不足画面に追加して、UIテスト安定化。

受け入れ条件:
- 追加した UI テストが CI/ローカルで再現可能に通る。

---

### R-005: Quiz完了後の反映整合
優先度: P0

背景:
- 一部画面が `task(id: appState.repositoryMode)` 基準になっており、Quiz完了後に再読込しない経路がある。

対象ファイル:
- `/Users/haradakarurosukei/Desktop/Working/englishvo/ios-native/MerkenIOS/Features/Home/HomeView.swift`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/ios-native/MerkenIOS/Features/Project/ProjectDetailView.swift`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/ios-native/MerkenIOS/Features/Quiz/QuizViewModel.swift`

実装方針:
1. Quiz 完了時 `state.bumpDataVersion()` をトリガーに、戻り先が再評価される設計へ統一。
2. `.task(id: ...)` / `onChange` のどちらかで、`dataVersion` を正しく購読。
3. 不要な全件 reload は避けつつ、最低限ステータス反映を保証。

受け入れ条件:
- Quiz 完了直後に Project/Home で status/件数が更新される。

---

### R-006: iPhone専用設定の統一
優先度: P1

背景:
- 一部 build settings に `TARGETED_DEVICE_FAMILY = "1,2"` が残っている。

対象ファイル:
- `/Users/haradakarurosukei/Desktop/Working/englishvo/ios-native/MerkenIOS.xcodeproj/project.pbxproj`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/ios-native/project.yml`

実装方針:
1. 全ターゲットで iPhone 前提を確認。
2. app target の device family は `1` に統一。
3. 設定差分が再生成で戻らないよう `project.yml` を正とする。

受け入れ条件:
- Build settings で iPad 対象が混入しない。

---

### R-007: project.yml と xcodeproj の同期
優先度: P1

背景:
- `project.yml` と実際の `pbxproj` に差異があり、設定ドリフトが発生している（例: Swift version）。

対象ファイル:
- `/Users/haradakarurosukei/Desktop/Working/englishvo/ios-native/project.yml`
- `/Users/haradakarurosukei/Desktop/Working/englishvo/ios-native/MerkenIOS.xcodeproj/project.pbxproj`

実装方針:
1. `project.yml` に現行の正設定を寄せる（Swift version、tests info plist、device family 等）。
2. `xcodegen generate --spec project.yml` で再生成。
3. 差分レビュー後、ビルド・テスト再実行。

受け入れ条件:
- 再生成後に手編集が不要な状態。

---

### R-008: QAチェックリスト実査
優先度: P1

背景:
- チェックリストは作成済みだが未消化。

対象ファイル:
- `/Users/haradakarurosukei/Desktop/Working/englishvo/ios-native/QA_CHECKLIST.md`

実装方針:
1. Build/Launch, Guest, Pro, Failure Modes, Visual を順に実機で確認。
2. 各項目の証跡（スクショ/ログ/再現手順）を残す。
3. チェックを埋めて完了状態を共有する。

受け入れ条件:
- 全チェック項目が埋まる。

## 5. 実行順（推奨）
1. R-003 テストターゲット修正
2. R-001 Liquid Glass 本実装
3. R-002 セッション切れ仕様修正
4. R-005 Quiz完了反映整合
5. R-004 UIテスト拡充
6. R-006 iPhone専用設定統一
7. R-007 project.yml / xcodeproj 同期
8. R-008 QA実査と完了記録

## 6. 実行コマンド（作業者向け）
```bash
cd /Users/haradakarurosukei/Desktop/Working/englishvo/ios-native

# プロジェクト再生成（必要時）
xcodegen generate --spec project.yml

# ビルド
xcodebuild \
  -scheme MerkenIOS \
  -project /Users/haradakarurosukei/Desktop/Working/englishvo/ios-native/MerkenIOS.xcodeproj \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.2' \
  -configuration Debug build

# テスト
xcodebuild \
  -scheme MerkenIOS \
  -project /Users/haradakarurosukei/Desktop/Working/englishvo/ios-native/MerkenIOS.xcodeproj \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.2' \
  test

# Liquid Glass 適用確認
rg -n "glassEffect|GlassEffectContainer|buttonStyle\\(\\.glass|\\.glassProminent\\)" \
  /Users/haradakarurosukei/Desktop/Working/englishvo/ios-native/MerkenIOS -g'*.swift'
```

## 7. リスクと対策
- リスク: Liquid Glass 復帰で再び操作遅延が出る。
  - 対策: まず構造を `GlassEffectContainer + Lazy` に寄せる。必要なら画面ごとの要素数削減で対処。
- リスク: セッション期限切れ実装が曖昧でデータモード切替が混線する。
  - 対策: `sessionExpired` を独立状態として扱い、UIで再認証を強制する。
- リスク: UIテストが flaky で不安定。
  - 対策: アクセシビリティID整備、待機条件を `exists/hittable` ベースに固定。

## 8. 変更管理ルール
- `project.yml` を設定の正とし、`pbxproj` 直編集後は必ず再生成整合を確認する。
- 受け入れ条件を満たさない変更はマージしない。
- パフォーマンス問題の対処で要件（Liquid Glass必須）を破る場合は、暫定対応として明示し期限を切る。
