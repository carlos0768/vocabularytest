# Studyplus連携 設計ドキュメント

## 概要

Studyplus（スタディプラス）は日本最大級の学習記録SNSアプリ。MERKENのクイズ学習記録をStudyplusへ自動投稿することで、ユーザーの学習モチベーション維持と外部コミュニティへの露出を実現する。

## 連携で実現できること

| できること | できないこと |
|-----------|-------------|
| 学習時間の投稿（秒単位） | Studyplusの学習データ読み取り |
| 学習量の投稿（単語数） | ユーザープロフィール取得 |
| コメント付き投稿 | フレンド一覧・タイムライン取得 |
| 学習日時の指定 | Studyplus内の教材情報取得 |

**API方向: 書き込み専用（Write-only）**

## 対応プラットフォーム

| | iOS | Android | Web (PWA) |
|---|---|---|---|
| SDK | [Studyplus-iOS-SDK v4.0.0](https://github.com/studyplus/Studyplus-iOS-SDK) | [Studyplus-Android-SDK v4.0.2](https://github.com/studyplus/Studyplus-Android-SDK) | **非対応** |
| 言語 | Swift 5.1+ | Kotlin | - |
| 最小OS | iOS 11.0 | Android 6 (API 23) | - |
| インストール | SPM / CocoaPods | JitPack (Gradle) | - |
| ライセンス | MIT | MIT | - |

> Web版のREST APIは公開されていないため、PWA版での連携は不可。iOSネイティブアプリからのみ実装可能。

## 前提条件

1. **Studyplusアプリ**がユーザー端末にインストールされていること
2. **Consumer Key / Consumer Secret** を Studyplus から取得済みであること

### API利用申請

- 申請フォーム: https://form.run/@studyplusapi
- 無料
- 申請時に`amount`フィールドの単位を指定する（MERKENの場合: **「単語」**）
- 承認後、Consumer Key と Consumer Secret がメールで届く

## APIエンドポイント

```
POST https://external-api.studyplus.jp/v1/study_records
Authorization: OAuth {accessToken}
Content-Type: application/json; charset=utf-8
```

### リクエストボディ

| フィールド | 型 | 必須 | 説明 |
|-----------|---|------|------|
| `duration` | Int | Yes | 学習時間（秒）。0〜86400（24時間） |
| `amount` | Int | No | 学習量（申請時に指定した単位）。MERKENでは単語数 |
| `comment` | String | No | コメント（例: 「MERKENで20単語クイズ完了」） |
| `record_datetime` | String (ISO 8601) | No | 学習日時。デフォルト: 現在時刻 |
| `start_position` | Int | No | 開始位置（range指定時） |
| `end_position` | Int | No | 終了位置（range指定時、start以上） |

## iOS SDK 実装詳細

### 1. インストール（SPM推奨）

Xcode → File → Add Package Dependencies:
```
https://github.com/studyplus/Studyplus-iOS-SDK
```

### 2. Info.plist設定

```xml
<!-- Consumer credentials -->
<key>StudyplusSDK</key>
<dict>
  <key>consumerKey</key>
  <string>YOUR_CONSUMER_KEY</string>
  <key>consumerSecret</key>
  <string>YOUR_CONSUMER_SECRET</string>
</dict>

<!-- URL scheme for OAuth callback -->
<!-- URL Types に studyplus-{consumerKey} を追加 -->

<!-- Studyplusアプリの存在確認用 -->
<key>LSApplicationQueriesSchemes</key>
<array>
  <string>studyplus</string>
</array>
```

### 3. 認証フロー

```
MERKENアプリ                    Studyplusアプリ
    |                                |
    |-- login() ------URL scheme---->|
    |   studyplus://external_app/    |
    |   auth/{key}/{secret}          |
    |                                |-- ユーザーが認証承認
    |<--callback URL scheme---------|
    |   studyplus-{key}://           |
    |   auth-result/success/{token}  |
    |                                |
    |-- handle(url) -> token保存     |
    |   (Keychainに保存)             |
```

Studyplusアプリ未インストール時: App Storeへリダイレクト

### 4. SDK API

```swift
// シングルトン
Studyplus.shared

// 認証
Studyplus.shared.login()                    // OAuth開始
Studyplus.shared.logout()                   // トークン削除
Studyplus.shared.isConnected() -> Bool      // 接続状態確認
Studyplus.shared.handle(_ url: URL) -> Bool // コールバック処理

// デリゲート
Studyplus.shared.delegate = self  // StudyplusLoginDelegate

// 学習記録投稿
Studyplus.shared.post(_ record: StudyplusRecord, 
    completion: @escaping (Result<Void, StudyplusPostError>) -> Void)
```

### 5. StudyplusRecord

```swift
// 基本（時間 + コメント）
StudyplusRecord(duration: 120, comment: "MERKENで英単語学習")

// 学習量付き
StudyplusRecord(duration: 120, amount: 20, comment: "20単語クイズ完了")

// 範囲指定付き
StudyplusRecord(duration: 120, startPosition: 1, endPosition: 50, comment: nil)
```

### 6. エラーハンドリング

```swift
enum StudyplusPostError: Error {
    case invalidDuration   // duration が 0〜86400 の範囲外
    case offline           // ネットワーク未接続
    case badRequest        // HTTP 400
    case loginRequired     // HTTP 401（トークン自動削除）
    case serverError       // HTTP 500-599
    case unknown(String)   // その他
}

enum StudyplusLoginError: Error {
    case unknownUrl(URL)       // 不明なコールバックURL
    case keychainError         // Keychain保存エラー
    case applicationError      // Studyplusアプリがエラー返却
    case cancel                // ユーザーがキャンセル
}
```

## MERKEN統合設計

### 投稿タイミング

| トリガー | duration | amount | comment |
|---------|----------|--------|---------|
| クイズ完了時 | クイズ所要時間(秒) | 出題単語数 | 「MERKENで{n}単語クイズ完了 ✅{correct}/{total}」 |
| スキャン完了時 | 抽出処理時間(秒) | 抽出単語数 | 「MERKENで{n}単語を抽出」 |

> クイズ完了時のみにするか、スキャンも含めるかは要検討。過剰投稿はStudyplus側で嫌われる可能性あり。

### UI設計

#### 設定画面に追加する項目

```
[Studyplus連携]
  ┌─────────────────────────────────┐
  │ Studyplus    [接続する] / [接続済み ✓] │
  │ クイズ結果を自動投稿  [ON/OFF]        │
  └─────────────────────────────────┘
```

- **接続ボタン**: `Studyplus.shared.login()` を呼ぶ
- **接続済み表示**: `Studyplus.shared.isConnected()` で判定
- **自動投稿トグル**: UserDefaults に保存
- **接続解除**: `Studyplus.shared.logout()` + 確認ダイアログ

### iOS実装コード例

```swift
import StudyplusSDK

// MARK: - Studyplus連携マネージャー
final class StudyplusManager {
    static let shared = StudyplusManager()
    
    /// 自動投稿が有効か
    var isAutoPostEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: "studyplus_auto_post") }
        set { UserDefaults.standard.set(newValue, forKey: "studyplus_auto_post") }
    }
    
    /// Studyplusに接続済みか
    var isConnected: Bool {
        Studyplus.shared.isConnected()
    }
    
    /// OAuth認証を開始
    func connect() {
        Studyplus.shared.login()
    }
    
    /// 接続を解除
    func disconnect() {
        Studyplus.shared.logout()
        isAutoPostEnabled = false
    }
    
    /// OAuthコールバックを処理
    func handleURL(_ url: URL) -> Bool {
        Studyplus.shared.handle(url)
    }
    
    /// クイズ完了時に学習記録を投稿
    func postQuizResult(
        durationSeconds: Int,
        wordCount: Int,
        correctCount: Int,
        totalCount: Int
    ) {
        guard isConnected, isAutoPostEnabled else { return }
        
        let comment = "MERKENで\(wordCount)単語クイズ完了 ✅\(correctCount)/\(totalCount)"
        let record = StudyplusRecord(
            duration: durationSeconds,
            amount: wordCount,
            comment: comment
        )
        
        Studyplus.shared.post(record) { result in
            switch result {
            case .success:
                break // サイレント成功
            case .failure(.loginRequired):
                // トークン失効 → 再認証が必要な旨をユーザーに通知
                self.isAutoPostEnabled = false
                NotificationCenter.default.post(
                    name: .studyplusReauthRequired, object: nil
                )
            case .failure:
                break // その他のエラーはサイレント無視
            }
        }
    }
}

extension Notification.Name {
    static let studyplusReauthRequired = Notification.Name("studyplusReauthRequired")
}
```

### AppDelegateでのコールバック処理

```swift
// AppDelegate.swift or SceneDelegate.swift
func application(_ app: UIApplication, open url: URL,
                 options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    if StudyplusManager.shared.handleURL(url) {
        return true
    }
    // ... other URL handlers
    return false
}
```

## 実装ステップ

### Phase 1: 申請・準備
1. [ ] https://form.run/@studyplusapi でAPI利用申請（単位: 「単語」）
2. [ ] Consumer Key / Secret を受け取り
3. [ ] 環境変数 or Info.plist に安全に格納

### Phase 2: iOS実装
4. [ ] SPMで `Studyplus-iOS-SDK` を追加
5. [ ] Info.plist に ConsumerKey/Secret、URL Scheme、LSApplicationQueriesSchemes を設定
6. [ ] `StudyplusManager` を実装
7. [ ] AppDelegate に URL callback handler を追加
8. [ ] 設定画面に「Studyplus連携」セクションを追加
9. [ ] クイズ完了フローに投稿処理を組み込み

### Phase 3: テスト
10. [ ] Studyplusアプリインストール済み端末でOAuth認証テスト
11. [ ] 学習記録投稿 → Studyplusアプリで表示確認
12. [ ] Studyplusアプリ未インストール時のフォールバック確認
13. [ ] トークン失効時の再認証フロー確認
14. [ ] 自動投稿ON/OFF切替の動作確認

### Phase 4: リリース
15. [ ] App Store審査提出時にStudyplus連携を説明に追加
16. [ ] リリースノートに記載

## 注意事項

- **Web版では連携不可**: SDKがモバイル専用のため、PWA版には実装できない
- **Studyplusアプリ必須**: ユーザー端末にStudyplusがインストールされていないとOAuth認証ができない（App Storeへ誘導される）
- **過剰投稿に注意**: 1日に大量の学習記録を投稿するとStudyplus側でスパム扱いされる可能性あり。投稿頻度に制限を設けることを推奨
- **トークン管理**: SDKがKeychainに自動保存するため、独自のトークン管理は不要
- **Pro/Free共通**: Studyplus連携はサブスクリプションに関係なく全ユーザーに提供可能（差別化ポイントにしない）
