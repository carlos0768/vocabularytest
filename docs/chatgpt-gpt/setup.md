# ChatGPT連携 (Custom GPT + Actions) セットアップ手順

ChatGPTの会話から「この単語MERKENに追加して」でユーザー自身の単語帳に単語を登録できるようにする、Custom GPTのセットアップ手順。

## 仕組みの概要

```
ChatGPTアプリ → [Sign in to www.merken.jp] → /oauth/authorize (同意画面)
  → POST /api/oauth/authorize → 認可コード発行 → ChatGPT callbackへ
  → ChatGPT → POST /api/oauth/token → Supabase access/refresh token
  → 以降 Bearer付きで GET/POST /api/chatgpt/projects, POST /api/chatgpt/words
```

- 認証はOAuth 2.0 authorization code flow(per-user)。ユーザーごとに自分のMERKENアカウントでログインする。
- **トークンの権限に関する注意**: トークンエンドポイントが返すのは通常のSupabaseセッション(access/refresh token)であり、`/api/chatgpt/*` に限らずBearer認証を受け付ける全APIルートに対して「ログイン中の本人」として機能する。`words` スコープは表示用でサーバー側では強制していない。同意画面でもその旨を開示している。
- 単語追加は**Pro限定**。Freeユーザーは接続はできるが、API呼び出し時に403(`code: PRO_REQUIRED`)が返る。
- 単語の日本語訳・例文・発音・クイズ誤答選択肢は**すべてChatGPT側で生成**する。サーバー側ではAI生成(訳のバックフィル・lexicon解決・語順クイズprefill)を一切行わないため、AI APIコストは発生しない。

## 1. サーバー側の環境変数を設定する

Vercelに以下を設定する(`.env.example`参照):

| 変数 | 値 |
|------|-----|
| `CHATGPT_OAUTH_CLIENT_ID` | 任意のクライアントID(例: `merken-chatgpt`) |
| `CHATGPT_OAUTH_CLIENT_SECRET` | ランダムな長い秘密文字列(例: `openssl rand -base64 48`。URLセーフな文字のみ推奨) |
| `CHATGPT_OAUTH_ALLOWED_REDIRECT_URIS` | 手順3で判明するcallback URL(カンマ区切り、後で設定) |

## 2. Custom GPTを作成する

ChatGPT(有料プラン必須)で GPTs → Create から作成する。

- **Name**: MERKEN単語帳
- **Description**: 会話に出てきた英単語をあなたのMERKEN単語帳に追加します
- **Instructions**: 後述の「GPT Instructions」を貼り付け
- **Actions**: 「Create new action」→ Schemaに `docs/chatgpt-gpt/openapi.json` の内容を貼り付け
- **Privacy policy**: `https://www.merken.jp/privacy`

### Actionsの認証設定

Authentication で「OAuth」を選択し、以下を入力する:

| 項目 | 値 |
|------|-----|
| Client ID | `CHATGPT_OAUTH_CLIENT_ID` と同じ値 |
| Client Secret | `CHATGPT_OAUTH_CLIENT_SECRET` と同じ値 |
| Authorization URL | `https://www.merken.jp/oauth/authorize` |
| Token URL | `https://www.merken.jp/api/oauth/token` |
| Scope | `words` (表示用。サーバー側でスコープ制限は行わない — 上記「トークンの権限に関する注意」参照) |
| Token Exchange Method | Default (POST request) |

## 3. Callback URLを許可リストに登録する

OAuth設定を**保存した後**、GPTエディタにcallback URLが表示される
(形式: `https://chat.openai.com/aip/{g-GPT-ID}/oauth/callback`)。

モバイルアプリが `chatgpt.com` ドメインを使う場合があるため、**両ドメインを登録する**:

```
CHATGPT_OAUTH_ALLOWED_REDIRECT_URIS=https://chat.openai.com/aip/g-XXXX/oauth/callback,https://chatgpt.com/aip/g-XXXX/oauth/callback
```

> **注意**: OAuth設定(Client ID/Secret/URL等)を変更するとcallback URLが変わることがある。変更したら必ずこの環境変数を更新して再デプロイすること。

## 4. 動作確認

1. 作成したGPTとの会話で「resilientをMERKENに追加して」と送る
2. 「Sign in to www.merken.jp」ボタン → MERKENログイン → 同意画面で「許可する」
3. ChatGPTが単語帳一覧を取得し、追加先を確認してから `addWords` を呼ぶ
4. MERKENアプリ側は次回の全体同期(アプリ起動/リロード)後に単語帳へ反映される

curlでの手動確認手順は本ドキュメント末尾を参照。

## GPT Instructions(貼り付け用)

```
あなたは英語学習アプリMERKENの単語帳アシスタントです。役目は2つ: (1) 会話に出てきた英単語をユーザーのMERKEN単語帳に追加する、(2) ユーザーがMERKENのクイズでよく間違える「苦手な単語」を取得して復習を手伝う。

## 単語追加の手順
1. ユーザーが単語の追加を頼んだら、対象の単語を特定する(「この単語」「今の会話の単語」等の指示も文脈から解決する)。
2. listWordbooksで単語帳一覧を取得し、どの単語帳に追加するかをユーザーに確認する。ユーザーが指定しない場合は「ChatGPTで学んだ単語」という単語帳を使う(なければcreateWordbookで作成)。一度決めた追加先は同じ会話では再確認しない。
3. 各単語について以下を自分で生成し、addWordsで一括追加する:
   - japanese: 会話の文脈に合う簡潔な日本語訳(必須)
   - exampleSentence / exampleSentenceJa: 自然な英語例文とその日本語訳。可能なら会話の文脈を反映する
   - pronunciation: IPA発音記号
   - partOfSpeechTags: 品詞(noun, verb, adjective, adverb, idiom等の英語表記)
   - distractors: 4択クイズ用の誤答3つ。必ず「正解とは別の英単語の日本語訳」から作り、紛らわしいものを選ぶ。出題語自身が持つ別の意味は絶対に使わない
4. 追加が成功したら、追加した単語と訳の一覧を簡潔に報告する。

## 苦手な単語での復習
1. 「苦手な単語で練習したい」「よく間違える単語を復習させて」「弱点を教えて」等の依頼があったら、getStrugglingWordsを呼ぶ(誤答回数が多い順に返る)。
2. 取得した単語を使って、ユーザーの希望に合わせた復習を行う: 4択や和訳のクイズを出す、例文や短い文章を作る、その単語を織り込んだ英会話練習をする、覚え方(語源・連想)を提案する。
3. クイズを出す場合は1問ずつ出題し、答え合わせのたびに正誤と解説を短く添える。
4. 誤答回数(missCount)が多い単語を優先しつつ、一度に扱うのは5〜10語程度にする。
5. 苦手な単語が0件のときは、まだクイズの誤答データがないことを伝え、MERKENアプリでのクイズ学習を勧める。

## エラー対応
- 401: MERKENへのサインインが必要と案内する。
- 403でcode=PRO_REQUIREDの場合: この機能はMERKEN Pro限定であることを伝え、https://www.merken.jp/subscription でのアップグレードを案内する。
- その他のエラー: 内容を短く伝え、少し時間を置いて再試行を提案する。

## 禁止事項
- projectIdを推測・捏造しない(必ずlistWordbooks/createWordbookの結果を使う)。
- ユーザーが頼んでいない単語を勝手に追加しない。
- 1回のaddWordsで100語を超えて送らない。
```

## curlでの手動E2E確認

```bash
# 1. ブラウザでログイン済みのcookieを使い、認可コードを発行
curl -s -X POST https://www.merken.jp/api/oauth/authorize \
  -H 'Content-Type: application/json' \
  -H 'Cookie: <ログイン済みセッションcookie>' \
  -d '{"clientId":"merken-chatgpt","redirectUri":"<許可済みcallback URL>","state":"test"}'
# → redirectUrl の ?code=... を控える

# 2. コードをトークンに交換
curl -s -X POST https://www.merken.jp/api/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=authorization_code&code=<code>&redirect_uri=<同じcallback URL>&client_id=merken-chatgpt&client_secret=<secret>'
# → access_token / refresh_token

# 3. 単語帳一覧
curl -s https://www.merken.jp/api/chatgpt/projects \
  -H 'Authorization: Bearer <access_token>'

# 3b. 苦手な単語(誤答回数の多い順)
curl -s 'https://www.merken.jp/api/chatgpt/struggling-words?limit=10' \
  -H 'Authorization: Bearer <access_token>'

# 4. 単語追加
curl -s -X POST https://www.merken.jp/api/chatgpt/words \
  -H 'Authorization: Bearer <access_token>' -H 'Content-Type: application/json' \
  -d '{"words":[{"projectId":"<単語帳ID>","english":"resilient","japanese":"回復力のある","distractors":["頑固な","無関心な","疲弊した"]}]}'

# 5. リフレッシュ
curl -s -X POST https://www.merken.jp/api/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=refresh_token&refresh_token=<refresh_token>&client_id=merken-chatgpt&client_secret=<secret>'
```
