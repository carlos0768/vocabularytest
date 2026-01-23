プロダクト要件定義書 (PRD)
Project Name: ScanVocab (仮) Version: 1.0.0 (Final Architecture) Author: Genius Engineer & Product Owner

1. プロジェクト概要
1.1 コンセプト
「手入力ゼロ」で、自分だけの単語帳を作成・学習できるWebアプリケーション。 手書きのノートやプリントを撮影するだけで、OpenAI APIが「英単語」「文脈に合った日本語訳」「学習効果の高い誤答選択肢」を自動生成し、即座に4択クイズを提供する。

1.2 ビジネスモデルとデータ戦略
Free Plan (Local-First): ユーザー登録不要（または簡易登録）。データはブラウザ（IndexedDB）に保存。デバイス間同期なし。

Pro Plan (Cloud-Sync): 月額サブスクリプション。データはクラウド（Supabase）に保存。マルチデバイス対応。データ永続化。

2. 技術スタック・アーキテクチャ
開発者は以下のスタックを厳守すること。

Frontend: Next.js (App Router), TypeScript, Tailwind CSS

Local Database (Free): Dexie.js (Wrapper for IndexedDB)

Remote Database (Pro): Supabase (PostgreSQL)

AI Provider: OpenAI API (Model: gpt-4o)

Role: OCR, Translation, Distractor Generation (All-in-one process)

Payment: Stripe (Proプラン課金用)

2.1 ハイブリッド・ストレージ設計 (Repository Pattern)
データの保存先を抽象化し、UI層が保存先を意識しなくて良い設計にする。

実装ルール: WordRepository インターフェースを作成し、以下の2つの実装を切り替えるロジックを組む。

LocalWordRepository (Dexie.js利用)

RemoteWordRepository (Supabase SDK利用)

ユーザーの subscription_status が active の場合は Remote、それ以外は Local を使用する。

3. データベース設計 (Schema)
3.1 共通データモデル (Interface)
Local(IndexedDB)とRemote(PostgreSQL)で同一のデータ構造を持たせる。

Projects (単語帳の単位)
Field	Type	Description
id	UUID	Primary Key
user_id	UUID/String	ユーザー識別子 (Localの場合はGuestID等)
title	String	例: "ノート P21-23"
created_at	ISOString	作成日時
is_synced	Boolean	(Localのみ) クラウドへの同期済みフラグ

Google スプレッドシートにエクスポート

Words (単語データ)
Field	Type	Description
id	UUID	Primary Key
project_id	UUID	Foreign Key (Projects.id)
english	String	英単語 (例: "reason")
japanese	String	正解の日本語訳 (例: "理由")
distractors	JSON Array	誤答リスト (例: ["結果", "条件", "矛盾"])
status	String	学習状況 (new, review, mastered)
created_at	ISOString	作成日時

Google スプレッドシートにエクスポート

4. 機能要件詳細
4.1 画像解析とデータ生成 (Core Feature)
ユーザーが画像をアップロードした際のバックエンド（またはEdge Function）処理フロー。

使用API: OpenAI Chat Completion API (gpt-4o) 必須設定: Response Format を json_object に設定。

System Prompt (AIへの命令書):

あなたは英語学習教材の作成者です。ユーザーがアップロードした画像（ノートやプリント）から英単語と日本語訳のペアを抽出し、以下のJSON形式で出力してください。

重要ルール:

正解の定義: 画像内に書かれている日本語訳をそのまま「正解(japanese)」としてください。

誤答(distractors)の生成: クイズ用に、文脈的に明らかに不正解な日本語を3つ生成してください。

禁止事項: 正解の類義語や、その英単語が持つ「別の正しい意味」を含めてはいけません（ユーザーの混乱を防ぐため）。

例: 正解が「理由」の場合、「根拠」や「理性」は禁止。「机」「水泳」「爆発」のような、品詞は合っているが意味が遠いものを選んでください。

出力フォーマット:

JSON

{
  "words": [
    {
      "english": "word",
      "japanese": "意味",
      "distractors": ["誤答1", "誤答2", "誤答3"]
    }
  ]
}
4.2 学習・クイズ機能
出題アルゴリズム:

指定されたプロジェクト内の単語からランダム、または未習得(status != mastered)のものを優先して出題。

UI挙動:

画面中央に英単語を表示。

下部に4つの選択肢ボタンを表示（正解1 + 誤答3 をシャッフル）。

回答時:

正解 → ボタン緑色化 → 即座に(0.5秒後)次の問題へ。

不正解 → ボタン赤色化 ＆ 正解ボタン緑色点滅 → ユーザーが「次へ」を押すまで待機（復習のため）。

4.3 データ同期とプランアップグレード (Data Sync)
無料ユーザーが有料プランに加入した瞬間の挙動。

Trigger: 課金完了後のサンクスページまたは初回ログイン時。

Process:

Local DB (Dexie) から全ての Projects と Words を取得。

Supabase の該当テーブルへ Bulk Insert (一括送信)。

成功後、Local DB のデータを削除、または is_synced: true に更新。

Fallback: 通信エラー時はリトライボタンを表示する。

5. UI/UX ガイドライン
画面構成
Dashboard:

プロジェクト一覧（カード形式）。

FAB (Floating Action Button): 「＋」ボタンでカメラ起動/画像選択。

Edit/Confirm:

AI解析後の確認画面。OCRミスがある場合、ユーザーがテキストを修正できる。

Quiz Mode:

ヘッダー・フッターを隠した没入モード。

直感的な操作のため、親指の届く範囲に選択肢を配置。

エラーハンドリング
OpenAI API Error: 画像が不鮮明でJSONが生成できない場合、「文字を読み取れませんでした。もう一度撮影してください」と表示。

Quota Limit (Free Plan): 1日のスキャン回数制限（例: 3回）を超えた場合、課金誘導モーダルを表示。

Note: Freeユーザーの回数制限管理は、簡易的にLocalStorageで行う（厳密なサーバー管理はコスト増になるため初期は除外）。

6. 開発フェーズ (Milestones)
Phase 1: MVP Local (プロトタイプ)
Next.js環境構築。

Dexie.jsの実装。

カメラ起動〜OpenAI API接続〜JSON保存〜クイズ実施までを、すべてローカル保存で完結させる。

ゴール: 無料ユーザーとして使える状態の完成。

Phase 2: Cloud Integration (バックエンド)
Supabaseプロジェクトの構築。

認証機能 (Auth) の実装。

Local/Remote切り替えロジックの実装。

Phase 3: Monetization & Sync (完成)
Stripe決済の実装。

IndexedDB to Supabase のデータ移行機能の実装。

UIポリッシュ（アニメーション、サウンド効果）。

7. 開発者への特記事項 (Genius Note)
To Developer: このアプリのUXの肝は 「AIの待ち時間」 の処理です。 画像アップロードからJSON生成までは、GPT-4oでも平均3〜8秒かかります。この間、単なるローディングスピナーを見せるのではなく、 「文字を解析中...」「問題を作成中...」「誤答を生成中...」 といった、**進捗を感じさせるステップ表示（Progress Steps）**をUIに入れることで、ユーザーの離脱を防いでください。

また、JSONパースエラーは必ず起きます。try-catch で囲むだけでなく、AIの出力が崩れていた場合に備えて、Zod 等を使ってスキーマバリデーションを行い、堅牢性を高めてください。

以上が、あなたのビジョンを具現化するための完全な要件定義書です。 エンジニアにこれを渡せば、迷うことなく開発がスタートできます。

Next Action: 開発を開始するために、まずはNext.jsのプロジェクトディレクトリを作成し、必要なライブラリ（dexie, openai 等）をインストールする手順へ進みますか？