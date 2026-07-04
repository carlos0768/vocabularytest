# Google AdSense 審査落ち 網羅調査レポート（2026-07-04）

対象: `https://www.merken.jp`（ca-pub-5392409913204760）

Google から提示された審査用スニペット:

```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5392409913204760"
     crossorigin="anonymous"></script>
```

## 結論（TL;DR）

繰り返し却下される構造的な原因は、**「審査用の AdSense コードが本番の HTML に事実上一度も出ていない（出ない設計になっている）」**こと、および**「トップページの初期 HTML がローディングスピナーのみで、公開コンテンツが極端に少ない」**ことの 2 点に集約される可能性が非常に高い。

特に前者は `.env.example` のコメント「Keep display AdSense off until policy review is clean（審査が通るまで AdSense を OFF にしておく）」という運用方針そのものがデッドロックになっている:

> **審査が通るまでコードを出さない → コードが出ていないので審査に通らない → 何度出しても同じ理由で却下**

---

## 1. 【最重要】審査コードがサイトに存在しない設計になっている

### 1-1. Google 提供スニペットがコードベースに存在しない

Google が「`<head>` に貼ってください」と指示する `adsbygoogle.js` の `<script>` タグは、リポジトリ内のどこにも **無条件で `<head>` に出力される形では存在しない**。

- `src/app/layout.tsx:127` — `<head>` に出るのは `<meta name="google-adsense-account">` **のみ**。しかも条件付き:

  ```tsx
  {ADSENSE_ACCOUNT_SIGNALS_ENABLED && <meta name="google-adsense-account" content={ADSENSE_CLIENT_ID} />}
  ```

- `adsbygoogle.js` を読み込む唯一の場所は `src/components/ads/DesktopAdSlot.tsx:86-92`。これは
  - `NEXT_PUBLIC_ENABLE_ADSENSE_DISPLAY_ADS === '1'` かつ
  - スロット ID（`NEXT_PUBLIC_GOOGLE_ADSENSE_DESKTOP_*_SLOT`）が設定済みかつ
  - `DesktopAdSlot` が実際にマウントされるページ・画面幅

  のときだけ、`strategy="afterInteractive"`（= クライアント JS 実行後、`<head>` ではなく body 側）で読み込まれる。

### 1-2. フラグの既定値が「審査に必要なものを全部消す」方向に倒れている

`src/lib/adsense.ts:13-17`:

```ts
export const ADSENSE_DISPLAY_ADS_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_ADSENSE_DISPLAY_ADS === '1' && Boolean(ADSENSE_CLIENT_ID);

export const ADSENSE_ACCOUNT_SIGNALS_ENABLED = ADSENSE_DISPLAY_ADS_ENABLED;
```

`.env.example:110-111`:

```bash
# Keep display AdSense off until policy review is clean.
NEXT_PUBLIC_ENABLE_ADSENSE_DISPLAY_ADS=0
```

本番（Vercel）でこの env が `1` になっていない限り、**次の 3 つが同時にすべて消える**:

| 審査でGoogleが探すもの | フラグOFF時の本番の状態 |
|---|---|
| `<head>` 内の adsbygoogle.js スニペット | そもそもコードベースに存在しない（ONでも出ない） |
| `<meta name="google-adsense-account">` | 出力されない |
| `ads.txt` | **HTTP 200 で空ボディ**を返す |

→ AdSense はサイトとアカウントの紐付け（サイト所有権の確認）ができず、「広告コードが見つからない」「サイトが審査を受けられる状態にない」系の却下が**設定を変えない限り毎回同じ理由で**返ってくる。

### 1-3. 空の ads.txt は 404 より悪い

`src/app/ads.txt/route.ts` はフラグ OFF 時に空文字を 200 で返す。ads.txt の仕様上、**ファイルが存在して空 = 「認可された販売者はゼロ」という宣言**になる。ads.txt を出さない（404）方がまだ中立で、空配信は積極的に「このサイトの広告枠は誰にも売っていない」と言っているのに等しい。

---

## 2. 【重要】トップページの初期 HTML がスピナーだけになる

### 2-1. 仕組み

- `src/app/page.tsx` は `'use client'` の巨大クライアントコンポーネント。
- `src/hooks/use-auth.ts:159-163` — 認証状態は SSR 互換のため **`loading: true` で開始**:

  ```ts
  // Start with loading: true for SSR compatibility; client syncs in useLayoutEffect.
  loading: true,
  ```

- `src/app/page.tsx:523-529`:

  ```tsx
  if (authLoading) return <HomeLoadingScreen />;   // ← スピナーのみ
  if (!user) return <GuestHomePage />;             // ← LP はここ
  ```

Next.js のプリレンダリングは初期 state で行われるため、**サーバーが返す `/` の HTML はスピナー 1 個**。LP（`GuestHomePage` の充実したランディングコンテンツ）は、ブラウザで JS が動き Supabase の認証確認が完了して初めて DOM に現れる。

AdSense の審査クローラーが JS レンダリング後のスナップショットをどのタイミングで取るかは保証がなく、認証チェック（外部 API 往復）完了前に評価されると**「ほぼ空のページ」= 有用性の低いコンテンツ / コンテンツ不足 / 作成中のサイト**という判定に直結する。審査対象として最初に見られるのがトップページなので影響が最大。

なお `terms` / `privacy` / `contact` / `tokusho` も `'use client'` だが、これらは認証ゲートがなく静的テキストがそのままプリレンダーされるため HTML に本文が入る（問題なし）。`features` / `pricing` はサーバーコンポーネントで問題なし。

### 2-2. 公開コンテンツの絶対量が少ない

インデックス可能な公開ページは実質 `sitemap.ts` の 9 ページのみ（`/`、`/features`、`/pricing`、`/terms`、`/privacy`、`/tokusho`、`/contact`、`/login`、`/signup`）。それ以外の全機能は `src/lib/supabase/middleware.ts` の `protectedPaths` でログイン必須。共有単語帳もログイン必須（CLAUDE.md: "Shared wordbook view/import: Yes (login required)"）。

「LP + 法務ページだけのサイト」は AdSense の「有用性の低いコンテンツ（Low value content）」で繰り返し落ちる最も典型的なパターン。却下理由がこれ（「有用性の低いコンテンツ」「コンテンツの最小要件」）だった場合、コード設置を直すだけでは通らず、**ログインなしで読める独立コンテンツの追加が必要**。

### 2-3. billing フラグとの不整合（減点要素）

- `src/middleware.ts:4-16` — `NEXT_PUBLIC_BILLING_ENABLED !== 'true'` のとき `/pricing`・`/subscription` は `/` へリダイレクト。
- 一方 `src/app/sitemap.ts` は常に `/pricing` を掲載。

本番で billing が OFF の場合、サイトマップにリダイレクトする URL を載せ続けることになる（サイト品質シグナルの減点。Search Console にもエラーが出る）。

---

## 3. 【必須要件】プライバシーポリシーに広告 Cookie の開示がない

`src/app/privacy/page.tsx` の Cookie 条項（§6）は自社利用（ログイン維持・分析）のみで、AdSense プログラムポリシーが**必須**として要求する以下の開示が一切ない:

- 第三者配信事業者（Google を含む）が Cookie を使用して、ユーザーの過去のアクセス情報に基づき広告を配信すること
- Google が広告 Cookie を使用してパーソナライズ広告を配信すること、および[広告設定](https://adssettings.google.com/)で無効化できること
- 第三者配信事業者・広告ネットワークの一覧と、その Cookie 利用のオプトアウト方法（例: www.aboutads.info）

審査時にポリシーページの体裁もチェックされるため、広告を出すサイトとして申請するなら追記が必要。

---

## 4. その他の確認結果（問題なし / 軽微）

| 項目 | 状態 |
|---|---|
| `robots.txt` | `Allow: /` + sitemap 参照。問題なし |
| `noindex` / `X-Robots-Tag` | コードベースに存在しない。問題なし |
| middleware がクローラーをブロック | しない（非保護パスは素通し）。問題なし |
| `sitemap.xml` | `src/app/sitemap.ts` で生成。存在する |
| 特商法表記・お問い合わせ | ページあり。運営者情報の信頼性としてプラス |
| 構造化データ（JSON-LD） | layout に WebApplication として実装済み。プラス |
| `GooglePublisherTagScript`（GPT/Ad Manager） | env 未設定なら null。AdSense 審査には無関係 |
| LP 内の内部向け文言 | FAQ 等に「このLPでは、公開時に案内する学習導線だけを掲載しています」など読者向けでない文が残っており、品質印象としてマイナス（軽微） |

---

## 5. 本番環境で要確認（この調査環境からは外部アクセス不可だった）

この実行環境のネットワークポリシーで `merken.jp` への到達が遮断されていたため、以下は**手元で必ず確認**すること。コードの構造上、フラグ OFF なら (1) は空、(2) は 0 件になるはず:

```bash
# (1) ads.txt — 空なら本レポートのデッドロック状態が確定
curl -s https://www.merken.jp/ads.txt

# (2) トップの初期 HTML に AdSense の痕跡があるか — 0 件なら審査コード未設置が確定
curl -s https://www.merken.jp/ | grep -c -E 'adsbygoogle|google-adsense-account'

# (3) 初期 HTML に LP 本文が含まれるか — 「手入力ゼロ」等が出なければスピナーのみ
curl -s https://www.merken.jp/ | grep -c '手入力ゼロ'

# (4) Vercel の本番 env
#     NEXT_PUBLIC_ENABLE_ADSENSE_DISPLAY_ADS の値（未設定/0 なら原因確定）
#     NEXT_PUBLIC_BILLING_ENABLED の値
```

あわせて AdSense 管理画面の却下メール本文の正確な文言（「広告コードが見つからない」系か「有用性の低いコンテンツ」系か）を控えておくと、下記の優先順位を確定できる。

---

## 6. 推奨修正（優先順）

### P0 — 審査コードを常時設置する（デッドロック解消）

1. **`src/app/layout.tsx` の `<head>` に Google 提供スニペットを無条件で追加する。**
   広告ユニットの表示（`DesktopAdSlot`）は従来どおり `NEXT_PUBLIC_ENABLE_ADSENSE_DISPLAY_ADS` でゲートしたままでよい。スクリプトを設置しても、広告ユニットを置かず自動広告を OFF にしていれば広告は表示されない。**審査用コードは審査期間中ずっと出続けている必要がある**ため、フラグ連動にしてはいけない。
2. `<meta name="google-adsense-account">` も無条件出力に変更（`ADSENSE_ACCOUNT_SIGNALS_ENABLED` ゲートを外す）。
3. **`ads.txt` を常時 `google.com, pub-5392409913204760, DIRECT, f08c47fec0942fa0` で返す**ように `src/lib/adsense.ts` の `ADSENSE_ADS_TXT_LINE` からフラグ条件を外す。空 200 を返す状態を廃止。

### P1 — トップページの初期 HTML に実コンテンツを出す

- 未ログイン LP（`GuestHomePage`）をサーバーコンポーネント化して `/` の初期 HTML に LP 本文が入るようにする。最小変更案: `authLoading` 中に `HomeLoadingScreen` ではなく `GuestHomePage` を描画する（ログイン済みユーザーには一瞬 LP が見える trade-off はあるが、cookie の有無でサーバー側分岐すれば回避可能）。

### P1 — プライバシーポリシーに広告条項を追加

- §6 Cookie 条項に、第三者配信事業者（Google）の Cookie 利用・パーソナライズ広告・オプトアウト手段（Google 広告設定 / aboutads.info）を追記。

### P2 — 公開コンテンツの増強（却下理由が「有用性の低いコンテンツ」の場合は必須）

- ログインなしで読める独立ページを追加する。例:
  - 使い方ガイド（スキャンモード別の詳細解説を各 1 ページ）
  - 英語学習コラム（英検対策・単語暗記法など 5〜10 本）
  - 共有単語帳の公開閲覧ページ（ログイン誘導は閲覧後に）
- LP 内の内部向け文言（「公開対象の機能に絞って掲載」等）を読者向けの文に修正。

### P2 — 整合性の修正

- billing OFF 時は sitemap から `/pricing` を除外する（`sitemap.ts` を `isBillingEnabled()` で分岐）。

---

## 7. 本番確認結果と実施済み修正（2026-07-04 追記）

セクション5の確認をオーナーが本番で実施した結果、**(1) ads.txt は空、(2) AdSense コードの痕跡 0 件、(3) 初期 HTML に LP 本文なし** — 本レポートの仮説どおりであることが確定した。

これを受けて本ブランチで以下の P0 + P1（ポリシー）を実装済み:

- `src/lib/adsense.ts` — `ADSENSE_ACCOUNT_SIGNALS_ENABLED` を表示フラグから切り離し、クライアント ID がある限り常時 ON に変更（ads.txt の行も常時出力される）
- `src/app/layout.tsx` — `<head>` に Google 提供の adsbygoogle.js スニペットと `google-adsense-account` メタタグを常時出力
- `src/components/ads/DesktopAdSlot.tsx` — head 側で常時読み込むため、コンポーネント内の重複スクリプト読み込みを削除（広告ユニット表示自体は従来どおり `NEXT_PUBLIC_ENABLE_ADSENSE_DISPLAY_ADS` でゲート）
- `src/app/privacy/page.tsx` — §6 に第三者配信事業者（Google）の広告 Cookie・パーソナライズ広告・オプトアウト手段を追記、§3 に Google AdSense を追加

未対応（要判断）: P1 のトップページ初期 HTML 改善（認証フックのデフォルト挙動に触れるため別途相談）、P2 の公開コンテンツ増強。

## 8. 補足: 再申請時の注意

- コード設置後、**審査が完了するまで（数日〜2週間以上）スニペットと ads.txt を外さない**こと。デプロイや env 変更で消えると自動的に不承認になる。
- ads.txt は `https://merken.jp/ads.txt`（wwwなし）からも到達できること（Vercel のドメインリダイレクト設定で www へ 301 されていれば OK）。
- 却下が「有用性の低いコンテンツ」の場合、P0 だけ直して即再申請しても通らない可能性が高い。P2 のコンテンツ増強後、Search Console でインデックスされたのを確認してから再申請するのが定石。
